import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assets, planRefs } from "../db/schema";
import type { RefLabel } from "./plan-checks";

/** Les références audio d'un plan qui sont la VOIX d'un personnage (son master, chantier voix/master 2026-10-14) : des refs « dérivées » du
 * dialogue, déclarées sans avoir à être citées une à une (`verifierCoherenceRefs`). Un bruitage (asset `sfx`) n'en fait pas partie. */
export async function getVoixDuPlan(planId: number): Promise<RefLabel[]> {
  const lignes = await db
    .select({ slot: planRefs.slot })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(and(eq(planRefs.planId, planId), eq(planRefs.type, "audio"), eq(assets.type, "personnage")));
  return lignes.map((l) => ({ type: "audio" as const, slot: l.slot }));
}
