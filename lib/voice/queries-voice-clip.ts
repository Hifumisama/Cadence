import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { assets, planRefs } from "../../db/schema";
import type { RefLabel } from "../clips/clip-checks";

/** The audio references of a clip that are a character's VOICE (its master, voice/master workstream 2026-10-14): « derived » refs of the
 * dialogue, declared without having to be cited one by one (`verifierCoherenceRefs`). */
export async function getVoixDuPlan(planId: number): Promise<RefLabel[]> {
  const lignes = await db
    .select({ slot: planRefs.slot })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(and(eq(planRefs.planId, planId), eq(planRefs.type, "audio"), eq(assets.type, "personnage")));
  return lignes.map((l) => ({ type: "audio" as const, slot: l.slot }));
}
