import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db";
import { assets, planRefs, plans } from "../../db/schema";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { refusReferences, type EtatRefsVisuelles } from "./moteur";

/** L'état réel des plans pour Open H3 IR (lib/h3ir/moteur.ts) : leurs références visuelles et la présence de leurs fichiers (les mêmes que celles
 * que lirait le brief, lib/h3ir/brief-plan.ts, sans charger les voix). */

/** L'état des références visuelles de chaque plan demandé (uuid → état ; un plan sans référence a `total: 0`). */
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

/** Pourquoi chaque plan n'est pas encore compilable par Open H3 IR (uuid → raison, ou null s'il est prêt : références posées et images présentes). */
export async function attentesFiches(projectId: number, planUuids: string[]): Promise<Map<string, string | null>> {
  const etats = await etatsRefsVisuelles(projectId, planUuids);
  return new Map(planUuids.map((u) => [u, refusReferences(etats.get(u) ?? { total: 0, sansFichier: [] })]));
}
