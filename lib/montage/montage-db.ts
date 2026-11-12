import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { montageEntrees, plans } from "../../db/schema";
import type { Tx } from "../clips/clip-order";
import { rangNouveauPlan } from "./montage";

/** Montage writes shared by the page's actions (app/montage/actions.ts) and the birth of a clip (lib/agents). The
 * rules themselves are pure, in lib/montage/montage.ts. `rang` is a position rewritten densely (0..n), never a key (F03). */

type Executant = Tx | typeof db;

/** The entries of an episode, in montage order. */
export async function entreesEpisode(x: Executant, episodeId: number) {
  return x.select().from(montageEntrees).where(eq(montageEntrees.episodeId, episodeId)).orderBy(asc(montageEntrees.rang), asc(montageEntrees.id));
}

/** Rewrites `rang` (0..n) according to the given sequence of ids, wherever it differs. */
export async function reecrireRangs(x: Executant, sequence: { id: number; rang: number }[]) {
  for (const [i, e] of sequence.entries()) {
    if (e.rang !== i) await x.update(montageEntrees).set({ rang: i }).where(eq(montageEntrees.id, e.id));
  }
}

/** An episode that has NOT yet any entry (created after the migration, or whose clips have all been deleted) receives its montage, modelled
 * on the screenplay's order: one clip = one entry, default render, whole clip. A montage cannot be emptied by hand (the page
 * keeps at least one entry), so « aucune entrée » always means « jamais commencé » (never started). */
export async function assurerMontage(episodeId: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock per episode: two simultaneous loads of the page do not duplicate the montage.
    await tx.execute(sql`select pg_advisory_xact_lock(${7_400_000 + episodeId})`);
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(montageEntrees).where(eq(montageEntrees.episodeId, episodeId));
    if ((n?.n ?? 0) > 0) return;
    const lesPlans = await tx.select({ id: plans.id }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id);
    if (lesPlans.length === 0) return;
    await tx.insert(montageEntrees).values(lesPlans.map((p, rang) => ({ episodeId, planId: p.id, rang })));
  });
}

/** A clip that has just been born enters an already started montage, at the place the screenplay gives it (`rangNouveauPlan`). Montage
 * never started: nothing (`assurerMontage` will take it with all the others at the first opening of the page). */
export async function ajouterPlanNeAuMontage(tx: Tx, episodeId: number, planId: number): Promise<void> {
  const entrees = await entreesEpisode(tx, episodeId);
  if (entrees.length === 0 || entrees.some((e) => e.planId === planId)) return;
  const scenario = (await tx.select({ id: plans.id }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id)).map((p) => p.id);
  const rang = rangNouveauPlan(entrees, scenario, planId);
  const [cree] = await tx.insert(montageEntrees).values({ episodeId, planId, rang }).returning({ id: montageEntrees.id, rang: montageEntrees.rang });
  const sequence: { id: number; rang: number }[] = [...entrees];
  sequence.splice(rang, 0, cree!);
  await reecrireRangs(tx, sequence);
}
