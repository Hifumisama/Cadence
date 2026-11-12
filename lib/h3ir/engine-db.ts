import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db";
import { assets, planRefs, plans } from "../../db/schema";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { refusReferences, type EtatRefsVisuelles } from "./engine";

/** The real state of the clips for Open H3 IR (lib/h3ir/engine.ts): their visual references and the presence of their files (the same ones
 * the brief would read, lib/h3ir/brief-clip.ts, without loading the voices). */

/** The state of the visual references of each requested clip (uuid → state; a clip without a reference has `total: 0`). */
export async function etatsRefsVisuelles(projectId: number, planUuids: string[]): Promise<Map<string, EtatRefsVisuelles>> {
  const etats = new Map<string, EtatRefsVisuelles>(planUuids.map((u) => [u, { total: 0, sansFichier: [] }]));
  if (planUuids.length === 0) return etats;
  const lignes = await db
    .select({ uuid: plans.uuid, code: assets.code, label: assets.label, fichier: assets.fichier })
    .from(planRefs)
    .innerJoin(plans, eq(plans.id, planRefs.planId))
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(and(eq(plans.projectId, projectId), inArray(plans.uuid, planUuids), ne(planRefs.type, "audio")));
  for (const l of lignes) {
    const e = etats.get(l.uuid);
    if (!e) continue;
    e.total += 1;
    if (!l.fichier || !existsSync(join(MEDIA_ROOT, cheminAssetMedia(l.fichier)))) e.sansFichier.push(l.label?.trim() || l.code);
  }
  return etats;
}

/** Why each clip cannot yet be compiled by Open H3 IR (uuid → reason, or null if it is ready: references set and images present). */
export async function attentesFiches(projectId: number, planUuids: string[]): Promise<Map<string, string | null>> {
  const etats = await etatsRefsVisuelles(projectId, planUuids);
  return new Map(planUuids.map((u) => [u, refusReferences(etats.get(u) ?? { total: 0, sansFichier: [] })]));
}
