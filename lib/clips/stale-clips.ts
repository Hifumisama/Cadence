import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { assets, jobs, planPromptSections, planRefs, plans } from "../../db/schema";
import { assemblerPrompt } from "./prompt";
import type { PromptSection } from "./clip-checks";
import { raccordPerime } from "./chains";
import { continuiteEffective } from "../renders/video-steps";
import { essaiSourceDuLatent, essaiSourceDuRaccord, planPrecedent } from "./queries-continuity";
import { raisonsContenuPerime, type RaisonPerime } from "../renders/renders";

/** A clip is « stale » when its LAST finished render is outdated:
 * - one of its references (image or sound) is later than the render: it was rendered with a version of the asset that no longer
 *   exists (no versioning, F01: adopting replaces the file);
 * - its prompt or its generation duration are no longer those the worker submitted (2026-10, episode revision: editing a
 *   sheet or a duration makes the render stale). Compared by value (`promptUtilise`, `dureeUtilisee`), not by date.
 * A clip never rendered is not stale — it has nothing outdated. A dialogue line changed first goes through « dialogues à corriger »
 * (verbatim check); the render becomes stale when the sheet is resynchronised, hence when the prompt changes. */
export type PlanPerime = {
  planId: number;
  /** Assets changed since the last render, by code. */
  codes: string[];
  /** What has changed in the clip's content since its last render (empty for the `assetId` filter). */
  raisons: RaisonPerime[];
};

type Filtre = { projectId: number } | { planIds: number[] } | { assetId: number };

/** Stale clips. `assetId`: those that cite this asset (the asset sheet) — only by their references, it is the question
 * « what does replacing this image make stale? »; `planIds`: those of the list; `projectId`: all (references AND content). */
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

  // The start of each clip's last finished render: that is when the worker read the references.
  const rendus = await db
    .select({ planId: jobs.planId, debut: jobs.startedAt, cree: jobs.createdAt, promptUtilise: jobs.promptUtilise, dureeUtilisee: jobs.dureeUtilisee, descriptionUtilisee: jobs.descriptionUtilisee, raccordJobId: jobs.raccordJobId, continuite: jobs.continuite })
    .from(jobs)
    .where(and(inArray(jobs.planId, planIds), eq(jobs.statut, "termine")))
    .orderBy(desc(jobs.finishedAt), desc(jobs.id));
  const dernierRendu = new Map<number, Date>();
  const dernierJob = new Map<number, { promptUtilise: string | null; dureeUtilisee: number | null; descriptionUtilisee: string | null; raccordJobId: number | null; continuite: string | null }>();
  for (const r of rendus) {
    if (dernierRendu.has(r.planId)) continue;
    dernierRendu.set(r.planId, r.debut ?? r.cree);
    dernierJob.set(r.planId, { promptUtilise: r.promptUtilise, dureeUtilisee: r.dureeUtilisee, descriptionUtilisee: r.descriptionUtilisee, raccordJobId: r.raccordJobId, continuite: r.continuite });
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
      db.select({ id: plans.id, duree: plans.dureeGenerationSecondes, description: plans.description, episodeId: plans.episodeId, ordre: plans.ordre, liaison: plans.liaison }).from(plans).where(inArray(plans.id, ids)),
    ]);
    // The clip's text is compared with that of the KEPT attempt when there is one (validating « prêt à upscaler » sets the clip's text to that of the attempt), otherwise with the last render.
    const retenus = await db.select({ planId: plans.id, description: jobs.descriptionUtilisee }).from(plans).innerJoin(jobs, eq(jobs.id, plans.renduRetenuId)).where(inArray(plans.id, ids));
    const descriptionRetenue = new Map(retenus.map((r) => [r.planId, r.description]));
    const sectionsParPlan = new Map<number, PromptSection[]>();
    for (const l of lignes) sectionsParPlan.set(l.planId, [...(sectionsParPlan.get(l.planId) ?? []), { section: l.section, contenu: l.contenu }]);
    const dureeParPlan = new Map(durees.map((d) => [d.id, d.duree]));
    const lienParPlan = new Map(durees.map((d) => [d.id, d]));
    for (const id of ids) {
      const sections = sectionsParPlan.get(id);
      // Without a sheet (no section filled), there is no prompt to compare.
      const prompt = sections?.some((s) => s.contenu.trim() !== "") ? assemblerPrompt(sections) : null;
      const rendu = dernierJob.get(id)!;
      const raisons = raisonsContenuPerime(
        { prompt, duree: dureeParPlan.get(id) ?? null, description: lienParPlan.get(id)?.description ?? null },
        { ...rendu, descriptionUtilisee: descriptionRetenue.has(id) ? descriptionRetenue.get(id) : rendu.descriptionUtilisee },
      );
      // Continuity: a clip in « suite » left from attempt X of the previous one; if the previous one has another render to take today, this one is to be redone
      // (never relaunched on its own: it is only flagged, docs/PLAN_FILE_CONSIGNES.md).
      const lien = lienParPlan.get(id);
      if (lien && lien.liaison === "suite" && rendu.raccordJobId != null) {
        const precedent = await planPrecedent({ episodeId: lien.episodeId, ordre: lien.ordre });
        // The same attempt that the worker would take: that of the latent for a latent continuity, that of the last image otherwise.
        const source = precedent ? await (continuiteEffective(rendu) === "latent" ? essaiSourceDuLatent(precedent) : essaiSourceDuRaccord(precedent)) : null;
        if (raccordPerime(rendu.raccordJobId, source?.id ?? null)) raisons.push("raccord");
      }
      if (raisons.length === 0) continue;
      const p = resultat.get(id) ?? { planId: id, codes: [], raisons: [] };
      p.raisons = raisons;
      resultat.set(id, p);
    }
  }
  return resultat;
}

/** Clips rendered at least once that cite this asset: those that replacing its image would make stale. */
export async function nbPlansRendusCitant(assetId: number): Promise<number> {
  const ids = (await db.select({ id: planRefs.planId }).from(planRefs).where(eq(planRefs.assetId, assetId))).map((r) => r.id);
  if (ids.length === 0) return 0;
  const rendus = await db
    .selectDistinct({ planId: jobs.planId })
    .from(jobs)
    .where(and(inArray(jobs.planId, ids), eq(jobs.statut, "termine")));
  return rendus.length;
}

/** Has the clip's sheet changed since THIS render (the preview that a final render would want to take the latent from)? Same rules as `getPlansPerimes`
 * (a reference replaced since the start of the render, the prompt or the duration different from those submitted), plus the seed: the upscale redoes the model's conditioning
 * with today's sheet, which must be that of the preview. */
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
