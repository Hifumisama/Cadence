import { and, desc, eq, inArray } from "drizzle-orm";
import { assets, episodes, jobs, planPromptSections, planPromptVersions, planRefs, plans } from "../../../db/schema";
import { horsAffiches } from "../../assets/assets-visible";
import { conserverConsigneAuteur } from "../../clips/intent";
import { assemblerPrompt } from "../../clips/prompt";
import type { Tx } from "../../clips/clip-order";
import { SECTIONS_FICHE, cleNouvelAsset, estSectionFiche, evaluerEcrasementFiche, lireApresFiche, verifierFiche, type EtatPlanFiche } from "../sheets";
import { REFUS_SUPPRESSION, type Applicateur, type Db } from "./common";

/** `fiche` target (step 3): the clip sheet, that is the H3 prompt in six sections
 * (`plan_prompt_sections`), the picture references (`plan_refs`) and the generation duration.
 * `cibleRef` = the clip's uuid; `modifier` operation only (an existing clip).
 * `apres` = { sections?, refs?, dureeGenerationSecondes? } (lib/agents/sheets.ts, `ApresFiche`):
 * - COMPLETE write (Open H3 IR): the six sections AND the references, which replace those of the clip;
 * - PARTIAL write (iteration-plan, upcoming): only some sections, without `refs`: the other
 *   sections and the references do not move.
 * Refuses any write that would leave a label without its reference, a slot out of bounds, a missing asset.
 * A draft clip moves to « en attente » (developed), as with « Développer en fiche de plan ». */

async function planParUuid(db: Db, projectId: number, uuid: string | null) {
  if (!uuid || !/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const [p] = await db
    .select({
      id: plans.id,
      titre: plans.titre,
      statut: plans.statut,
      episodeId: plans.episodeId,
      duree: plans.dureeGenerationSecondes,
    })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .where(and(eq(plans.uuid, uuid), eq(plans.projectId, projectId)));
  return p ?? null;
}

/** The state of the clip that the sheet would replace (sections, references, registry, render). */
async function lireEtatPlanFiche(db: Db, projectId: number, plan: { id: number; titre: string; statut: string; duree: number }): Promise<EtatPlanFiche> {
  const [lignes, refs, registre, rendus] = await Promise.all([
    db.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, plan.id)),
    db
      .select({ type: planRefs.type, slot: planRefs.slot, asset: assets.code })
      .from(planRefs)
      .leftJoin(assets, eq(assets.id, planRefs.assetId))
      .where(eq(planRefs.planId, plan.id)),
    db.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches)),
    db.select({ statut: jobs.statut, chemin: jobs.cheminSortie }).from(jobs).where(eq(jobs.planId, plan.id)),
  ]);
  const sections: Record<string, string> = {};
  // Several lines for the same section (old entries): we read them end to end.
  for (const l of lignes) sections[l.section] = sections[l.section] ? `${sections[l.section]}\n${l.contenu}` : l.contenu;
  return {
    titre: plan.titre,
    sections,
    refs: refs.flatMap((r) => (r.type === "audio" ? [] : [{ type: r.type, slot: r.slot, asset: r.asset }])),
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
    return p ? { type: "fiche", operation: "modifier", planId: p.id, episodeId: p.episodeId } : "Plan introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation !== "modifier") return { ...ch, refuseRaison: "Une fiche s'écrit sur un plan existant." };
    const p = await planParUuid(db, ctx.projectId, ch.cibleRef);
    if (!p) return { ...ch, refuseRaison: "Plan introuvable dans ce projet." };
    const etat = await lireEtatPlanFiche(db, ctx.projectId, p);
    const apres = lireApresFiche(ch.apres);
    // An asset that the same proposal creates does not exist yet: the sheet may cite it (it will be there when applied, see `dependDeCles`).
    for (const r of apres.refs ?? []) if (!etat.registre.has(r.asset) && ctx.clesNouvelles.has(cleNouvelAsset(r.asset))) etat.registre.set(r.asset, "oth");
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

/** The write itself, inside the application transaction. Only what `apres` carries changes. */
async function ecrireFiche(tx: Tx, projectId: number, p: { id: number; statut: string }, apres: ReturnType<typeof lireApresFiche>): Promise<void> {
  const sections = Object.entries(apres.sections ?? {}).filter(([k]) => estSectionFiche(k)) as [string, string][];
  // Open H3 IR sheet: the prompt it replaces stays in the prompt history (one can return to it from the « Prompt » drawer).
  const [derniere] = apres.moteur === "h3ir" ? await tx.select({ texte: planPromptVersions.texte }).from(planPromptVersions).where(eq(planPromptVersions.planId, p.id)).orderBy(desc(planPromptVersions.id)).limit(1) : [];
  if (apres.moteur === "h3ir") {
    const lignes = await tx.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, p.id));
    const avant = assemblerPrompt(lignes);
    if (lignes.some((l) => l.contenu.trim()) && avant !== derniere?.texte) await tx.insert(planPromptVersions).values({ planId: p.id, texte: avant, source: "avant" });
  }
  if (sections.length) {
    await tx.delete(planPromptSections).where(and(eq(planPromptSections.planId, p.id), inArray(planPromptSections.section, sections.map(([k]) => k))));
    await tx.insert(planPromptSections).values(sections.map(([section, contenu]) => ({ planId: p.id, section, ordre: SECTIONS_FICHE.indexOf(section as never), contenu })));
  }
  // A sheet always has its six sections, in canonical order (MiniMax H3 format).
  const presentes = new Set((await tx.select({ section: planPromptSections.section }).from(planPromptSections).where(eq(planPromptSections.planId, p.id))).map((l) => l.section));
  const manquantes = SECTIONS_FICHE.filter((s) => !presentes.has(s));
  if (manquantes.length) await tx.insert(planPromptSections).values(manquantes.map((section) => ({ planId: p.id, section, ordre: SECTIONS_FICHE.indexOf(section), contenu: "" })));
  if (apres.moteur === "h3ir") {
    const texte = assemblerPrompt(await tx.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, p.id)));
    const [derniereVersion] = await tx.select({ texte: planPromptVersions.texte }).from(planPromptVersions).where(eq(planPromptVersions.planId, p.id)).orderBy(desc(planPromptVersions.id)).limit(1);
    if (derniereVersion?.texte !== texte) await tx.insert(planPromptVersions).values({ planId: p.id, texte, source: "compilation" });
  }

  if (apres.refs) {
    await tx.delete(planRefs).where(and(eq(planRefs.planId, p.id), eq(planRefs.type, "picture")));
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
        })),
      );
    }
  }

  const valeurs: Partial<typeof plans.$inferInsert> = { updatedAt: new Date() };
  if (typeof apres.dureeGenerationSecondes === "number") {
    // The edit duration follows the generation duration (user feedback 2026-09-29, updatePlanParametres).
    valeurs.dureeGenerationSecondes = apres.dureeGenerationSecondes;
    valeurs.dureeMontageSecondes = apres.dureeGenerationSecondes;
  }
  // The clip's new intent (a correction that changes what happens in it): the old one stays in the previous attempt. The « Consigne de l'auteur » of the
  // current description survives if the new one no longer carries it (hidden on display, it would escape whoever rewrites the text).
  const [actuel] = await tx.select({ description: plans.description }).from(plans).where(eq(plans.id, p.id));
  if (apres.description) valeurs.description = conserverConsigneAuteur(apres.description, actuel?.description);
  // The sheet has just been written from THIS text of the clip: if it changes afterwards, the sheet must be regenerated (lib/clips/intent.ts, `intentionChangee`).
  if (sections.length > 0) valeurs.ficheDescription = valeurs.description ?? actuel?.description ?? null;
  // The Open H3 IR settings decided by « Itérer »: the new value of the CLIP replaces the old one (no directive piling up).
  if (apres.reglages?.creativite) valeurs.creativite = apres.reglages.creativite;
  if (apres.reglages?.styleCamera) valeurs.styleCamera = apres.reglages.styleCamera;
  if (p.statut === "brouillon") valeurs.statut = "en_attente"; // developed into a clip sheet (developperEnFichePlan)
  await tx.update(plans).set(valeurs).where(eq(plans.id, p.id));
}
