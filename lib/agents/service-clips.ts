import type { Portee, PlanPourFiche, Resultat, ContexteUtilise, DecisionsIteration } from "./types";
import { db } from "../../db";
import { plans, episodes, planPromptSections, planRefs, jobs, scenes, propositions, assets, propositionChangements } from "../../db/schema";
import { eq, asc, and, inArray, sql, count, isNotNull } from "drizzle-orm";
import { attentesFiches } from "../h3ir/engine-db";
import { type EntreeH3ir, SKILL_H3IR } from "../h3ir/result";
import { creerRun } from "./runs";
import { cleSousTachePlan } from "./sheets";
import { entreeReferencesPlan, entreeIterationPlan } from "./context";
import { SKILL_REFERENCES_PLAN } from "./references-clip";
import { type ManquantRetenu, SKILL_ASSETS_MANQUANTS, brutsManquants } from "../h3ir/preparation";
import { enregistrerChangements, appliquerProposition } from "./proposal-db";
import { DUREE_GENERATION_MIN, DUREE_GENERATION_MAX } from "../clips/clip-checks";
import { estCreativite, styleCameraOuNull } from "../h3ir/settings";
import { referencesApresDecisions } from "../h3ir/brief-clip";
import { preparerDepart } from "../h3ir/retouch";
import { conversationParUuid } from "./service-conversation";
import { CONSIGNE_FICHE, CONSIGNE_REFERENCES, ERR, refusSiTacheActive } from "./service-shared";
import { nouvelleProposition } from "./service-proposals";

/** The clips of a scope (project, episode or a clip) that can be offered for writing their sheet, in
 * reading order, with what they already have: filled sections, references, render, lines of dialogue. A clip
 * with no filled section is "à écrire" (ticked outright); the others, when chosen, will go into overwrite. */
async function plansPourFiches(projectId: number, portee: Portee, cibleId: number | null): Promise<PlanPourFiche[]> {
  if (portee === "asset") return [];
  const tous = await db
    .select({
      id: plans.id,
      uuid: plans.uuid,
      titre: plans.titre,
      description: plans.description,
      duree: plans.dureeGenerationSecondes,
      statut: plans.statut,
      episodeId: plans.episodeId,
      sceneId: plans.sceneId,
      epNumero: episodes.numero,
      epTitre: episodes.titre,
    })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .where(eq(plans.projectId, projectId))
    .orderBy(asc(episodes.numero), asc(plans.ordre), asc(plans.id));
  // The displayed rank is the clip's rank in ITS episode (F03: a position, never an identifier).
  const rangs = new Map<number, number>();
  const parEpisode = new Map<number, number>();
  for (const p of tous) {
    const n = (parEpisode.get(p.episodeId) ?? 0) + 1;
    parEpisode.set(p.episodeId, n);
    rangs.set(p.id, n);
  }
  const lignes = tous.filter((p) =>
    portee === "plan" ? p.id === cibleId : portee === "episode" ? p.episodeId === cibleId : true,
  );
  if (lignes.length === 0) return [];
  const ids = lignes.map((p) => p.id);
  const [remplies, refs, rendus, lesScenes] = await Promise.all([
    db.select({ planId: planPromptSections.planId }).from(planPromptSections).where(and(inArray(planPromptSections.planId, ids), sql`length(trim(${planPromptSections.contenu})) > 0`)),
    db.select({ planId: planRefs.planId, n: count() }).from(planRefs).where(and(inArray(planRefs.planId, ids), eq(planRefs.type, "picture"))).groupBy(planRefs.planId),
    db.select({ planId: jobs.planId }).from(jobs).where(and(inArray(jobs.planId, ids), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie))),
    db.select({ id: scenes.id, titre: scenes.titre }).from(scenes).where(inArray(scenes.episodeId, [...new Set(lignes.map((p) => p.episodeId))])),
  ]);
  const avecSections = new Set(remplies.map((r) => r.planId));
  const nbRefs = new Map(refs.map((r) => [r.planId, Number(r.n)]));
  const avecRendu = new Set(rendus.map((r) => r.planId));
  const titreScene = new Map(lesScenes.map((s) => [s.id, s.titre]));
  return lignes.map((p) => ({
    uuid: p.uuid,
    titre: p.titre,
    rang: rangs.get(p.id) ?? 0,
    episodeId: p.episodeId,
    episodeLibelle: `Épisode ${p.epNumero} · ${p.epTitre}`,
    sceneTitre: p.sceneId != null ? (titreScene.get(p.sceneId) ?? null) : null,
    dureeSecondes: p.duree,
    aDesSections: avecSections.has(p.id),
    nbRefs: nbRefs.get(p.id) ?? 0,
    aUnRendu: p.statut === "previsualise" || p.statut === "termine" || avecRendu.has(p.id),
    sansIntention: !(p.description ?? "").trim(),
  }));
}

/** Step 3: COMPILE a clip's sheet (scope `plan`: a simple proposal) or the sheets of an episode's or the project's clips (a BATCH: one
 * subtask per clip, key `plan:<uuid>`, one after the other in the queue). By default, the clips WITHOUT a sheet; `planUuids` chooses (and allows
 * recompiling a sheet: it goes into the "risque d'écrasement" section, unticked unless requested).
 *
 * Engine: Open H3 IR (virtual skill `plan-h3ir`, worker/h3ir.ts). It compiles from the references set on the clip: a clip that does not yet have its
 * references, or whose image is missing, is NOT compiled here (it must first be prepared: lib/h3ir/preparation.ts, which the "Générer la
 * fiche" requests lead to, lib/tasks/requests-*.ts). In a batch, these clips are left aside and named in the context; alone, they are refused with the reason. */
export async function genererFiches(
  conversationUuid: string,
  options: {
    planUuids?: string[];
    consigne?: string;
    /** The "Générer la fiche" request that posts this task (single clip). */
    demandeId?: number;
    /** Number of shots, staging style and creativity, optional (absent: those of the clip, its scene or the project). */
    reglagesH3ir?: { shots?: number | null; director?: string | null; creativity?: string | null };
  } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number; runUuid?: string; nonPrets: string[] }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  const portee = conv.portee as Portee;
  if (portee === "asset") return ERR("Les fiches s'écrivent depuis un plan, un épisode ou le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }

  const dispo = await plansPourFiches(conv.projectId, portee, conv.cibleId);
  if (dispo.length === 0) return ERR(portee === "plan" ? "Plan introuvable." : "Aucun plan dans cette portée : écris d'abord le scénario.");
  const voulus = options.planUuids ?? (portee === "plan" ? dispo.map((p) => p.uuid) : dispo.filter((p) => !p.aDesSections).map((p) => p.uuid));
  if (voulus.length === 0) return ERR(options.planUuids ? "Coche au moins un plan." : "Tous les plans ont déjà une fiche : choisis ceux à réécrire.");
  const choisis = dispo.filter((p) => voulus.includes(p.uuid));
  if (choisis.length !== new Set(voulus).size) return ERR("Un des plans choisis n'est pas dans cette portée.");
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_FICHE;
  const attentes = await attentesFiches(conv.projectId, choisis.map((p) => p.uuid));
  const attenteDe = (uuid: string): string | null => attentes.get(uuid) ?? "état des références inconnu";
  const entreeH3ir = (planUuid: string): EntreeH3ir => ({ planUuid, shots: options.reglagesH3ir?.shots ?? null, director: options.reglagesH3ir?.director ?? null, creativity: options.reglagesH3ir?.creativity ?? null });
  const nonPrets = choisis.filter((p) => attenteDe(p.uuid)).map((p) => p.uuid);

  if (portee === "plan") {
    const plan = choisis[0]!;
    const attente = attenteDe(plan.uuid);
    if (attente) return ERR(`Open H3 IR ne peut pas encore compiler ce plan : ${attente}. « Générer la fiche » prépare d'abord ses références et leurs images.`);
    const contexte: ContexteUtilise[] = [{ type: "plan", libelle: `Plan · ${plan.titre} (Open H3 IR)`, ref: plan.uuid }];
    const propId = await nouvelleProposition(conv, { skill: SKILL_H3IR, consigne: "Fiche de plan compilée par Open H3 IR.", contexte });
    const run = await creerRun(db, { skill: SKILL_H3IR, entree: entreeH3ir(plan.uuid), but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, options: null, demandeId: options.demandeId });
    await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
    const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
    return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: 1, runUuid: run.uuid, nonPrets };
  }

  // A BATCH: one subtask per ready clip.
  const plusieursEpisodes = new Set(choisis.map((p) => p.episodeId)).size > 1;
  const sousTaches = choisis.filter((p) => !attenteDe(p.uuid));
  if (sousTaches.length === 0) {
    return ERR(nonPrets.length ? `Aucun plan prêt à compiler : ${nonPrets.length} plan${nonPrets.length > 1 ? "s attendent" : " attend"} ses références ou leurs images (« Générer la fiche » les prépare).` : "Aucun plan lisible.");
  }
  const contexte: ContexteUtilise[] = [
    { type: "plan" as const, libelle: `${sousTaches.length} fiche${sousTaches.length > 1 ? "s" : ""} de plan à compiler avec Open H3 IR, une par une` },
    ...(nonPrets.length ? [{ type: "plan" as const, libelle: `${nonPrets.length} laissé${nonPrets.length > 1 ? "s" : ""} de côté (références ou images à préparer d'abord)` }] : []),
  ];
  const propId = await nouvelleProposition(conv, { skill: "fiches", consigne, contexte, lot: true });
  for (const p of sousTaches) {
    await creerRun(db, {
      skill: SKILL_H3IR,
      entree: entreeH3ir(p.uuid),
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      options: null,
      cleSousTache: cleSousTachePlan(p.uuid),
      libelleSousTache: `${plusieursEpisodes ? `${p.episodeLibelle} · ` : ""}Plan ${String(p.rang).padStart(2, "0")} · ${p.titre} (Open H3 IR)`,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length, nonPrets };
}

/** Posts a clip's `references-plan` task (ONE per clip, only when the code's choice has a doubt: the caller has checked), in the conversation
 * of the CLIP. Its output (worker/agents/postProcessing.ts) writes the references right away, or, if missing assets must be created, makes them creations
 * that the request applies (the references are then written in the same transaction). `rechoisir`: replace references already set. */
export async function genererReferencesPlan(
  conversationUuid: string,
  options: { demandeId?: number; rechoisir?: boolean; assetsProposesParLeLot?: { code: string; type: string }[] } = {},
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("Le choix des références se demande depuis un plan.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur ce plan."); if (refus) return refus; }
  const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, conv.cibleId));
  if (!p) return ERR("Plan introuvable.");
  const e = await entreeReferencesPlan(db, conv.projectId, p.uuid, { assetsProposesParLeLot: options.assetsProposesParLeLot });
  if (!e) return ERR("Plan introuvable.");
  const contexte: ContexteUtilise[] = [...e.contexte, { type: "plan", libelle: `${e.choix.doutes.length} doute${e.choix.doutes.length > 1 ? "s" : ""} du choix automatique` }];
  const propId = await nouvelleProposition(conv, { skill: SKILL_REFERENCES_PLAN, consigne: CONSIGNE_REFERENCES, contexte });
  const run = await creerRun(db, {
    skill: SKILL_REFERENCES_PLAN,
    entree: e.entree,
    but: "proposition",
    projectId: conv.projectId,
    conversationId: conv.id,
    propositionId: propId,
    options: { planId: conv.cibleId, ...(options.rechoisir ? { rechoisir: true } : {}) },
    demandeId: options.demandeId,
  });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

/** Creates missing assets RIGHT AWAY (two at most, already kept: lib/h3ir/preparation.ts, `retenirManquants`) from a clip's conversation:
 * an `assets-manquants` proposal, applied without review ("Itérer": the assets the agent decided to create). Returns the created codes and the
 * proposal (source of the prompts). */
export async function creerAssetsManquants(
  conversationUuid: string,
  manquants: ManquantRetenu[],
): Promise<Resultat<{ propositionUuid: string | null; crees: string[] }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (manquants.length === 0) return { ok: true, propositionUuid: null, crees: [] };
  const existants = new Set((await db.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, conv.projectId), inArray(assets.code, manquants.map((m) => m.code))))).map((a) => a.code));
  const aCreer = manquants.filter((m) => !existants.has(m.code));
  if (aCreer.length === 0) return { ok: true, propositionUuid: null, crees: [] };
  const propId = await nouvelleProposition(conv, { skill: SKILL_ASSETS_MANQUANTS, consigne: "Assets manquants décidés par l'itération.", contexte: [] });
  await enregistrerChangements(db, propId, conv.projectId, { type: conv.portee as Portee, cibleId: conv.cibleId }, brutsManquants(aCreer));
  const a = await appliquerProposition(propId, { confirmeEcrasement: false });
  if (!a.ok) return ERR(`Les assets manquants n'ont pas pu être créés : ${a.erreur}`);
  const crees = (await db.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, conv.projectId), inArray(assets.code, aCreer.map((m) => m.code))))).map((x) => x.code);
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop?.uuid ?? null, crees };
}

// --- correction after viewing (iteration-plan) -------------------------------------

const MAX_RETOUR_VISIONNAGE = 4000;

/** "Corriger après visionnage" (page of a clip that has a RENDER): a simple, refinable proposal, modelled on
 * a single clip's sheet. `retour` = what the user saw (mandatory); it becomes the proposal's instruction.
 * Routing by clip state (decision 2026-10-02): without a finished render, refused (never a blind correction); without a
 * sheet, refused ("écris-la d'abord"). The contact sheet is extracted by the worker at run time, never stored. */
export async function genererIteration(
  conversationUuid: string,
  /** `planche`: attach the render's contact sheet (never by default: "Montrer au chef opérateur" checkbox, "Analyser" button). */
  options: { retour: string; renduId?: number | null; planche?: boolean; demandeId?: number },
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("La correction après visionnage se demande depuis la page d'un plan.");
  const retour = (options.retour ?? "").trim();
  if (!retour) return ERR("Dis ce que tu as vu dans le rendu : c'est le point de départ du diagnostic.");
  if (retour.length > MAX_RETOUR_VISIONNAGE) return ERR(`Ton retour est trop long (${MAX_RETOUR_VISIONNAGE} caractères au plus).`);
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur ce plan."); if (refus) return refus; }
  const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, conv.cibleId));
  if (!p) return ERR("Plan introuvable.");
  const e = await entreeIterationPlan(db, conv.projectId, p.uuid, retour, options.renduId ?? null, options.planche === true);
  if ("erreur" in e) return ERR(e.erreur);
  const propId = await nouvelleProposition(conv, { skill: "iteration-plan", consigne: retour, contexte: e.contexte });
  const run = await creerRun(db, { skill: "iteration-plan", entree: e.entree, but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, demandeId: options.demandeId });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

/** "Itérer": the sheet is ALWAYS recompiled by Open H3 IR (2026-11-09) with the iteration agent's DECISIONS (complete intent, duration,
 * references added / removed, creativity and the clip's staging style). Nothing is written here: the decisions go as an override of the brief
 * (lib/h3ir/brief-clip.ts) and are only written onto the clip with the compiled sheet, on application (postTraitement: `apres.description`,
 * `dureeGenerationSecondes`, the manifest's `refs`, `reglages`); if the compilation fails, nothing is written. The final references must all have
 * their image: the "Itérer" request (lib/tasks/requests-*.ts) first creates the missing assets decided and waits for their images (wave 4a); called too early,
 * the recompilation is refused without a task launched. */
export async function genererReecriturePlan(
  conversationUuid: string,
  /** `depuisNumero`: the attempt the user started from. When the decisions only touch the description, the instruction is played on THAT attempt's PROMPT
   * (skill `retouche-prompt`, worker/h3ir.ts) instead of a recompilation; the skill may answer "refonte", and the compilation then takes over. */
  options: { consigne: string; decisions: DecisionsIteration; demandeId?: number; depuisNumero?: number | null },
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("La recompilation d'un plan se demande depuis la page d'un plan.");
  const dec = options.decisions ?? {};
  const description = (dec.description ?? "").trim() || null;
  const duree = Number.isInteger(dec.dureeSecondes) && dec.dureeSecondes! >= DUREE_GENERATION_MIN && dec.dureeSecondes! <= DUREE_GENERATION_MAX ? dec.dureeSecondes! : null;
  const references = dec.references && dec.references.ajouter.length + dec.references.retirer.length > 0 ? { ajouter: [...dec.references.ajouter], retirer: [...dec.references.retirer] } : null;
  const creativite = dec.reglages?.creativite && estCreativite(dec.reglages.creativite) ? dec.reglages.creativite : null;
  const styleCamera = dec.reglages?.styleCamera && styleCameraOuNull(dec.reglages.styleCamera) ? dec.reglages.styleCamera : null;
  const reglagesPlan = creativite || styleCamera ? { creativite, styleCamera } : null;
  if (!description && duree == null && !references && !reglagesPlan) return ERR("L'agent n'a rien décidé de changer : rien à recompiler.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur ce plan."); if (refus) return refus; }
  const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, conv.cibleId));
  if (!p) return ERR("Plan introuvable.");
  const finales = await referencesApresDecisions(conv.projectId, p.uuid, references ?? {});
  if (!finales) return ERR("Plan introuvable.");
  if (finales.inconnus.length) return ERR(`Références inconnues du registre : ${finales.inconnus.join(", ")}. Rien n'a été écrit.`);
  if (finales.pasDesImages.length) return ERR(`Ces assets ne sont pas des images : ${finales.pasDesImages.join(", ")}. Rien n'a été écrit.`);
  if (finales.codes.length === 0) return ERR("Le plan n'aurait plus aucune image de référence : Open H3 IR ne peut pas le compiler. Rien n'a été écrit.");
  if (finales.sansImage.length) return ERR(`En attente d'images : ${finales.sansImage.join(", ")} (la recompilation part quand elles existent) ; rien n'a été écrit.`);

  // Starting from an attempt: retouch its prompt when the decisions only touch the description (lib/h3ir/retouch.ts, `preparerDepart`).
  const [essai] =
    options.depuisNumero != null && !references && !reglagesPlan && duree == null
      ? await db
          .select({ prompt: jobs.promptUtilise, description: jobs.descriptionUtilisee, duree: jobs.dureeUtilisee })
          .from(jobs)
          .where(and(eq(jobs.planId, conv.cibleId), eq(jobs.numeroRendu, options.depuisNumero)))
          .limit(1)
      : [];
  const depart = preparerDepart(
    { description, duree, references: !!references, reglages: !!reglagesPlan },
    options.depuisNumero,
    essai,
    options.consigne,
    (n) => n >= DUREE_GENERATION_MIN && n <= DUREE_GENERATION_MAX,
  );
  const retouche = depart.retouche;
  const descriptionVoulue = depart.description;
  const dureeVoulue = depart.duree;

  const entree: EntreeH3ir = {
    planUuid: p.uuid,
    shots: null,
    director: null,
    creativity: null,
    ...(descriptionVoulue ? { description: descriptionVoulue } : {}),
    ...(dureeVoulue != null ? { dureeSecondes: dureeVoulue } : {}),
    ...(references ? { references } : {}),
    ...(reglagesPlan ? { reglagesPlan } : {}),
    ...(retouche ? { retouche } : {}),
  };
  const contexte: ContexteUtilise[] = [{ type: "plan", libelle: "Décisions de l'agent d'itération, recompilées par Open H3 IR (écrites avec la fiche)", ref: p.uuid }];
  const propId = await nouvelleProposition(conv, { skill: SKILL_H3IR, consigne: options.consigne.trim(), contexte });
  const run = await creerRun(db, {
    skill: SKILL_H3IR,
    entree,
    but: "proposition",
    projectId: conv.projectId,
    conversationId: conv.id,
    propositionId: propId,
    options: { ...(descriptionVoulue ? { descriptionNouvelle: descriptionVoulue } : {}), ...(dureeVoulue != null ? { dureeNouvelle: dureeVoulue } : {}), ...(reglagesPlan ? { reglagesNouveaux: reglagesPlan } : {}) },
    demandeId: options.demandeId,
  });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

/** The assets CREATED by a sheets proposal (missing assets) that do not yet have an image prompt. */
export async function assetsCreesSansPrompt(propositionId: number): Promise<{ id: number; code: string; type: string }[]> {
  const lignes = await db
    .select({ apres: propositionChangements.apres })
    .from(propositionChangements)
    .where(
      and(
        eq(propositionChangements.propositionId, propositionId),
        eq(propositionChangements.cibleType, "asset"),
        eq(propositionChangements.operation, "creer"),
        isNotNull(propositionChangements.appliqueAt),
      ),
    );
  const codes = lignes.map((l) => (l.apres as { code?: unknown } | null)?.code).filter((c): c is string => typeof c === "string");
  if (codes.length === 0) return [];
  const [prop] = await db.select({ projectId: propositions.projectId }).from(propositions).where(eq(propositions.id, propositionId));
  if (!prop) return [];
  const lus = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, prompt: assets.promptGeneration })
    .from(assets)
    .where(and(eq(assets.projectId, prop.projectId), inArray(assets.code, codes)))
    .orderBy(asc(assets.code));
  return lus.filter((a) => !(a.prompt ?? "").trim()).map((a) => ({ id: a.id, code: a.code, type: a.type }));
}
