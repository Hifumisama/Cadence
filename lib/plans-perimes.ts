import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { assets, jobs, planPromptSections, planRefs, plans } from "../db/schema";
import { assemblerPrompt } from "./prompt";
import type { PromptSection } from "./plan-checks";
import { raisonsContenuPerime, type RaisonPerime } from "./rendus";

/** Un plan est « périmé » quand son DERNIER rendu terminé est dépassé :
 * - une de ses références (image ou son) est postérieure au rendu : il a été rendu avec une version de l'asset qui n'existe
 *   plus (pas de versionnage, F01 : adopter remplace le fichier) ;
 * - son prompt ou sa durée de génération ne sont plus ceux que le worker a soumis (2026-10, révision d'épisode : modifier une
 *   fiche ou une durée périme le rendu). Comparé par valeur (`promptUtilise`, `dureeUtilisee`), pas par date.
 * Un plan jamais rendu n'est pas périmé — il n'a rien de dépassé. Une réplique modifiée passe d'abord par « dialogues à corriger »
 * (contrôle verbatim) ; le rendu devient périmé quand la fiche est resynchronisée, donc que le prompt change. */
export type PlanPerime = {
  planId: number;
  /** Assets modifiés depuis le dernier rendu, par code. */
  codes: string[];
  /** Ce qui a changé dans le contenu du plan depuis son dernier rendu (vide pour le filtre `assetId`). */
  raisons: RaisonPerime[];
};

type Filtre = { projectId: number } | { planIds: number[] } | { assetId: number };

/** Plans périmés. `assetId` : ceux qui citent cet asset (la fiche d'asset) — seulement par leurs références, c'est la question
 * « que périme le remplacement de cette image ? » ; `planIds` : ceux de la liste ; `projectId` : tous (références ET contenu). */
export async function getPlansPerimes(filtre: Filtre): Promise<Map<number, PlanPerime>> {
  let planIds: number[];
  if ("planIds" in filtre) planIds = filtre.planIds;
  else if ("assetId" in filtre) {
    planIds = (await db.select({ id: planRefs.planId }).from(planRefs).where(eq(planRefs.assetId, filtre.assetId))).map((r) => r.id);
  } else {
    planIds = (await db.select({ id: plans.id }).from(plans).where(eq(plans.projectId, filtre.projectId))).map((r) => r.id);
  }
  const resultat = new Map<number, PlanPerime>();
  if (planIds.length === 0) return resultat;

  // Début du dernier rendu terminé de chaque plan : c'est à ce moment que le worker a lu les références.
  const rendus = await db
    .select({ planId: jobs.planId, debut: jobs.startedAt, cree: jobs.createdAt, promptUtilise: jobs.promptUtilise, dureeUtilisee: jobs.dureeUtilisee })
    .from(jobs)
    .where(and(inArray(jobs.planId, planIds), eq(jobs.statut, "termine")))
    .orderBy(desc(jobs.finishedAt), desc(jobs.id));
  const dernierRendu = new Map<number, Date>();
  const dernierJob = new Map<number, { promptUtilise: string | null; dureeUtilisee: number | null }>();
  for (const r of rendus) {
    if (dernierRendu.has(r.planId)) continue;
    dernierRendu.set(r.planId, r.debut ?? r.cree);
    dernierJob.set(r.planId, { promptUtilise: r.promptUtilise, dureeUtilisee: r.dureeUtilisee });
  }
  if (dernierRendu.size === 0) return resultat;

  const refs = await db
    .select({ planId: planRefs.planId, code: assets.code, fichierAt: assets.fichierAt })
    .from(planRefs)
    .innerJoin(assets, eq(planRefs.assetId, assets.id))
    .where(and(inArray(planRefs.planId, [...dernierRendu.keys()]), isNotNull(assets.fichierAt)));
  for (const ref of refs) {
    const rendu = dernierRendu.get(ref.planId);
    if (!rendu || !ref.fichierAt || ref.fichierAt <= rendu) continue;
    const p = resultat.get(ref.planId) ?? { planId: ref.planId, codes: [], raisons: [] };
    if (!p.codes.includes(ref.code)) p.codes.push(ref.code);
    resultat.set(ref.planId, p);
  }

  if (!("assetId" in filtre)) {
    const ids = [...dernierRendu.keys()];
    const [lignes, durees] = await Promise.all([
      db.select({ planId: planPromptSections.planId, section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(inArray(planPromptSections.planId, ids)),
      db.select({ id: plans.id, duree: plans.dureeGenerationSecondes }).from(plans).where(inArray(plans.id, ids)),
    ]);
    const sectionsParPlan = new Map<number, PromptSection[]>();
    for (const l of lignes) sectionsParPlan.set(l.planId, [...(sectionsParPlan.get(l.planId) ?? []), { section: l.section, contenu: l.contenu }]);
    const dureeParPlan = new Map(durees.map((d) => [d.id, d.duree]));
    for (const id of ids) {
      const sections = sectionsParPlan.get(id);
      // Sans fiche (aucune section remplie), il n'y a pas de prompt à comparer.
      const prompt = sections?.some((s) => s.contenu.trim() !== "") ? assemblerPrompt(sections) : null;
      const raisons = raisonsContenuPerime({ prompt, duree: dureeParPlan.get(id) ?? null }, dernierJob.get(id)!);
      if (raisons.length === 0) continue;
      const p = resultat.get(id) ?? { planId: id, codes: [], raisons: [] };
      p.raisons = raisons;
      resultat.set(id, p);
    }
  }
  return resultat;
}

/** Plans rendus au moins une fois qui citent cet asset : ceux que le remplacement de son image périmerait. */
export async function nbPlansRendusCitant(assetId: number): Promise<number> {
  const ids = (await db.select({ id: planRefs.planId }).from(planRefs).where(eq(planRefs.assetId, assetId))).map((r) => r.id);
  if (ids.length === 0) return 0;
  const rendus = await db
    .selectDistinct({ planId: jobs.planId })
    .from(jobs)
    .where(and(inArray(jobs.planId, ids), eq(jobs.statut, "termine")));
  return rendus.length;
}

/** La fiche du plan a-t-elle changé depuis CE rendu (la prévisualisation dont un rendu final voudrait reprendre le latent) ? Mêmes règles que `getPlansPerimes`
 * (une référence remplacée depuis le début du rendu, le prompt ou la durée différents de ceux soumis), plus la seed : l'upscale refait le conditioning du modèle
 * avec la fiche d'aujourd'hui, qui doit être celle de la prévisualisation. */
export async function ficheChangeeDepuis(
  planId: number,
  rendu: { startedAt: Date | null; createdAt: Date; promptUtilise: string | null; dureeUtilisee: number | null; seedUtilisee: string | null },
): Promise<boolean> {
  const [plan] = await db.select({ duree: plans.dureeGenerationSecondes, seed: plans.seed }).from(plans).where(eq(plans.id, planId));
  if (!plan) return true;
  if (plan.seed != null && rendu.seedUtilisee != null && plan.seed !== rendu.seedUtilisee) return true;

  const debut = rendu.startedAt ?? rendu.createdAt;
  const refs = await db
    .select({ fichierAt: assets.fichierAt })
    .from(planRefs)
    .innerJoin(assets, eq(planRefs.assetId, assets.id))
    .where(and(eq(planRefs.planId, planId), isNotNull(assets.fichierAt)));
  if (refs.some((r) => r.fichierAt != null && r.fichierAt > debut)) return true;

  const sections = await db.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, planId));
  const prompt = sections.some((s) => s.contenu.trim() !== "") ? assemblerPrompt(sections) : null;
  return raisonsContenuPerime({ prompt, duree: plan.duree ?? null }, rendu).length > 0;
}
