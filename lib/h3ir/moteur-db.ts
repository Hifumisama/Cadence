import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../db";
import { assets, planRefs, plans } from "../../db/schema";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { choisirMoteurFiche, moteurParDefaut, type ChoixMoteur, type DemandeMoteur, type EtatRefsVisuelles } from "./moteur";

/** Le choix du moteur de fiche (lib/h3ir/moteur.ts) avec l'état réel des plans : leurs références visuelles et la présence de leurs fichiers
 * (les mêmes que celles que lirait le brief, lib/h3ir/brief-plan.ts, sans charger les voix). */

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

/** Le moteur de chaque plan. `demande` absente : le défaut de l'application (`auto`, ou `plan-h3` par `CADENCE_MOTEUR_FICHE`). */
export async function resoudreMoteursFiches(projectId: number, planUuids: string[], demande?: DemandeMoteur): Promise<Map<string, ChoixMoteur>> {
  const voulu = demande ?? moteurParDefaut();
  const etats = voulu === "auto" ? await etatsRefsVisuelles(projectId, planUuids) : new Map<string, EtatRefsVisuelles>();
  return new Map(planUuids.map((u) => [u, choisirMoteurFiche(voulu, etats.get(u) ?? { total: 0, sansFichier: [] })]));
}

export async function resoudreMoteurFiche(projectId: number, planUuid: string, demande?: DemandeMoteur): Promise<ChoixMoteur> {
  return (await resoudreMoteursFiches(projectId, [planUuid], demande)).get(planUuid)!;
}
