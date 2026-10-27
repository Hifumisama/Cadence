"use server";

import { db } from "@/db";
import { jobs, planPromptSections, planRefs, plans } from "@/db/schema";
import { eq, and, desc, inArray, isNotNull, max, ne } from "drizzle-orm";
import { creerJobRelance } from "@/lib/job-relance";
import { RESOLUTIONS_VIDEO, libelleResolution, resolutionDepuis } from "@/lib/resolution-video";
import { appliquerIterationEtGenererCore } from "@/lib/iteration-application";
import { getPlansPerimes } from "@/lib/plans-perimes";
import { classerPourPrevisualisation, consequencesSuppression, decisionIteration, essaiEnFile } from "@/lib/fiche-plan";
import { appliquerSelection, cocherChangements, genererPromptsAssetsCrees, propositionParUuid } from "@/lib/agents/service";
import { lireProposition } from "@/lib/queries-agents";
import type { Tx } from "@/lib/ordre-plans";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, MAX_REFS, WORKFLOW_IMPORT_MANUEL, verifierCoherenceRefs } from "@/lib/plan-checks";
import { getVoixDuPlan } from "@/lib/queries-voix-plan";
import { estLiaison } from "@/lib/plan-liaison";
import { declarerRefDansLePrompt, retirerRefDuPlan } from "@/lib/plan-references";
import type { RefLabel } from "@/lib/plan-checks";
import { ORDRE_SECTIONS, decouperSections, extraireBlocPrompt, validerPromptColle } from "@/lib/prompt";
import { promptDiffere, raisonNonRetenable, sectionsDuPromptEnvoye } from "@/lib/rendus";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_VIDEO, cheminPlanMedia, estVideo } from "@/lib/media";
import { assemblerPrompt } from "@/lib/prompt";

export async function updatePromptSection(
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

/** Reprend un rendu de l'historique comme référence du plan : sa seed et sa durée deviennent celles du plan, et, si on le
 * demande, son prompt est restauré. Même seed + même prompt + mêmes références + même durée = même résultat (F04) : c'est ce
 * qui permet d'upscaler EXACTEMENT la prévisualisation qu'on a choisie. */
async function appliquerRendu(planId: number, jobId: number, restaurerPrompt: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
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
    // La description du plan suit son prompt (elle est versionnée par essai) ; un essai d'avant ne l'a pas gardée : on n'y touche pas.
    if (job.descriptionUtilisee != null) await db.update(plans).set({ description: job.descriptionUtilisee, updatedAt: new Date() }).where(eq(plans.id, planId));
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

/** « Utiliser ce rendu » : le plan reprend sa seed (et sa durée, et son prompt si demandé) ; le prochain « Rendu final » ou
 * « Prévisualiser » le reproduira. */
export async function retenirRendu(planId: number, jobId: number, restaurerPrompt = false): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await appliquerRendu(planId, jobId, restaurerPrompt);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** « Rendu final avec celui-ci » : reprend ce rendu (voir `retenirRendu`) puis lance l'upscale, en une seule action. */
export async function rendreFinalAvecRendu(planId: number, jobId: number, restaurerPrompt = false): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await appliquerRendu(planId, jobId, restaurerPrompt);
  if (!r.ok) return r;
  const [plan] = await db.select({ retenu: plans.renduRetenuId }).from(plans).where(eq(plans.id, planId));
  await creerJobRelance(planId, true, false, { garderPret: plan?.retenu === jobId });
  revalidatePath("/", "layout");
  return { ok: true };
}

export type BrouillonPlan = {
  /** Sections du prompt modifiées dans la page (nom → contenu). Seules celles-ci sont écrites. */
  sections: Record<string, string>;
  dureeGenerationSecondes?: number;
  fps?: number;
  /** Résolution choisie (0,2 / 0,3 / 0,4 MP) ; absente = celle du plan. */
  megapixels?: number;
  /** Seed choisie à la main (dé de la console) ; absente = celle du plan. */
  seed?: string;
};

/** « Figer et lancer » : la Fiche de plan n'enregistre rien au fil de l'eau. Au lancement d'un rendu, le prompt et tous les
 * réglages du plan sont écrits d'un coup (c'est ce qui rend le rendu reproductible, F04), puis le job part. Les dialogues sont
 * contrôlés APRÈS l'écriture : leur contrôle lit le prompt qu'on vient de figer. Si un dialogue bloque, le brouillon reste
 * figé mais aucun rendu ne part. */
export async function figerEtLancer(
  planId: number,
  brouillon: BrouillonPlan,
  mode: "previsualiser" | "final" | "variante",
  /** Fiche de plan : la consigne de l'utilisateur et le numéro de l'essai dont on part, gardés sur l'essai créé. */
  essai: { consigne?: string | null; depuisNumero?: number | null } = {},
): Promise<{ ok: true; numeroRendu: number } | { ok: false; erreur: string }> {
  const { dureeGenerationSecondes: duree, fps, seed, megapixels } = brouillon;
  if (megapixels != null && resolutionDepuis(megapixels) == null) return { ok: false, erreur: `Résolution : ${RESOLUTIONS_VIDEO.map(libelleResolution).join(", ")} seulement.` };
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
      ...(megapixels != null ? { megapixels: resolutionDepuis(megapixels)! } : {}),
      ...(duree != null ? { dureeGenerationSecondes: duree, dureeMontageSecondes: duree } : {}),
      ...(seed != null ? { seed } : {}),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  await creerJobRelance(planId, mode === "final", mode === "variante", { consigne: essai.consigne, depuisNumero: essai.depuisNumero });
  const [dernier] = await db.select({ n: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, planId));
  revalidatePath("/", "layout");
  return { ok: true, numeroRendu: dernier?.n ?? 1 };
}

/** « Itérer » (et « Appliquer et générer » après une analyse) : la FIN de la transaction indissociable consigne → l'agent réécrit →
 * application → génération, sans confirmation (décision 2026-10-12, docs/FRICTIONS.md). La proposition `iteration-plan` est lue ici (jamais
 * crue sur parole du client), sa décision (`decisionIteration`) recalculée, puis la correction est appliquée ET l'essai créé dans UNE
 * transaction : si l'un échoue, rien n'est écrit. On applique les changements qui passent les contrôles, on garde le reste en notes sur
 * l'essai (`jobs.alertes_iteration`). Le prompt remplacé reste dans l'essai précédent (« Repartir de là »). Seuls arrêts, sans rien écrire :
 * l'agent a échoué, aucune écriture appliquable, un essai déjà en file, des dialogues à corriger. Les dialogues sont contrôlés AVANT :
 * une correction ne touche jamais aux balises `<d>` (contrôle verbatim), son application ne change donc pas leur état. */
export async function appliquerIterationEtGenerer(
  planId: number,
  propositionUuid: string,
  essai: { consigne: string | null; depuisNumero: number | null },
  /** Réglages retouchés à la main dans la page (durée, FPS, seed), écrits dans la même transaction que l'essai. */
  reglages: { dureeGenerationSecondes?: number; fps?: number; megapixels?: number; seed?: string } = {},
): Promise<{ ok: true; numeroRendu: number; notes: string[] } | { ok: false; erreur: string }> {
  const r = await appliquerIterationEtGenererCore(planId, propositionUuid, essai, reglages);
  revalidatePath("/", "layout");
  return r;
}

/** Écrit les sections modifiées sans lancer de rendu : appelé avant d'ajouter ou de retirer une référence, car ces deux
 * gestes réécrivent le prompt côté serveur (déclaration, renumérotation) et écraseraient un brouillon non figé. */
export async function ecrireSections(planId: number, sections: Record<string, string>) {
  for (const [section, contenu] of Object.entries(sections)) {
    if ((ORDRE_SECTIONS as readonly string[]).includes(section)) await updatePromptSection(planId, section, contenu);
  }
}

/** Passage nuit (CDC page 4, "Contrôle de la queue batch : déclenchement du
 * passage nuit (upscale en masse)") : relance en rendu final tous les plans
 * de l'épisode encore en "previsualise" — un plan dont la dernière
 * génération a réussi sans upscale, donc déjà jugé bon à l'œil (F03) mais
 * jamais passé en rendu final. Ne touche à rien d'autre : un plan encore
 * `en_attente`/`echoue` n'a pas eu son aller-retour de validation, ce
 * n'est pas ce bouton qui doit le faire avancer. */
export async function lancerPassageNuit(episodeId: number): Promise<{ n: number }> {
  const aTraiter = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.episodeId, episodeId), eq(plans.statut, "previsualise")))
    .orderBy(plans.ordre, plans.id); // dans l'ordre : voir lancerPrevisualisations

  let n = 0;
  for (const p of aTraiter) {
    await creerJobRelance(p.id, true, false, { garderPret: true });
    n++;
  }

  revalidatePath("/", "layout");
  return { n };
}

/** Classement des plans d'un épisode pour « Toutes les prévisualisations » : `neufs` (développés, sans aucun rendu terminé : ils partent
 * d'office), `avecRendu` (au moins un rendu terminé : il faut l'accord de l'utilisateur pour en refaire un), `dejaEnFile` (un rendu attend
 * ou tourne déjà) et `brouillons` (fiche pas encore développée : ni l'un ni l'autre). */
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
  /** Rang dans l'épisode (« 04 ») : ce qu'on affiche, jamais un identifiant. */
  position: number;
  titre: string;
  /** `neuf` : aucun rendu, part d'office ; `rendu` : en a déjà un (à cocher pour le refaire) ; `en_file` : un rendu attend ou tourne ; `bloque` : dialogues à corriger. */
  etat: "neuf" | "rendu" | "en_file" | "bloque";
  raison: string | null;
};

/** Les plans de l'épisode tels que la fenêtre « Toutes les prévisualisations » les liste, pour choisir ce qu'on (re)rend. Les brouillons
 * (fiche pas développée) n'y figurent pas. */
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

/** Lance une prévisualisation (sans upscale, seed du plan) pour les plans choisis dans la fenêtre. Le choix est l'accord : un plan qui a
 * déjà un rendu et qu'on a coché en reçoit un NOUVEAU (l'historique garde les anciens). Revérifié ici, au moment de lancer : un plan
 * devenu « en file » entre-temps est sauté. */
export async function lancerPrevisualisations(
  episodeId: number,
  planUuids: string[],
): Promise<{ n: number; dejaEnFile: number }> {
  const c = await classerPourPrevisualisations(episodeId);
  // Dans l'ordre de l'épisode : le worker prend les essais dans l'ordre de création, et un plan en liaison « suite » prend la dernière image du rendu
  // de son précédent (lib/plan-raccord.ts) : le précédent doit passer avant.
  const choisis = planUuids.length ? await db.select({ id: plans.id }).from(plans).where(and(eq(plans.episodeId, episodeId), inArray(plans.uuid, planUuids))).orderBy(plans.ordre, plans.id) : [];
  let n = 0;
  let dejaEnFile = 0;
  for (const { id } of choisis) {
    if (!c.neufs.includes(id) && !c.avecRendu.includes(id)) {
      dejaEnFile++;
      continue;
    }
    await creerJobRelance(id, false);
    n++;
  }
  revalidatePath("/", "layout");
  return { n, dejaEnFile };
}

/** « Relancer les plans périmés » (lib/plans-perimes) : un nouveau rendu pour chaque plan de l'épisode dont une référence, le prompt ou la durée
 * ont changé depuis son dernier rendu. Chaque plan repart dans le mode de son dernier rendu (prévisualisation reste prévisualisation,
 * final reste final) et avec sa seed et le prompt et la durée du plan tels qu'ils sont maintenant. Sont sautés : les plans déjà en file ou en cours. */
export async function relancerPlansPerimes(episodeId: number): Promise<{ n: number; dejaEnFile: number }> {
  const episode = await db.select({ id: plans.id, statut: plans.statut }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id); // dans l'ordre : voir lancerPrevisualisations
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
    await creerJobRelance(p.id, dernier?.upscale ?? true);
    n++;
  }

  revalidatePath("/", "layout");
  return { n, dejaEnFile };
}

/** Ajoute une référence (image/audio/vidéo) au prochain slot disponible, et la déclare dans le prompt
 * (`subject_definitions`, `retention_analysis` : lib/references.ts). Les slots sont toujours sans trou
 * (révision 2026-10-03 : un retrait renumérote, voir `supprimerRef`). */
export async function ajouterRef(
  planId: number,
  type: RefLabel["type"],
  assetId: number,
) {
  const existantes = await db
    .select()
    .from(planRefs)
    .where(and(eq(planRefs.planId, planId), eq(planRefs.type, type)));

  if (existantes.length >= MAX_REFS[type]) return;
  if (existantes.some((r) => r.assetId === assetId)) return;

  const prochainSlot = existantes.map((r) => r.slot).reduce((acc, n) => Math.max(acc, n), 0) + 1;

  await db.transaction(async (tx) => {
    await tx.insert(planRefs).values({
      planId,
      type,
      slot: prochainSlot,
      assetId,
    });
    await declarerRefDansLePrompt(tx, planId, type, prochainSlot, assetId);
  });

  revalidatePath("/", "layout");
}

/** Retire une référence : les images restantes sont renumérotées 1..n, le prompt suit (lignes de la référence
 * retirées, labels réécrits, mentions en prose remplacées par le nom de l'asset). */
export async function supprimerRef(refId: number) {
  await db.transaction((tx) => retirerRefDuPlan(tx, refId));
  revalidatePath("/", "layout");
}

type ValeursScenario = {
  titre: string;
  description: string;
  dureeMontageSecondes: number;
  /** Liaison avec le plan précédent (lib/plan-liaison.ts) ; une valeur inconnue n'écrit rien. */
  liaison?: string;
};

/** Édition des champs scénario — reste ouverte même après développement en
 * fiche de plan (retour utilisateur 2026-09-27) : rien n'empêche de revenir
 * corriger la description après coup. */
export async function updatePlanScenario(planId: number, valeurs: ValeursScenario) {
  await db
    .update(plans)
    .set({
      titre: valeurs.titre,
      description: valeurs.description || null,
      dureeMontageSecondes: valeurs.dureeMontageSecondes,
      ...(estLiaison(valeurs.liaison) ? { liaison: valeurs.liaison } : {}),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  revalidatePath("/", "layout");
}

/** Suppression protégée (révisé 2026-09-28 — remplace la "suppression
 * libre" du même jour, voir docs/FRICTIONS.md) : un plan encore cité comme
 * référence (image/audio/vidéo) ne se supprime pas tant que ces liens n'ont
 * pas été explicitement défaits — même philosophie que supprimerAsset
 * (app/assets/actions.ts). `force` saute la vérification : le plan disparaît
 * quand même, ses refs cascadent avec lui (db/schema.ts), mais jamais les
 * assets qu'elles citaient. Ses répliques liées ne sont pas touchées : seule la
 * liaison disparaît, la réplique existe par elle-même (F02, révision
 * 2026-09-30). */
export async function supprimerPlan(
  planId: number,
  plansHref: string,
  force = false,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
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
  redirect(plansHref);
}

/** Bascule un plan brouillon en fiche de plan développable : crée les 6
 * sections de prompt vides et passe le statut à en_attente — c'est ce qui
 * fait entrer le plan dans la queue Plans (F04), jamais avant. */
export async function developperEnFichePlan(planId: number) {
  const existantes = await db
    .select()
    .from(planPromptSections)
    .where(eq(planPromptSections.planId, planId));

  const SECTIONS = [
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
  ] as const;

  if (existantes.length === 0) {
    for (const [ordre, section] of SECTIONS.entries()) {
      await db.insert(planPromptSections).values({ planId, section, ordre, contenu: "" });
    }
  }

  await db
    .update(plans)
    .set({ statut: "en_attente", updatedAt: new Date() })
    .where(eq(plans.id, planId));

  revalidatePath("/", "layout");
}

type AnalysePromptColle =
  | { ok: false; erreurs: string[] }
  | {
      ok: true;
      sections: Record<(typeof ORDRE_SECTIONS)[number], string>;
      avertissements: {
        labelsOrphelins: string[];
        refsNonCitees: string[];
      };
    };

/** Lit un prompt H3 collé en bloc sans rien écrire : sert d'aperçu avant
 * "Remplacer les 6 sections" (voir PromptImportColle). Les contrôles
 * mécaniques (F02/F03) tournent sur le texte collé mais ne bloquent jamais
 * l'import — on peut vouloir coller avant d'avoir fini le tableau de
 * dialogues. */
export async function analyserPromptColle(
  planId: number,
  brut: string,
): Promise<AnalysePromptColle> {
  const texte = extraireBlocPrompt(brut);
  const { erreurs } = validerPromptColle(texte);
  if (erreurs.length > 0) return { ok: false, erreurs };

  const sections = decouperSections(texte);
  const sectionsPourControle = ORDRE_SECTIONS.map((section) => ({
    section,
    contenu: sections[section],
  }));

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) return { ok: false, erreurs: ["plan introuvable"] };
  const [refs, audioRefs] = await Promise.all([
    db
      .select({ type: planRefs.type, slot: planRefs.slot })
      .from(planRefs)
      .where(eq(planRefs.planId, planId)),
    getVoixDuPlan(planId),
  ]);

  // Les voix (audioRefs) sont des refs dérivées : déclarées, jamais « non citées » (voir verifierCoherenceRefs).
  const { labelsOrphelins, refsNonCitees } = verifierCoherenceRefs(sectionsPourControle, refs, audioRefs);

  return {
    ok: true,
    sections,
    avertissements: { labelsOrphelins, refsNonCitees },
  };
}

/** Écrase les 6 sections du plan avec le contenu d'un prompt H3 collé en
 * bloc — alternative à la saisie section par section (voir
 * PromptSectionEditor), pour ne pas retaper à la main un prompt déjà rédigé
 * ailleurs. Refuse tout ou rien : jamais d'écriture
 * partielle si une section manque ou est en double. */
export async function importerPromptColle(
  planId: number,
  brut: string,
): Promise<{ ok: true } | { ok: false; erreurs: string[] }> {
  const texte = extraireBlocPrompt(brut);
  const { erreurs } = validerPromptColle(texte);
  if (erreurs.length > 0) return { ok: false, erreurs };

  const sections = decouperSections(texte);
  for (const section of ORDRE_SECTIONS) {
    await updatePromptSection(planId, section, sections[section]);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Rattache une vidéo déjà tournée (hors pipeline ComfyUI) à un plan, pour
 * traçabilité — retour utilisateur 2026-09-30 : certains plans de l'épisode
 * sont déjà réalisés et doivent apparaître comme tels plutôt que rester
 * "à générer". Crée un job "termine" marqué WORKFLOW_IMPORT_MANUEL (pas de
 * seed, pas de comfyuiPromptId — ce n'est pas une génération) et fait
 * apparaître la vidéo dans l'aperçu et l'historique comme n'importe quel
 * rendu réussi. Le plan passe "termine", jamais "previsualise" : une vidéo
 * déjà tournée n'est par définition pas une prévisualisation. */
export async function importerVideoExistante(planId: number, formData: FormData) {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    throw new Error("Aucun fichier fourni.");
  }
  if (fichier.size > TAILLE_MAX_UPLOAD_VIDEO) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_VIDEO / 1024 / 1024} Mo).`,
    );
  }
  const ext = extname(fichier.name) || ".mp4";
  if (!estVideo(`x${ext}`)) {
    throw new Error(`Format vidéo non reconnu (${ext}) — attendu .mp4, .webm ou .mov.`);
  }

  const [rendus] = await db.select({ dernier: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, planId));

  const nomFichier = `import-${Date.now()}${ext}`;
  const cheminComplet = join(MEDIA_ROOT, cheminPlanMedia(planId, nomFichier));
  await mkdir(join(MEDIA_ROOT, "plans", String(planId)), { recursive: true });
  await writeFile(cheminComplet, Buffer.from(await fichier.arrayBuffer()));

  await db.insert(jobs).values({
    planId,
    statut: "termine",
    numeroRendu: (rendus?.dernier ?? 0) + 1,
    activerUpscale: true,
    workflowFichier: WORKFLOW_IMPORT_MANUEL,
    cheminSortie: cheminPlanMedia(planId, nomFichier),
    finishedAt: new Date(),
  });

  await db.update(plans).set({ statut: "termine", pretUpscaleAt: null, renduRetenuId: null, updatedAt: new Date() }).where(eq(plans.id, planId));

  revalidatePath("/", "layout");
}

// --- fiche de plan « table de montage » (2026-10-12) --------------------------------------------------------------------

type Resume = { ok: true } | { ok: false; erreur: string };

/** « Prêt à upscaler » : l'essai affiché (A) devient l'essai retenu du plan. Il faut un essai terminé avec son fichier ; une vidéo
 * importée peut être validée (elle n'aura simplement pas d'upscale : pas de seed, voir `lancerUpscaleEpisode`). */
export async function validerPretUpscale(planId: number, jobId: number): Promise<Resume> {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.planId, planId)));
  if (!job) return { ok: false, erreur: "Essai introuvable pour ce plan." };
  if (job.statut !== "termine" || !job.cheminSortie) return { ok: false, erreur: "Cet essai n'est pas terminé : on ne valide qu'un essai qu'on peut regarder." };
  await db.update(plans).set({ pretUpscaleAt: new Date(), renduRetenuId: job.id, updatedAt: new Date() }).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** « Rouvrir l'itération » : le plan n'est plus prêt (l'essai retenu est oublié, les essais restent). */
export async function rouvrirIteration(planId: number): Promise<Resume> {
  await db.update(plans).set({ pretUpscaleAt: null, renduRetenuId: null, updatedAt: new Date() }).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Avant « Itérer » depuis un essai qui n'est pas le plus récent : le plan reprend le prompt, la seed et la durée de CET essai, pour que
 * la consigne s'applique à son prompt (et que l'agent regarde son rendu). Ne fait rien pour le plus récent essai, pour un import (ni
 * seed ni prompt) ni quand le prompt est déjà le bon ; le prompt de l'essai qu'on quitte reste retrouvable dans son propre essai
 * (`promptUtilise`), « Repartir de là » le rend. `restaure` dit si le prompt a été réécrit. */
export async function preparerBaseIteration(planId: number, jobId: number): Promise<{ ok: true; restaure: boolean } | { ok: false; erreur: string }> {
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
  const descriptionDiffere = base.descriptionUtilisee != null && base.descriptionUtilisee.replace(/\s+/g, " ").trim() !== (lePlan?.description ?? "").replace(/\s+/g, " ").trim();
  const restaurer = !!base.promptUtilise && (promptDiffere(assemblerPrompt(sections), base.promptUtilise) || descriptionDiffere);
  const r = await appliquerRendu(planId, jobId, restaurer);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, restaure: restaurer };
}

/** Supprime un essai du journal. Interdit tant qu'il est en file ou en cours. Cascades (voir `consequencesSuppression`) : la ligne de
 * rendu part ; son fichier vidéo aussi du stockage, sauf si un autre essai le référence ; si c'était l'essai retenu le plan n'est plus
 * prêt (retour « en itération ») ; si c'était le dernier essai le plan redevient brouillon ; la projection `plans.statut` suit. */
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

  // Un autre plan (ou une autre ligne) qui pointerait le même fichier le garde : on vérifie en base, pas seulement dans ce plan.
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
    // Jamais hors du dossier de rendus de ce plan.
    if (absolu.startsWith(resolve(MEDIA_ROOT, "plans", String(planId)))) {
      try {
        await rm(absolu, { force: true });
        fichierSupprime = true;
      } catch {
        // Le fichier reste sur le disque : la ligne est partie, c'est l'essentiel (rien ne le référence plus).
      }
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, fichierSupprime };
}

/** « Lancer l'upscale » (tous les plans prêts) : pour chaque plan prêt, reprend la seed, la durée et le prompt de son essai RETENU
 * (même seed + même prompt + mêmes références + même durée = même résultat, F04) puis lance le rendu final. Le plan reste prêt.
 * Sont sautés : un plan déjà en file, dont l'essai retenu est déjà un rendu final ou une vidéo importée (sans seed), ou aux dialogues
 * désalignés. */
export async function lancerUpscaleEpisode(episodeId: number): Promise<{ n: number; dejaFinal: number; dejaEnFile: number; bloques: number; nonPrets: number }> {
  const lignes = await db.select().from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id);
  const res = { n: 0, dejaFinal: 0, dejaEnFile: 0, bloques: 0, nonPrets: 0 };
  for (const p of lignes) {
    if (!p.pretUpscaleAt || !p.renduRetenuId) {
      res.nonPrets++;
      continue;
    }
    const duPlan = await db.select().from(jobs).where(eq(jobs.planId, p.id));
    const retenu = duPlan.find((j) => j.id === p.renduRetenuId);
    if (!retenu) {
      res.nonPrets++;
      continue;
    }
    if (duPlan.some((j) => essaiEnFile(j.statut))) {
      res.dejaEnFile++;
      continue;
    }
    // Un rendu final (activerUpscale) ou une vidéo importée (déjà tournée, sans seed) n'a rien à upscaler.
    if (retenu.activerUpscale) {
      res.dejaFinal++;
      continue;
    }
    const r = await appliquerRendu(p.id, retenu.id, !!retenu.promptUtilise);
    if (!r.ok) {
      res.bloques++;
      continue;
    }
    await creerJobRelance(p.id, true, false, { depuisNumero: retenu.numeroRendu, garderPret: true });
    res.n++;
  }
  revalidatePath("/", "layout");
  return res;
}
