"use server";

import { db } from "@/db";
import { jobs, planDialogues, planPromptSections, planRefs, plans } from "@/db/schema";
import { eq, and, desc, isNotNull, max } from "drizzle-orm";
import { getPlansPerimes } from "@/lib/plans-perimes";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, MAX_REFS, WORKFLOW_IMPORT_MANUEL, controlerDialogues, resumerProblemesDialogues, verifierCoherenceRefs } from "@/lib/plan-checks";
import { getDialoguesPlan } from "@/lib/queries-repliques";
import { declarerRefDansLePrompt, retirerRefDuPlan } from "@/lib/plan-references";
import type { RefLabel } from "@/lib/plan-checks";
import { ORDRE_SECTIONS, decouperSections, extraireBlocPrompt, validerPromptColle } from "@/lib/prompt";
import { raisonNonRetenable, sectionsDuPromptEnvoye } from "@/lib/rendus";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_VIDEO, cheminPlanMedia, estVideo } from "@/lib/media";

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

/** Cœur du bouton relance (F03) et du passage nuit (CDC page 4, "queue
 * batch") : crée un NOUVEAU job en_attente plutôt que de réécrire le
 * précédent — l'historique des tentatives est la mémoire de la boucle
 * d'itération. Le worker applique ensuite le healthcheck et la distinction
 * indisponible/échec réel (F04). Ne revalide pas le cache : le batch veut
 * une seule revalidation après N plans, pas une par plan. */
async function creerJobRelance(planId: number, activerUpscale: boolean, nouvelleVariante = false) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);

  // « Relancer » garde la seed du plan : même prompt + mêmes refs + même durée = même rendu (F04). Une
  // « nouvelle variante » en tire une autre, qui devient la seed du plan.
  const seed = nouvelleVariante || !plan.seed ? tirerSeed() : plan.seed;
  const [rendus] = await db.select({ dernier: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, plan.id));

  await db.insert(jobs).values({
    planId: plan.id,
    statut: "en_attente",
    tentative: 1,
    numeroRendu: (rendus?.dernier ?? 0) + 1,
    workflowFichier: "video-generation/VID_REF2VA.json",
    seedUtilisee: seed,
    activerUpscale,
  });

  await db
    .update(plans)
    .set({ statut: "en_attente", seed, updatedAt: new Date() })
    .where(eq(plans.id, plan.id));
}

/** Une seed de plan : un entier de 15 chiffres au plus (sûr en nombre JavaScript, accepté par les nœuds de seed). */
function tirerSeed(): string {
  return String(Math.floor(Math.random() * 1_000_000_000_000_000));
}

/** Invariant verbatim (F02, révision 2026-09-30) : un plan dont les dialogues
 * ne sont pas alignés avec ses répliques ne part pas en génération — les
 * lèvres bougeraient sur un autre texte que celui qu'on montera. null = rien
 * ne bloque (ou plan sans dialogue). */
async function blocageDialogues(planId: number): Promise<string | null> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) return null;
  const { controle } = await getDialoguesPlan(plan.projectId, planId, plan.episodeId);
  return controle.ok ? null : resumerProblemesDialogues(controle.problemes);
}

/** activerUpscale distingue la prévisualisation rapide (itération de
 * prompt) du rendu final. Refusée tant que les dialogues du plan ne sont pas
 * alignés avec ses répliques (blocageDialogues). */
export async function relancerPlan(
  planId: number,
  activerUpscale: boolean,
  nouvelleVariante = false,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const blocage = await blocageDialogues(planId);
  if (blocage) return { ok: false, erreur: `Dialogues à corriger avant de générer : ${blocage}.` };
  await creerJobRelance(planId, activerUpscale, nouvelleVariante);
  revalidatePath("/", "layout");
  return { ok: true };
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
  const blocage = await blocageDialogues(planId);
  if (blocage) return { ok: false, erreur: `Dialogues à corriger avant de générer : ${blocage}.` };
  await creerJobRelance(planId, true, false);
  revalidatePath("/", "layout");
  return { ok: true };
}

export type BrouillonPlan = {
  /** Sections du prompt modifiées dans la page (nom → contenu). Seules celles-ci sont écrites. */
  sections: Record<string, string>;
  dureeGenerationSecondes?: number;
  fps?: number;
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

  const blocage = await blocageDialogues(planId);
  if (blocage) {
    revalidatePath("/", "layout");
    return { ok: false, erreur: `Figé, mais dialogues à corriger avant de générer : ${blocage}.` };
  }
  await creerJobRelance(planId, mode === "final", mode === "variante");
  const [dernier] = await db.select({ n: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, planId));
  revalidatePath("/", "layout");
  return { ok: true, numeroRendu: dernier?.n ?? 1 };
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
export async function lancerPassageNuit(episodeId: number): Promise<{ n: number; bloques: number }> {
  const aTraiter = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.episodeId, episodeId), eq(plans.statut, "previsualise")));

  // Un plan aux dialogues désalignés est sauté, pas relancé (voir relancerPlan).
  let n = 0;
  let bloques = 0;
  for (const p of aTraiter) {
    if (await blocageDialogues(p.id)) {
      bloques++;
      continue;
    }
    await creerJobRelance(p.id, true);
    n++;
  }

  revalidatePath("/", "layout");
  return { n, bloques };
}

/** « Relancer les plans périmés » (lib/plans-perimes) : un nouveau rendu pour chaque plan de l'épisode dont une référence a
 * changé depuis son dernier rendu. Chaque plan repart dans le mode de son dernier rendu (prévisualisation reste prévisualisation,
 * final reste final) et avec sa seed — seule la référence change. Sont sautés : les plans déjà en file ou en cours, et ceux aux
 * dialogues désalignés. */
export async function relancerPlansPerimes(episodeId: number): Promise<{ n: number; bloques: number; dejaEnFile: number }> {
  const episode = await db.select({ id: plans.id, statut: plans.statut }).from(plans).where(eq(plans.episodeId, episodeId));
  const perimes = episode.length ? await getPlansPerimes({ planIds: episode.map((p) => p.id) }) : new Map();

  let n = 0;
  let bloques = 0;
  let dejaEnFile = 0;
  for (const p of episode) {
    if (!perimes.has(p.id)) continue;
    if (p.statut === "en_attente" || p.statut === "en_cours") {
      dejaEnFile++;
      continue;
    }
    if (await blocageDialogues(p.id)) {
      bloques++;
      continue;
    }
    const [dernier] = await db.select({ upscale: jobs.activerUpscale }).from(jobs).where(eq(jobs.planId, p.id)).orderBy(desc(jobs.id)).limit(1);
    await creerJobRelance(p.id, dernier?.upscale ?? true);
    n++;
  }

  revalidatePath("/", "layout");
  return { n, bloques, dejaEnFile };
}

/** FPS et durée de génération, éditables depuis la Fiche de plan — le mode
 * reste toujours full-reference (CDC), pas d'édition prévue pour lui. La
 * durée de montage est toujours égale à la durée de génération (retour
 * utilisateur 2026-09-29) : on la resynchronise ici. */
export async function updatePlanParametres(
  planId: number,
  valeurs: { fps: number; dureeGenerationSecondes: number },
) {
  await db
    .update(plans)
    .set({
      fps: valeurs.fps,
      dureeGenerationSecondes: valeurs.dureeGenerationSecondes,
      dureeMontageSecondes: valeurs.dureeGenerationSecondes,
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  revalidatePath("/", "layout");
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

  // Les répliques liées occupent des slots <Audio N> (la voix prime sur les
  // bruitages, F02) : ils comptent dans le maximum et dans la numérotation.
  const slotsRepliques =
    type === "audio"
      ? (await db.select({ slot: planDialogues.slot }).from(planDialogues).where(eq(planDialogues.planId, planId))).map((d) => d.slot)
      : [];

  if (existantes.length + slotsRepliques.length >= MAX_REFS[type]) return;
  if (existantes.some((r) => r.assetId === assetId)) return;

  const prochainSlot = [...existantes.map((r) => r.slot), ...slotsRepliques].reduce((acc, n) => Math.max(acc, n), 0) + 1;

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
        repliquesNonTrouvees: string[];
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
  const [refs, { liaisons, audioRefs }] = await Promise.all([
    db
      .select({ type: planRefs.type, slot: planRefs.slot })
      .from(planRefs)
      .where(eq(planRefs.planId, planId)),
    getDialoguesPlan(plan.projectId, planId, plan.episodeId),
  ]);

  // Les voix (audioRefs) sont des refs dérivées : déclarées, jamais « non citées » (voir verifierCoherenceRefs).
  const { labelsOrphelins, refsNonCitees } = verifierCoherenceRefs(sectionsPourControle, refs, audioRefs);
  const repliquesNonTrouvees = controlerDialogues(
    sectionsPourControle,
    liaisons.map((l) => ({ id: l.id, texte: l.texte, audioPresent: l.fichier != null, priseObsolete: l.priseObsolete })),
  )
    .problemes.flatMap((p) => (p.type === "absente" || p.type === "differente" ? [p.texte] : []));

  return {
    ok: true,
    sections,
    avertissements: { labelsOrphelins, refsNonCitees, repliquesNonTrouvees },
  };
}

/** Écrase les 6 sections du plan avec le contenu d'un prompt H3 collé en
 * bloc — alternative à la saisie section par section (voir
 * PromptSectionEditor), pour ne pas retaper à la main un prompt déjà rédigé
 * ailleurs (skill fiche-de-plan). Refuse tout ou rien : jamais d'écriture
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

  await db.update(plans).set({ statut: "termine", updatedAt: new Date() }).where(eq(plans.id, planId));

  revalidatePath("/", "layout");
}
