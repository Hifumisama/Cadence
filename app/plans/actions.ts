"use server";

import { db } from "@/db";
import { jobs, planPromptSections, planPromptVersions, planRefs, plans } from "@/db/schema";
import { eq, and, desc, inArray, isNotNull, max, ne } from "drizzle-orm";
import { creerJobRelance, DureePlanInvalide } from "@/lib/renders/job-retry";
import { appliquerIterationEtGenererCore } from "@/lib/clips/iteration-application";
import { getPlansPerimes } from "@/lib/clips/stale-clips";
import { classerPourPrevisualisation, consequencesSuppression } from "@/lib/clips/clip-sheet";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, MAX_REFS, WORKFLOW_IMPORT_MANUEL } from "@/lib/clips/clip-checks";
import { estLiaison } from "@/lib/clips/clip-link";
import { descriptionSeraitPerdue, intentionChangee, memeDescription } from "@/lib/clips/intent";
import { creativiteOuNull, styleCameraOuNull } from "@/lib/h3ir/settings";
import { declarerRefDansLePrompt, retirerRefDuPlan, roleDeLaRef } from "@/lib/clips/clip-references";
import { emplacementLibre } from "@/lib/clips/references";
import type { RefLabel } from "@/lib/clips/clip-checks";
import { ORDRE_SECTIONS, decouperSections, extraireBlocPrompt, validerPromptColle } from "@/lib/clips/prompt";
import { promptDiffere, raisonNonRetenable, sectionsDuPromptEnvoye } from "@/lib/renders/renders";
import { MEDIA_ROOT } from "@/lib/media";
import { assemblerPrompt } from "@/lib/clips/prompt";

async function updatePromptSection(
  planId: number,
  section: string,
  contenu: string,
) {
  const existing = await db
    .select()
    .from(planPromptSections)
    .where(eq(planPromptSections.planId, planId));

  const cible = existing.find((s) => s.section === section);
  if (cible) {
    await db
      .update(planPromptSections)
      .set({ contenu })
      .where(eq(planPromptSections.id, cible.id));
  } else {
    await db.insert(planPromptSections).values({
      planId,
      section,
      ordre: existing.length,
      contenu,
    });
  }
}

/** Takes a render from the history as the clip's reference: its seed and duration become the clip's, and, if asked,
 * its prompt is restored. Same seed + same prompt + same references + same duration = same result (F04): this is what
 * allows upscaling EXACTLY the preview that was chosen. */
async function appliquerRendu(planId: number, jobId: number, restaurerPrompt: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
  // Restoring also replaces the clip's text with that of the attempt: if the current text is that of no attempt (edited by hand since), it would be lost.
  // The caller (`preparerBaseIteration`) says so beforehand and only restores with the user's agreement.
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.planId, planId)));
  if (!job) return { ok: false, erreur: "Rendu introuvable pour ce plan." };
  const raison = raisonNonRetenable({
    id: job.id,
    numeroRendu: job.numeroRendu,
    statut: job.statut,
    cheminSortie: job.cheminSortie,
    seedUtilisee: job.seedUtilisee,
    dureeUtilisee: job.dureeUtilisee,
    promptUtilise: job.promptUtilise,
    activerUpscale: job.activerUpscale,
    importe: job.workflowFichier === WORKFLOW_IMPORT_MANUEL,
  });
  if (raison) return { ok: false, erreur: raison };

  if (restaurerPrompt) {
    if (!job.promptUtilise) return { ok: false, erreur: "Ce rendu n'a pas gardé son prompt." };
    const r = sectionsDuPromptEnvoye(job.promptUtilise);
    if (!r.ok) return { ok: false, erreur: `Prompt de ce rendu illisible : ${r.erreurs.join(", ")}.` };
    for (const section of ORDRE_SECTIONS) await updatePromptSection(planId, section, r.sections[section] ?? "");
    // The clip's description follows its prompt (it is versioned per attempt); an earlier attempt did not keep it: we do not touch it.
    // The restored prompt is the one compiled from this text: the sheet and the text go together again (`ficheDescription`).
    if (job.descriptionUtilisee != null) await db.update(plans).set({ description: job.descriptionUtilisee, ficheDescription: job.descriptionUtilisee, updatedAt: new Date() }).where(eq(plans.id, planId));
  }

  const duree = job.dureeUtilisee;
  const dureeValide = duree != null && Number.isInteger(duree) && duree >= DUREE_GENERATION_MIN && duree <= DUREE_GENERATION_MAX;
  await db
    .update(plans)
    .set({
      seed: job.seedUtilisee,
      ...(dureeValide ? { dureeGenerationSecondes: duree, dureeMontageSecondes: duree } : {}),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));
  return { ok: true };
}

/** A batch re-launch: a clip whose duration exceeds the ceiling is skipped (false), the others go. */
async function relancerSiPossible(...args: Parameters<typeof creerJobRelance>): Promise<boolean> {
  try {
    await creerJobRelance(...args);
    return true;
  } catch (e) {
    if (e instanceof DureePlanInvalide) return false;
    throw e;
  }
}

export type BrouillonPlan = {
  /** Prompt sections edited on the page (name → content). Only these are written. */
  sections: Record<string, string>;
  dureeGenerationSecondes?: number;
  fps?: number;
  /** Seed picked by hand (the console dice); absent = the clip's own. */
  seed?: string;
};

/** « Figer et lancer »: the Clip sheet saves nothing as it goes. When a render is launched, the prompt and all the
 * clip's settings are written at once (that is what makes the render reproducible, F04), then the job goes. The dialogue lines are
 * checked AFTER the write: their check reads the prompt that was just frozen. If a line of dialogue blocks, the draft stays
 * frozen but no render goes. */
export async function figerEtLancer(
  planId: number,
  brouillon: BrouillonPlan,
  mode: "previsualiser" | "final" | "variante",
  /** Clip sheet: the user's instruction and the number of the attempt being started from, kept on the attempt created. */
  essai: { consigne?: string | null; depuisNumero?: number | null } = {},
): Promise<{ ok: true; numeroRendu: number } | { ok: false; erreur: string }> {
  const { dureeGenerationSecondes: duree, fps, seed } = brouillon;
  if (duree != null && (!Number.isInteger(duree) || duree < DUREE_GENERATION_MIN || duree > DUREE_GENERATION_MAX)) {
    return { ok: false, erreur: `Durée de génération : entre ${DUREE_GENERATION_MIN} et ${DUREE_GENERATION_MAX} s.` };
  }
  if (fps != null && (!Number.isInteger(fps) || fps < 1)) return { ok: false, erreur: "FPS invalide." };
  if (seed != null && !/^\d{1,15}$/.test(seed)) return { ok: false, erreur: "Seed invalide : 15 chiffres au plus." };
  for (const section of Object.keys(brouillon.sections)) {
    if (!(ORDRE_SECTIONS as readonly string[]).includes(section)) return { ok: false, erreur: `Section inconnue : ${section}.` };
  }

  for (const [section, contenu] of Object.entries(brouillon.sections)) await updatePromptSection(planId, section, contenu);
  await db
    .update(plans)
    .set({
      ...(fps != null ? { fps } : {}),
      ...(duree != null ? { dureeGenerationSecondes: duree, dureeMontageSecondes: duree } : {}),
      ...(seed != null ? { seed } : {}),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  try {
    await creerJobRelance(planId, mode === "final", mode === "variante", { consigne: essai.consigne, depuisNumero: essai.depuisNumero });
  } catch (e) {
    if (e instanceof DureePlanInvalide) return { ok: false, erreur: e.message };
    throw e;
  }
  const [dernier] = await db.select({ n: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, planId));
  revalidatePath("/", "layout");
  return { ok: true, numeroRendu: dernier?.n ?? 1 };
}

/** « Itérer » (and « Appliquer et générer » after an analysis): the END of the indivisible transaction instruction → the agent rewrites →
 * application → generation, without confirmation (decision 2026-10-12, docs/FRICTIONS.md). The `iteration-plan` proposal is read here (never
 * trusted on the client's word), its decision (`decisionIteration`) recomputed, then the correction is applied AND the attempt created in ONE
 * transaction: if either fails, nothing is written. The changes that pass the checks are applied, the rest is kept as notes on
 * the attempt (`jobs.alertes_iteration`). The replaced prompt stays in the previous attempt (« Repartir de là »). The only stops, without writing anything:
 * the agent failed, no applicable write, an attempt already queued, dialogue lines to correct. The dialogue lines are checked BEFORE:
 * a correction never touches the `<d>` tags (verbatim check), so its application does not change their state. */
export async function appliquerIterationEtGenerer(
  planId: number,
  propositionUuid: string,
  essai: { consigne: string | null; depuisNumero: number | null },
  /** Settings edited by hand on the page (duration, FPS, seed), written in the same transaction as the attempt. */
  reglages: { dureeGenerationSecondes?: number; fps?: number; seed?: string } = {},
): Promise<{ ok: true; numeroRendu: number; notes: string[] } | { ok: false; erreur: string }> {
  const r = await appliquerIterationEtGenererCore(planId, propositionUuid, essai, reglages);
  revalidatePath("/", "layout");
  return r;
}

/** Writes the edited sections without launching a render: called before adding or removing a reference, because these two
 * gestures rewrite the prompt server-side (declaration, renumbering) and would overwrite an unfrozen draft. */
export async function ecrireSections(planId: number, sections: Record<string, string>) {
  for (const [section, contenu] of Object.entries(sections)) {
    if ((ORDRE_SECTIONS as readonly string[]).includes(section)) await updatePromptSection(planId, section, contenu);
  }
}

/** Night pass (CDC page 4, "Contrôle de la queue batch : déclenchement du
 * passage nuit (upscale en masse)"): re-launches as final render all the clips
 * of the episode still in "previsualise" — a clip whose last
 * generation succeeded without upscale, so already judged good by eye (F03) but
 * never moved to final render. Touches nothing else: a clip still
 * `en_attente`/`echoue` has not had its validation round trip, and
 * it is not this button that should move it forward. */
export async function lancerPassageNuit(episodeId: number): Promise<{ n: number }> {
  const aTraiter = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.episodeId, episodeId), eq(plans.statut, "previsualise")))
    .orderBy(plans.ordre, plans.id); // in order: see lancerPrevisualisations

  let n = 0;
  for (const p of aTraiter) {
    if (!(await relancerSiPossible(p.id, true, false, { garderPret: true }))) continue;
    n++;
  }

  revalidatePath("/", "layout");
  return { n };
}

/** Sorting of an episode's clips for « Toutes les prévisualisations »: `neufs` (developed, with no finished render: they go
 * automatically), `avecRendu` (at least one finished render: the user's agreement is needed to make another), `dejaEnFile` (a render is waiting
 * or already running) and `brouillons` (sheet not yet developed: neither). */
async function classerPourPrevisualisations(episodeId: number) {
  const lignes = await db.select({ id: plans.id, statut: plans.statut }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre);
  const jobsDuPlan = lignes.length
    ? await db.select({ planId: jobs.planId, statut: jobs.statut }).from(jobs).where(inArray(jobs.planId, lignes.map((l) => l.id)))
    : [];
  return classerPourPrevisualisation(
    lignes.map((l) => ({
      id: l.id,
      statut: l.statut,
      nbTermines: jobsDuPlan.filter((j) => j.planId === l.id && j.statut === "termine").length,
      nbEnFile: jobsDuPlan.filter((j) => j.planId === l.id && (j.statut === "en_attente" || j.statut === "en_cours")).length,
    })),
  );
}

export type PlanPrevisualisation = {
  uuid: string;
  /** Rank in the episode (« 04 »): what is displayed, never an identifier. */
  position: number;
  titre: string;
  /** `neuf`: no render, goes automatically; `rendu`: already has one (to tick to redo it); `en_file`: a render is waiting or running; `bloque`: dialogue to correct. */
  etat: "neuf" | "rendu" | "en_file" | "bloque";
  raison: string | null;
};

/** The episode's clips as the « Toutes les prévisualisations » window lists them, to choose what to (re)render. Drafts
 * (sheet not developed) are not included. */
export async function listerPrevisualisations(episodeId: number): Promise<PlanPrevisualisation[]> {
  const c = await classerPourPrevisualisations(episodeId);
  const toutes = await db
    .select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, statut: plans.statut })
    .from(plans)
    .where(eq(plans.episodeId, episodeId))
    .orderBy(plans.ordre, plans.id);
  const lignes: PlanPrevisualisation[] = [];
  for (const [i, p] of toutes.entries()) {
    if (p.statut === "brouillon") continue;
    const base = { uuid: p.uuid, position: i + 1, titre: p.titre };
    if (!c.neufs.includes(p.id) && !c.avecRendu.includes(p.id)) {
      lignes.push({ ...base, etat: "en_file", raison: "Un rendu attend ou tourne déjà" });
      continue;
    }
    lignes.push({ ...base, etat: c.neufs.includes(p.id) ? "neuf" : "rendu", raison: null });
  }
  return lignes;
}

/** Launches a preview (without upscale, the clip's seed) for the clips chosen in the window. The choice is the agreement: a clip that has
 * already a render and that was ticked gets a NEW one (the history keeps the old ones). Checked again here, at launch time: a clip
 * that became « en file » in the meantime is skipped. */
export async function lancerPrevisualisations(
  episodeId: number,
  planUuids: string[],
): Promise<{ n: number; dejaEnFile: number }> {
  const c = await classerPourPrevisualisations(episodeId);
  // In the episode's order: the worker takes attempts in creation order, and a clip linked as « suite » takes the last frame of the render
  // of its predecessor (lib/clips/clip-continuity.ts): the predecessor must go first.
  const choisis = planUuids.length ? await db.select({ id: plans.id }).from(plans).where(and(eq(plans.episodeId, episodeId), inArray(plans.uuid, planUuids))).orderBy(plans.ordre, plans.id) : [];
  let n = 0;
  let dejaEnFile = 0;
  for (const { id } of choisis) {
    if (!c.neufs.includes(id) && !c.avecRendu.includes(id)) {
      dejaEnFile++;
      continue;
    }
    if (!(await relancerSiPossible(id, false))) continue;
    n++;
  }
  revalidatePath("/", "layout");
  return { n, dejaEnFile };
}

/** « Relancer les plans périmés » (lib/clips/stale-clips): a new render for each clip of the episode whose reference, prompt or duration
 * has changed since its last render. Each clip restarts in the mode of its last render (preview stays preview,
 * final stays final) and with the clip's seed and the prompt and duration as they are now. Skipped: clips already queued or running. */
export async function relancerPlansPerimes(episodeId: number): Promise<{ n: number; dejaEnFile: number }> {
  const episode = await db.select({ id: plans.id, statut: plans.statut }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id); // in order: see lancerPrevisualisations
  const perimes = episode.length ? await getPlansPerimes({ planIds: episode.map((p) => p.id) }) : new Map();

  let n = 0;
  let dejaEnFile = 0;
  for (const p of episode) {
    if (!perimes.has(p.id)) continue;
    if (p.statut === "en_attente" || p.statut === "en_cours") {
      dejaEnFile++;
      continue;
    }
    const [dernier] = await db.select({ upscale: jobs.activerUpscale }).from(jobs).where(eq(jobs.planId, p.id)).orderBy(desc(jobs.id)).limit(1);
    if (!(await relancerSiPossible(p.id, dernier?.upscale ?? true))) continue;
    n++;
  }

  revalidatePath("/", "layout");
  return { n, dejaEnFile };
}

/** Adds a reference (image/audio/video) to the next free slot, and declares it in the prompt
 * (`subject_definitions`, `retention_analysis`: lib/clips/references.ts). Slots are always without gaps
 * (revision 2026-10-03: a removal renumbers, see `supprimerRef`). */
export async function ajouterRef(
  planId: number,
  type: RefLabel["type"],
  assetId: number,
  /** The chosen slot (the clicked box); images stay numbered 1..n without gaps, so it only counts for videos and audios. */
  slotVoulu?: number,
) {
  const existantes = await db
    .select()
    .from(planRefs)
    .where(and(eq(planRefs.planId, planId), eq(planRefs.type, type)));

  if (existantes.length >= MAX_REFS[type]) return;
  if (existantes.some((r) => r.assetId === assetId)) return;

  const prochainSlot = emplacementLibre(type, existantes.map((r) => r.slot), MAX_REFS[type], slotVoulu);
  if (prochainSlot == null) return;

  await db.transaction(async (tx) => {
    // Default role and retention (those the sheet would write): a reference placed by hand, or removed then put back, no longer arrives without them.
    const { role, retention } = await roleDeLaRef(tx, type, assetId);
    await tx.insert(planRefs).values({
      planId,
      type,
      slot: prochainSlot,
      assetId,
      role,
      retention,
    });
    await declarerRefDansLePrompt(tx, planId, type, prochainSlot, assetId);
  });

  revalidatePath("/", "layout");
}

/** Removes a reference: the remaining images are renumbered 1..n, the prompt follows (lines of the reference
 * removed, labels rewritten, prose mentions replaced by the asset's name). */
export async function supprimerRef(refId: number) {
  await db.transaction((tx) => retirerRefDuPlan(tx, refId));
  revalidatePath("/", "layout");
}

type ValeursScenario = {
  titre: string;
  description: string;
  /** The clip's RENDER duration, integer from DUREE_GENERATION_MIN to DUREE_GENERATION_MAX (4 to 10 s): written as both generation AND montage duration (the montage follows the render,
   * as everywhere else). Absent = not touched (an earlier duration, out of bounds, stays as is). */
  dureeSecondes?: number;
  /** Link with the previous clip (lib/clips/clip-link.ts); an unknown value writes nothing. */
  liaison?: string;
  /** Open H3 IR (lib/h3ir/settings.ts): absent = not touched; `null` or empty = the clip inherits from its scene, then from the project; style « aucun » = no style. */
  creativite?: string | null;
  styleCamera?: string | null;
};

/** Editing of the screenplay fields — stays open even after development into
 * a clip sheet (user feedback 2026-09-27): nothing prevents coming back
 * to correct the description afterwards. */
export async function updatePlanScenario(planId: number, valeurs: ValeursScenario): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const duree = valeurs.dureeSecondes;
  if (duree !== undefined && (typeof duree !== "number" || !Number.isInteger(duree) || duree < DUREE_GENERATION_MIN || duree > DUREE_GENERATION_MAX)) {
    return { ok: false, erreur: `Durée de rendu : un entier de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s.` };
  }
  await db
    .update(plans)
    .set({
      titre: valeurs.titre,
      description: valeurs.description || null,
      ...(duree !== undefined ? { dureeGenerationSecondes: duree, dureeMontageSecondes: duree } : {}),
      ...(estLiaison(valeurs.liaison) ? { liaison: valeurs.liaison } : {}),
      ...(valeurs.creativite !== undefined ? { creativite: creativiteOuNull(valeurs.creativite) } : {}),
      ...(valeurs.styleCamera !== undefined ? { styleCamera: styleCameraOuNull(valeurs.styleCamera) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Protected deletion (revised 2026-09-28 — replaces the "free deletion"
 * of the same day, see docs/FRICTIONS.md): a clip still cited as a
 * reference (image/audio/video) cannot be deleted until these links have
 * been explicitly undone — same philosophy as supprimerAsset
 * (app/assets/actions.ts). `force` skips the check: the clip disappears
 * anyway, its refs cascade with it (db/schema.ts), but never the
 * assets they cited. Its linked lines of dialogue are not touched: only the
 * link disappears, the line of dialogue exists by itself (F02, revision
 * 2026-09-30). */
export async function supprimerPlan(
  planId: number,
  plansHref: string,
  force = false,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await retirerPlan(planId, force);
  if (!r.ok) return r;
  redirect(plansHref);
}

/** The same deletion, without leaving the page (the drawer of the Scénario page: the clip disappears from the scene, we stay where we are). */
export async function retirerPlan(planId: number, force = false): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!force) {
    const [ref] = await db
      .select()
      .from(planRefs)
      .where(and(eq(planRefs.planId, planId), isNotNull(planRefs.assetId)))
      .limit(1);
    if (ref) {
      return { ok: false, erreur: "Encore des références d'asset sur ce plan — délie-les d'abord, ou force la suppression." };
    }
  }

  await db.delete(plans).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Saves the prompt as FREE TEXT (the Prompt panel of the sheet). The text is read as a complete prompt — the six sections, each under its name —
 * and replaces the clip's; if it does not read, nothing is written and the reasons are returned. Each save keeps its text in
 * the history; the very first time, the prior prompt is kept there too, so that one can return to it. */
export async function enregistrerPrompt(planId: number, brut: string): Promise<{ ok: true } | { ok: false; erreurs: string[] }> {
  const texte = extraireBlocPrompt(brut);
  const { erreurs } = validerPromptColle(texte);
  if (erreurs.length > 0) return { ok: false, erreurs };

  const avant = assemblerPrompt(await db.select().from(planPromptSections).where(eq(planPromptSections.planId, planId)));
  const sections = decouperSections(texte);
  const apres = assemblerPrompt(ORDRE_SECTIONS.map((section) => ({ section, contenu: sections[section] })));

  const [derniere] = await db.select({ texte: planPromptVersions.texte }).from(planPromptVersions).where(eq(planPromptVersions.planId, planId)).orderBy(desc(planPromptVersions.id)).limit(1);
  if (!derniere && avant.trim() && avant !== apres) await db.insert(planPromptVersions).values({ planId, texte: avant, source: "avant" });
  if (avant !== apres) {
    for (const section of ORDRE_SECTIONS) await updatePromptSection(planId, section, sections[section]);
  }
  if (!derniere || derniere.texte !== apres) await db.insert(planPromptVersions).values({ planId, texte: apres, source: "enregistrement" });

  revalidatePath("/", "layout");
  return { ok: true };
}

// --- clip sheet « table de montage » (2026-10-12) --------------------------------------------------------------------

type Resume = { ok: true } | { ok: false; erreur: string };

/** « Prêt à upscaler »: the displayed attempt (A) becomes the clip's kept attempt. It needs a finished attempt with its file; an imported video
 * can be validated (it simply will not have an upscale: no seed, see `lancerUpscaleEpisode`). */
export async function validerPretUpscale(
  planId: number,
  jobId: number,
  /** The clip's current text is that of no attempt (edited by hand): `remplacer` sets it to that of the kept attempt, `garder` validates without touching it. Without an answer, validation stops with `conflit`. */
  texte?: "remplacer" | "garder",
): Promise<{ ok: true } | { ok: false; erreur: string; conflit?: ConflitDescription }> {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.planId, planId)));
  if (!job) return { ok: false, erreur: "Essai introuvable pour ce plan." };
  if (job.statut !== "termine" || !job.cheminSortie) return { ok: false, erreur: "Cet essai n'est pas terminé : on ne valide qu'un essai qu'on peut regarder." };

  // The screenplay says what is kept for the film: the clip's text becomes that of the validated attempt (the text it started from), and the « texte modifié » alert drops.
  // A text edited by hand since, which no attempt carries, is not overwritten without the user's agreement.
  const [lePlan] = await db.select({ description: plans.description }).from(plans).where(eq(plans.id, planId));
  const valeurs: Partial<typeof plans.$inferInsert> = { pretUpscaleAt: new Date(), renduRetenuId: job.id, updatedAt: new Date() };
  if (texte !== "garder" && job.descriptionUtilisee != null && intentionChangee(lePlan?.description, job.descriptionUtilisee)) {
    if (texte !== "remplacer") {
      const essais = await db.select({ description: jobs.descriptionUtilisee }).from(jobs).where(eq(jobs.planId, planId));
      if (descriptionSeraitPerdue(lePlan?.description, job.descriptionUtilisee, essais.map((e) => e.description))) {
        return {
          ok: false,
          erreur: "Le texte du plan a été modifié depuis cet essai : le valider pour le film le remplacerait.",
          conflit: { actuelle: lePlan?.description ?? "", essai: job.descriptionUtilisee, numeroRendu: job.numeroRendu },
        };
      }
    }
    valeurs.description = job.descriptionUtilisee;
  }
  // The sheet follows the text when it is that of the kept attempt AND the clip's text is its own (whether we have just put it there or it was already there: a sheet written by a
  // path that did not note its text, `ficheDescription` lagging, is thus brought back in line). Otherwise it stays flagged « à régénérer ».
  if (job.descriptionUtilisee != null && job.promptUtilise && memeDescription(valeurs.description ?? lePlan?.description, job.descriptionUtilisee)) {
    const sections = await db.select().from(planPromptSections).where(eq(planPromptSections.planId, planId));
    if (!promptDiffere(assemblerPrompt(sections), job.promptUtilise)) valeurs.ficheDescription = job.descriptionUtilisee;
  }
  await db.update(plans).set(valeurs).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** « Rouvrir l'itération »: the clip is no longer ready (the kept attempt is forgotten, the attempts remain). */
export async function rouvrirIteration(planId: number): Promise<Resume> {
  await db.update(plans).set({ pretUpscaleAt: null, renduRetenuId: null, updatedAt: new Date() }).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The clip's current text and that of an attempt, when taking up the attempt would overwrite a text edited by hand (lib/clips/intent.ts, `descriptionSeraitPerdue`). */
export type ConflitDescription = { actuelle: string; essai: string; numeroRendu: number };

/** Before « Itérer » from an attempt that is not the most recent: the clip takes back the prompt, seed and duration of THIS attempt, so that
 * the instruction applies to its prompt (and the agent looks at its render). Does nothing for the most recent attempt, for an import (neither
 * seed nor prompt), nor when the prompt is already the right one; the prompt of the attempt being left stays findable in its own attempt
 * (`promptUtilise`), « Repartir de là » restores it. `restaure` says whether the prompt was rewritten. `confirmerDescription`: the user has seen that the clip's current text
 * (edited by hand, it is that of no attempt) will be replaced by that of the attempt; without it, the preparation stops with `conflit` rather than overwriting silently. */
export async function preparerBaseIteration(
  planId: number,
  jobId: number,
  confirmerDescription = false,
): Promise<{ ok: true; restaure: boolean } | { ok: false; erreur: string; conflit?: ConflitDescription }> {
  const lignes = await db.select().from(jobs).where(eq(jobs.planId, planId));
  const base = lignes.find((j) => j.id === jobId);
  if (!base) return { ok: false, erreur: "Essai de départ introuvable pour ce plan." };
  const lisibles = lignes.filter((j) => j.statut === "termine" && !!j.cheminSortie);
  const dernier = lisibles.reduce<(typeof lisibles)[number] | null>((m, j) => (!m || j.numeroRendu > m.numeroRendu ? j : m), null);
  if (!dernier || dernier.id === base.id) return { ok: true, restaure: false };
  const raison = raisonNonRetenable({
    id: base.id,
    numeroRendu: base.numeroRendu,
    statut: base.statut,
    cheminSortie: base.cheminSortie,
    seedUtilisee: base.seedUtilisee,
    dureeUtilisee: base.dureeUtilisee,
    promptUtilise: base.promptUtilise,
    activerUpscale: base.activerUpscale,
    importe: base.workflowFichier === WORKFLOW_IMPORT_MANUEL,
  });
  if (raison) return { ok: true, restaure: false };
  const sections = await db.select().from(planPromptSections).where(eq(planPromptSections.planId, planId));
  const [lePlan] = await db.select({ description: plans.description }).from(plans).where(eq(plans.id, planId));
  const descriptionDiffere = intentionChangee(lePlan?.description, base.descriptionUtilisee);
  const restaurer = !!base.promptUtilise && (promptDiffere(assemblerPrompt(sections), base.promptUtilise) || descriptionDiffere);
  if (restaurer && !confirmerDescription && descriptionSeraitPerdue(lePlan?.description, base.descriptionUtilisee, lignes.map((j) => j.descriptionUtilisee))) {
    return {
      ok: false,
      erreur: "Le texte du plan a été modifié depuis cet essai : repartir de l'essai le remplacerait.",
      conflit: { actuelle: lePlan?.description ?? "", essai: base.descriptionUtilisee ?? "", numeroRendu: base.numeroRendu },
    };
  }
  const r = await appliquerRendu(planId, jobId, restaurer);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, restaure: restaurer };
}

/** Deletes an attempt from the log. Forbidden while it is queued or running. Cascades (see `consequencesSuppression`): the render line
 * goes; its video file goes from storage too, unless another attempt references it; if it was the kept attempt the clip is no longer
 * ready (back to « en itération »); if it was the last attempt the clip becomes a draft again; the `plans.statut` projection follows. */
export async function supprimerEssai(planId: number, jobId: number): Promise<{ ok: true; fichierSupprime: boolean } | { ok: false; erreur: string }> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) return { ok: false, erreur: "Plan introuvable." };
  const lignes = await db.select().from(jobs).where(eq(jobs.planId, planId));
  const cible = lignes.find((j) => j.id === jobId);
  if (!cible) return { ok: false, erreur: "Essai introuvable pour ce plan." };
  const vue = (j: (typeof lignes)[number]) => ({ id: j.id, numeroRendu: j.numeroRendu, statut: j.statut, cheminSortie: j.cheminSortie, activerUpscale: j.activerUpscale });
  const c = consequencesSuppression(
    { renduRetenuId: plan.renduRetenuId, pretUpscaleAt: plan.pretUpscaleAt, statut: plan.statut },
    vue(cible),
    lignes.filter((j) => j.id !== jobId).map(vue),
  );
  if (!c.ok) return { ok: false, erreur: c.raison };

  // Another clip (or another row) pointing to the same file keeps it: we check in the database, not only within this clip.
  let supprimerFichier = c.supprimerFichier;
  if (supprimerFichier && cible.cheminSortie) {
    const [autre] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.cheminSortie, cible.cheminSortie), ne(jobs.id, cible.id))).limit(1);
    if (autre) supprimerFichier = false;
  }

  await db
    .update(plans)
    .set({ renduRetenuId: c.renduRetenuId, pretUpscaleAt: c.pretUpscaleAt, statut: c.statutPlan as typeof plan.statut, updatedAt: new Date() })
    .where(eq(plans.id, planId));
  await db.delete(jobs).where(eq(jobs.id, jobId));

  let fichierSupprime = false;
  if (supprimerFichier && cible.cheminSortie) {
    const absolu = resolve(MEDIA_ROOT, cible.cheminSortie);
    // Never outside this clip's render folder.
    if (absolu.startsWith(resolve(MEDIA_ROOT, "plans", String(planId)))) {
      try {
        await rm(absolu, { force: true });
        fichierSupprime = true;
      } catch {
        // The file stays on disk: the row is gone, which is the essential part (nothing references it any more).
      }
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, fichierSupprime };
}


