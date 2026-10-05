import { and, eq, inArray } from "drizzle-orm";
import { assets, episodes, jobs, planDialogues, planPromptSections, planRefs, plans } from "../../../db/schema";
import { horsAffiches } from "../../assets-visibles";
import type { Tx } from "../../ordre-plans";
import { SECTIONS_FICHE, estSectionFiche, evaluerEcrasementFiche, lireApresFiche, verifierFiche, type EtatPlanFiche } from "../fiches";
import { REFUS_SUPPRESSION, type Applicateur, type Db } from "./commun";

/** Cible `fiche` (étape 3) : la fiche de plan, c'est-à-dire le prompt H3 en six sections
 * (`plan_prompt_sections`), les références picture/audio (`plan_refs`) et la durée de génération.
 * `cibleRef` = uuid du plan ; opération `modifier` seulement (un plan existant).
 * `apres` = { sections?, refs?, dureeGenerationSecondes? } (lib/agents/fiches.ts, `ApresFiche`) :
 * - écriture COMPLÈTE (plan-h3) : les six sections ET les références, qui remplacent celles du plan ;
 * - écriture PARTIELLE (iteration-plan, à venir) : seulement certaines sections, sans `refs` : les autres
 *   sections et les références ne bougent pas.
 * Les voix (plan_dialogues) ne sont jamais touchées : leurs slots `<Audio N>` sont pris tels quels.
 * Refuse toute écriture qui laisserait un label sans sa référence, un slot hors limites, un asset absent.
 * Un plan brouillon passe « en attente » (développé), comme « Développer en fiche de plan ». */

async function planParUuid(db: Db, projectId: number, uuid: string | null) {
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const [p] = await db
    .select({
      id: plans.id,
      titre: plans.titre,
      statut: plans.statut,
      episodeId: plans.episodeId,
      seasonId: episodes.seasonId,
      duree: plans.dureeGenerationSecondes,
    })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .where(and(eq(plans.uuid, uuid), eq(plans.projectId, projectId)));
  return p ?? null;
}

/** L'état du plan que la fiche remplacerait (sections, références, voix, registre, rendu). */
export async function lireEtatPlanFiche(db: Db, projectId: number, plan: { id: number; titre: string; statut: string; duree: number }): Promise<EtatPlanFiche> {
  const [lignes, refs, dialogues, registre, rendus] = await Promise.all([
    db.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, plan.id)),
    db
      .select({ type: planRefs.type, slot: planRefs.slot, asset: assets.code })
      .from(planRefs)
      .leftJoin(assets, eq(assets.id, planRefs.assetId))
      .where(eq(planRefs.planId, plan.id)),
    db.select({ slot: planDialogues.slot }).from(planDialogues).where(eq(planDialogues.planId, plan.id)),
    db.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches)),
    db.select({ statut: jobs.statut, chemin: jobs.cheminSortie }).from(jobs).where(eq(jobs.planId, plan.id)),
  ]);
  const sections: Record<string, string> = {};
  // Plusieurs lignes pour une même section (saisies anciennes) : on les lit bout à bout.
  for (const l of lignes) sections[l.section] = sections[l.section] ? `${sections[l.section]}\n${l.contenu}` : l.contenu;
  return {
    titre: plan.titre,
    sections,
    refs: refs.map((r) => ({ type: r.type, slot: r.slot, asset: r.asset })),
    slotsDialogues: dialogues.map((d) => d.slot),
    registre: new Map(registre.map((a) => [a.code, a.type])),
    aUnRendu: plan.statut === "previsualise" || plan.statut === "termine" || rendus.some((j) => j.statut === "termine" && j.chemin != null),
    generationEnCours: rendus.some((j) => j.statut === "en_attente" || j.statut === "en_cours"),
    dureeGenerationSecondes: plan.duree,
  };
}

export const applicateurFiche: Applicateur = {
  cibleType: "fiche",

  async cible(db, ctx, ch) {
    if (ch.operation !== "modifier") return "Une fiche s'écrit sur un plan existant.";
    const p = await planParUuid(db, ctx.projectId, ch.cibleRef);
    return p ? { type: "fiche", operation: "modifier", planId: p.id, episodeId: p.episodeId, saisonId: p.seasonId } : "Plan introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation !== "modifier") return { ...ch, refuseRaison: "Une fiche s'écrit sur un plan existant." };
    const p = await planParUuid(db, ctx.projectId, ch.cibleRef);
    if (!p) return { ...ch, refuseRaison: "Plan introuvable dans ce projet." };
    const etat = await lireEtatPlanFiche(db, ctx.projectId, p);
    const apres = lireApresFiche(ch.apres);
    const refus = verifierFiche(apres, etat);
    const { avant, ecrase, avertissements } = evaluerEcrasementFiche(apres, etat);
    return {
      ...ch,
      avant,
      ecrase,
      avertissements: [...(ch.avertissements ?? []), ...avertissements],
      ...(refus ? { refuseRaison: refus } : {}),
    };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation !== "modifier") return "Une fiche s'écrit sur un plan existant.";
    const p = await planParUuid(tx, ctx.projectId, ch.cibleRef);
    if (!p) return "Plan introuvable dans ce projet.";
    return verifierFiche(lireApresFiche(ch.apres), await lireEtatPlanFiche(tx, ctx.projectId, p));
  },

  async appliquer(tx, ctx, ch) {
    const p = (await planParUuid(tx, ctx.projectId, ch.cibleRef))!;
    await ecrireFiche(tx, ctx.projectId, p, lireApresFiche(ch.apres));
  },
};

/** L'écriture elle-même, dans la transaction de l'application. Seul ce que porte `apres` change. */
async function ecrireFiche(tx: Tx, projectId: number, p: { id: number; statut: string }, apres: ReturnType<typeof lireApresFiche>): Promise<void> {
  const sections = Object.entries(apres.sections ?? {}).filter(([k]) => estSectionFiche(k)) as [string, string][];
  if (sections.length) {
    await tx.delete(planPromptSections).where(and(eq(planPromptSections.planId, p.id), inArray(planPromptSections.section, sections.map(([k]) => k))));
    await tx.insert(planPromptSections).values(sections.map(([section, contenu]) => ({ planId: p.id, section, ordre: SECTIONS_FICHE.indexOf(section as never), contenu })));
  }
  // Une fiche a toujours ses six sections, dans l'ordre canonique (format MiniMax H3).
  const presentes = new Set((await tx.select({ section: planPromptSections.section }).from(planPromptSections).where(eq(planPromptSections.planId, p.id))).map((l) => l.section));
  const manquantes = SECTIONS_FICHE.filter((s) => !presentes.has(s));
  if (manquantes.length) await tx.insert(planPromptSections).values(manquantes.map((section) => ({ planId: p.id, section, ordre: SECTIONS_FICHE.indexOf(section), contenu: "" })));

  if (apres.refs) {
    await tx.delete(planRefs).where(and(eq(planRefs.planId, p.id), inArray(planRefs.type, ["picture", "audio"])));
    if (apres.refs.length) {
      const codes = [...new Set(apres.refs.map((r) => r.asset))];
      const ids = new Map(
        (await tx.select({ id: assets.id, code: assets.code }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)))).map((a) => [a.code, a.id]),
      );
      await tx.insert(planRefs).values(
        apres.refs.map((r) => ({
          planId: p.id,
          type: r.type,
          slot: r.slot,
          assetId: ids.get(r.asset)!,
          role: r.role ?? null,
          retention: r.type === "audio" ? (r.retention ?? null) : null,
        })),
      );
    }
  }

  const valeurs: Partial<typeof plans.$inferInsert> = { updatedAt: new Date() };
  if (typeof apres.dureeGenerationSecondes === "number") {
    // La durée de montage suit la durée de génération (retour utilisateur 2026-09-29, updatePlanParametres).
    valeurs.dureeGenerationSecondes = apres.dureeGenerationSecondes;
    valeurs.dureeMontageSecondes = apres.dureeGenerationSecondes;
  }
  if (p.statut === "brouillon") valeurs.statut = "en_attente"; // développé en fiche de plan (developperEnFichePlan)
  await tx.update(plans).set(valeurs).where(eq(plans.id, p.id));
}
