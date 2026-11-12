import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { montageEntrees, plans } from "../../db/schema";
import type { Tx } from "../plans/ordre-plans";
import { rangNouveauPlan } from "./montage";

/** Écritures du montage partagées par les actions de la page (app/montage/actions.ts) et la naissance d'un plan (lib/agents). Les
 * règles elles-mêmes sont pures, dans lib/montage/montage.ts. `rang` est une position réécrite densément (0..n), jamais une clé (F03). */

type Executant = Tx | typeof db;

/** Les entrées d'un épisode, dans l'ordre du montage. */
export async function entreesEpisode(x: Executant, episodeId: number) {
  return x.select().from(montageEntrees).where(eq(montageEntrees.episodeId, episodeId)).orderBy(asc(montageEntrees.rang), asc(montageEntrees.id));
}

/** Réécrit `rang` (0..n) selon la séquence d'ids donnée, là où il diffère. */
export async function reecrireRangs(x: Executant, sequence: { id: number; rang: number }[]) {
  for (const [i, e] of sequence.entries()) {
    if (e.rang !== i) await x.update(montageEntrees).set({ rang: i }).where(eq(montageEntrees.id, e.id));
  }
}

/** Un épisode qui n'a encore AUCUNE entrée (créé après la migration, ou dont tous les plans ont été supprimés) reçoit son montage, calqué
 * sur l'ordre du scénario : un plan = une entrée, rendu par défaut, plan entier. On ne peut pas vider un montage à la main (la page
 * garde au moins une entrée), donc « aucune entrée » veut toujours dire « jamais commencé ». */
export async function assurerMontage(episodeId: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Verrou par épisode : deux chargements simultanés de la page ne doublent pas le montage.
    await tx.execute(sql`select pg_advisory_xact_lock(${7_400_000 + episodeId})`);
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(montageEntrees).where(eq(montageEntrees.episodeId, episodeId));
    if ((n?.n ?? 0) > 0) return;
    const lesPlans = await tx.select({ id: plans.id }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id);
    if (lesPlans.length === 0) return;
    await tx.insert(montageEntrees).values(lesPlans.map((p, rang) => ({ episodeId, planId: p.id, rang })));
  });
}

/** Un plan qui vient de naître entre dans un montage déjà commencé, à la place que lui donne le scénario (`rangNouveauPlan`). Montage
 * jamais commencé : rien (`assurerMontage` le prendra avec tous les autres à la première ouverture de la page). */
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
