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

/** Reprend un rendu de l'historique comme référence du plan : sa seed et sa durée deviennent celles du plan, et, si on le
 * demande, son prompt est restauré. Même seed + même prompt + mêmes références + même durée = même résultat (F04) : c'est ce
 * qui permet d'upscaler EXACTEMENT la prévisualisation qu'on a choisie. */
async function appliquerRendu(planId: number, jobId: number, restaurerPrompt: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
  // Restaurer remplace aussi le texte du plan par celui de l'essai : si le texte actuel n'est celui d'aucun essai (modifié à la main depuis), il serait perdu.
  // L'appelant (`preparerBaseIteration`) le dit avant et ne restaure qu'avec l'accord de l'utilisateur.
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
    // Le prompt restauré est celui qui a été compilé depuis ce texte : la fiche et le texte vont de nouveau ensemble (`ficheDescription`).
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

/** Une relance en lot : un plan dont la durée dépasse le plafond est sauté (faux), les autres partent. */
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
  /** Fiche de plan : la consigne de l'utilisateur et le numéro de l'essai dont on part, gardés sur l'essai créé. */
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
  reglages: { dureeGenerationSecondes?: number; fps?: number; seed?: string } = {},
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
    if (!(await relancerSiPossible(p.id, true, false, { garderPret: true }))) continue;
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
  // de son précédent (lib/clips/clip-continuity.ts) : le précédent doit passer avant.
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

/** « Relancer les plans périmés » (lib/clips/stale-clips) : un nouveau rendu pour chaque plan de l'épisode dont une référence, le prompt ou la durée
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
    if (!(await relancerSiPossible(p.id, dernier?.upscale ?? true))) continue;
    n++;
  }

  revalidatePath("/", "layout");
  return { n, dejaEnFile };
}

/** Ajoute une référence (image/audio/vidéo) au prochain slot disponible, et la déclare dans le prompt
 * (`subject_definitions`, `retention_analysis` : lib/clips/references.ts). Les slots sont toujours sans trou
 * (révision 2026-10-03 : un retrait renumérote, voir `supprimerRef`). */
export async function ajouterRef(
  planId: number,
  type: RefLabel["type"],
  assetId: number,
  /** L'emplacement choisi (la case cliquée) ; les images restent numérotées 1..n sans trou, donc il ne compte que pour les vidéos et les audios. */
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
    // Rôle et rétention par défaut (ceux qu'écrirait la fiche) : une référence posée à la main, ou retirée puis remise, n'arrive plus sans eux.
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

/** Retire une référence : les images restantes sont renumérotées 1..n, le prompt suit (lignes de la référence
 * retirées, labels réécrits, mentions en prose remplacées par le nom de l'asset). */
export async function supprimerRef(refId: number) {
  await db.transaction((tx) => retirerRefDuPlan(tx, refId));
  revalidatePath("/", "layout");
}

type ValeursScenario = {
  titre: string;
  description: string;
  /** La durée de RENDU du plan, entier de DUREE_GENERATION_MIN à DUREE_GENERATION_MAX (4 à 10 s) : écrite comme durée de génération ET de montage (le montage suit le rendu,
   * comme partout ailleurs). Absente = on n'y touche pas (une durée d'avant, hors bornes, reste telle quelle). */
  dureeSecondes?: number;
  /** Liaison avec le plan précédent (lib/clips/clip-link.ts) ; une valeur inconnue n'écrit rien. */
  liaison?: string;
  /** Open H3 IR (lib/h3ir/settings.ts) : absents = on n'y touche pas ; `null` ou vide = le plan hérite de sa scène, puis du projet ; style « aucun » = pas de style. */
  creativite?: string | null;
  styleCamera?: string | null;
};

/** Édition des champs scénario — reste ouverte même après développement en
 * fiche de plan (retour utilisateur 2026-09-27) : rien n'empêche de revenir
 * corriger la description après coup. */
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
  const r = await retirerPlan(planId, force);
  if (!r.ok) return r;
  redirect(plansHref);
}

/** La même suppression, sans quitter la page (le tiroir de la page Scénario : le plan disparaît de la scène, on reste où l'on est). */
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

/** Enregistre le prompt en TEXTE LIBRE (le panneau Prompt de la fiche). Le texte est lu comme un prompt complet — les six sections, chacune sous son nom —
 * et remplace celles du plan ; s'il ne se lit pas, rien n'est écrit et les raisons sont rendues. Chaque enregistrement garde son texte dans
 * l'historique ; la toute première fois, le prompt d'avant y est gardé aussi, pour qu'on puisse y revenir. */
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

// --- fiche de plan « table de montage » (2026-10-12) --------------------------------------------------------------------

type Resume = { ok: true } | { ok: false; erreur: string };

/** « Prêt à upscaler » : l'essai affiché (A) devient l'essai retenu du plan. Il faut un essai terminé avec son fichier ; une vidéo
 * importée peut être validée (elle n'aura simplement pas d'upscale : pas de seed, voir `lancerUpscaleEpisode`). */
export async function validerPretUpscale(
  planId: number,
  jobId: number,
  /** Le texte actuel du plan n'est celui d'aucun essai (modifié à la main) : `remplacer` le met à celui de l'essai retenu, `garder` valide sans y toucher. Sans réponse, la validation s'arrête avec `conflit`. */
  texte?: "remplacer" | "garder",
): Promise<{ ok: true } | { ok: false; erreur: string; conflit?: ConflitDescription }> {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.planId, planId)));
  if (!job) return { ok: false, erreur: "Essai introuvable pour ce plan." };
  if (job.statut !== "termine" || !job.cheminSortie) return { ok: false, erreur: "Cet essai n'est pas terminé : on ne valide qu'un essai qu'on peut regarder." };

  // Le scénario dit ce qu'on retient pour le film : le texte du plan devient celui de l'essai validé (le texte dont il est parti), et l'alerte « texte modifié » tombe.
  // Un texte retouché à la main depuis, qu'aucun essai ne porte, ne s'écrase pas sans l'accord de l'utilisateur.
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
  // La fiche suit le texte quand elle est celle de l'essai retenu ET que le texte du plan est le sien (qu'on vienne de l'y mettre ou qu'il y fût déjà : une fiche écrite par un
  // chemin qui n'a pas noté son texte, `ficheDescription` en retard, est ainsi remise d'accord). Sinon elle reste signalée « à régénérer ».
  if (job.descriptionUtilisee != null && job.promptUtilise && memeDescription(valeurs.description ?? lePlan?.description, job.descriptionUtilisee)) {
    const sections = await db.select().from(planPromptSections).where(eq(planPromptSections.planId, planId));
    if (!promptDiffere(assemblerPrompt(sections), job.promptUtilise)) valeurs.ficheDescription = job.descriptionUtilisee;
  }
  await db.update(plans).set(valeurs).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** « Rouvrir l'itération » : le plan n'est plus prêt (l'essai retenu est oublié, les essais restent). */
export async function rouvrirIteration(planId: number): Promise<Resume> {
  await db.update(plans).set({ pretUpscaleAt: null, renduRetenuId: null, updatedAt: new Date() }).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Le texte actuel du plan et celui d'un essai, quand reprendre l'essai écraserait un texte modifié à la main (lib/clips/intent.ts, `descriptionSeraitPerdue`). */
export type ConflitDescription = { actuelle: string; essai: string; numeroRendu: number };

/** Avant « Itérer » depuis un essai qui n'est pas le plus récent : le plan reprend le prompt, la seed et la durée de CET essai, pour que
 * la consigne s'applique à son prompt (et que l'agent regarde son rendu). Ne fait rien pour le plus récent essai, pour un import (ni
 * seed ni prompt) ni quand le prompt est déjà le bon ; le prompt de l'essai qu'on quitte reste retrouvable dans son propre essai
 * (`promptUtilise`), « Repartir de là » le rend. `restaure` dit si le prompt a été réécrit. `confirmerDescription` : l'utilisateur a vu que le texte actuel du plan
 * (modifié à la main, il n'est celui d'aucun essai) sera remplacé par celui de l'essai ; sans lui, la préparation s'arrête avec `conflit` plutôt que d'écraser en silence. */
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


