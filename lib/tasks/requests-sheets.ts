import type { Resultat } from "../agents/types";
import { db } from "../../db";
import { plans, demandes, episodes, assets, agentRuns, propositions } from "../../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { etatsRefsVisuelles } from "../h3ir/engine-db";
import { type ParcoursFichePlan, type ContexteFichePlan, etapesFichePlan, type StatutDemande, etapeCouranteDemande, type EtapeDemande, avancerEtapes, renommerEtape, decisionFichePlan } from "./requests";
import { refusReferences } from "../h3ir/engine";
import { ouvrirConversation } from "../agents/service-conversation";
import { genererFiches, genererReferencesPlan } from "../agents/service-clips";
import { lireProposition } from "../agents/queries-agents";
import { cleNouvelAsset } from "../agents/sheets";
import { appliquerSelection } from "../agents/service-proposals";
import { libelleAssets, deciderReferences, deciderImages, libellePrompts, libelleImages } from "../h3ir/preparation";
import { ERREUR_ANNULEE } from "./cancellation";
import { ecrireReferencesDuSkill, attendUnPlanPrecedent, assetsCreesParLeLot, etatImagesAssets, lancerImagesAssets, codesRefsVisuelles } from "../h3ir/preparation-db";
import { choisirReferencesPlan } from "../h3ir/references-clip-db";
import { ecrireReferencesPlan } from "../h3ir/references-write";
import { genererPromptsAssets } from "../agents/service-assets";
import { ERR, LigneDemande, annuler, echouer, ecrire, lireEtapes, occupe } from "./requests-shared";

/** « Générer la fiche » of a clip (Screenplay and Clip pages, « Brief Open H3 IR » tab): ONE request, saved without review (we re-read it in the
 * clip's page). Open H3 IR ALONE (wave 4a, lib/h3ir/preparation.ts): a clip whose references all have their image goes at once to
 * compilation (fast path); otherwise the pilot PREPARES it first (references, missing assets, prompts, images), turn after turn. The compiled sheet
 * may replace an existing sheet (the click is confirmation; the old prompt stays in the history).
 * Options: `rechoisir` (re-choose the references even if the clip already has some; never by default), optional Open H3 IR settings (`shots`, `director`,
 * `creativity`: absent, those of the clip, its scene or the project). */
export async function lancerDemandeFichePlan(projectId: number, planUuid: string, options: OptionsDemandeFiche = {}): Promise<Resultat<{ demandeId: number }>> {
  const [plan] = await db.select({ id: plans.id, titre: plans.titre, statut: plans.statut }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!plan) return ERR("Plan introuvable.");
  const etat = (await etatsRefsVisuelles(projectId, [planUuid])).get(planUuid) ?? { total: 0, sansFichier: [] };
  const parcours: ParcoursFichePlan = !options.rechoisir && refusReferences(etat) == null ? "rapide" : "preparation";
  const reglagesH3ir = { shots: options.shots ?? null, director: options.director ?? null, creativity: options.creativity ?? null };
  const ouverte = await ouvrirConversation(projectId, "plan", { uuid: planUuid }, "courte");
  if (!ouverte.ok) return ouverte;
  const contexte: ContexteFichePlan = {
    titre: plan.titre,
    planUuid,
    reglagesH3ir,
    ...(parcours === "preparation" ? { preparation: options.rechoisir ? { rechoisir: true } : {} } : {}),
  };
  let demande: { id: number };
  try {
    const [d] = await db.insert(demandes).values({ projectId, type: "fiche-plan", cibleType: "plan", cibleId: plan.id, etapes: etapesFichePlan(parcours), contexte }).returning({ id: demandes.id });
    demande = d!;
  } catch {
    // The partial unique index: a request is already in progress on this plan.
    return ERR("Une demande est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  // Preparation: the pilot leads it (nothing to post now). Fast path: the task leaves at once.
  if (parcours === "preparation") return { ok: true, demandeId: demande.id };
  const g = await genererFiches(ouverte.conversationUuid, { planUuids: [planUuid], demandeId: demande.id, reglagesH3ir });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // nothing was sent: the request never existed
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

export type OptionsDemandeFiche = {
  rechoisir?: boolean;
  shots?: number | null;
  director?: string | null;
  creativity?: string | null;
};

/** The sheets of SEVERAL clips (« Écrire les fiches », and a project's creation): one request per clip, posted in the SCREENPLAY ORDER (episode,
 * then `plans.ordre`) whatever order is given. Each clip is prepared then compiled; the choice of references follows the screenplay order (a clip
 * waits for the clips before it to have their references: set continuity, assets created by a clip are visible to the next). A clip refused (request already
 * in progress…) does not stop the others: its reasons are returned. */
export async function lancerDemandesFiches(
  projectId: number,
  planUuids: string[],
  options: Omit<OptionsDemandeFiche, "moteur"> = {},
): Promise<{ lancees: number; demandeIds: number[]; erreurs: string[] }> {
  const voulus = [...new Set(planUuids)];
  const lus = voulus.length
    ? await db
        .select({ uuid: plans.uuid, numero: episodes.numero, ordre: plans.ordre, id: plans.id })
        .from(plans)
        .innerJoin(episodes, eq(episodes.id, plans.episodeId))
        .where(and(eq(plans.projectId, projectId), inArray(plans.uuid, voulus)))
    : [];
  const ordonnes = [...lus].sort((a, b) => a.numero - b.numero || a.ordre - b.ordre || a.id - b.id).map((p) => p.uuid);
  const erreurs: string[] = voulus.filter((u) => !ordonnes.includes(u)).map(() => "Plan introuvable.");
  const demandeIds: number[] = [];
  for (const uuid of ordonnes) {
    const r = await lancerDemandeFichePlan(projectId, uuid, options);
    if (r.ok) demandeIds.push(r.demandeId);
    else erreurs.push(r.erreur);
  }
  return { lancees: demandeIds.length, demandeIds, erreurs: [...new Set(erreurs)] };
}

/** Where the sheet requests stand (a project's creation thus follows its batch): status, current step, error, per request. */
export async function etatDemandesFiches(demandeIds: number[]): Promise<{ id: number; planUuid: string; statut: Exclude<StatutDemande, "en_attente">; etape: string | null; erreur: string | null }[]> {
  if (demandeIds.length === 0) return [];
  const lignes = await db.select().from(demandes).where(inArray(demandes.id, demandeIds));
  return lignes.map((d) => ({
    id: d.id,
    planUuid: (d.contexte as ContexteFichePlan).planUuid,
    statut: d.statut as Exclude<StatutDemande, "en_attente">,
    etape: etapeCouranteDemande(lireEtapes(d))?.libelle ?? null,
    erreur: d.erreur,
  }));
}

// --- the sheet of a clip: preparation then compilation (wave 4a) -------------------------------------------------------------------------

type CtxPrep = NonNullable<ContexteFichePlan["preparation"]>;

/** The codes of the assets CREATED by an applied proposal (its creations, by their key `nouvel-asset-<code>`), which exist in the registry. */
async function codesCreesPar(projectId: number, propositionUuid: string): Promise<string[]> {
  const lue = await lireProposition(propositionUuid);
  const codes = (lue?.groupes ?? []).flatMap((g) => g.changements).filter((c) => c.cibleType === "asset" && c.operation === "creer").map((c) => (c.cle ?? "").replace(PREFIXE_NOUVEL_ASSET, "")).filter(Boolean);
  if (codes.length === 0) return [];
  return (await db.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)))).map((a) => a.code);
}
const PREFIXE_NOUVEL_ASSET = cleNouvelAsset("");

/** Applies, without review, everything that passes (neither blocked nor refused) in a proposal. */
async function appliquerToutCeQuiPasse(propositionUuid: string, confirmeEcrasement: boolean): Promise<Resultat> {
  const lue = await lireProposition(propositionUuid);
  const ids = (lue?.groupes ?? []).flatMap((g) => g.changements).filter((c) => !c.bloque && !c.refuseRaison).map((c) => c.id);
  const a = await appliquerSelection(propositionUuid, { ids, confirmeEcrasement });
  return a.ok ? { ok: true } : ERR(a.erreur);
}

/** Step `references`: keep the clip's own, write those from the code, or wait / apply the `references-plan` task (doubt). */
async function avancerReferences(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[]): Promise<boolean> {
  const prep: CtxPrep = ctx.preparation ?? {};
  const finir = async (crees: string[], note: string | null) => {
    let e = avancerEtapes(renommerEtape(etapes, "references", "Choix des références"), "references", "fait");
    e = crees.length ? avancerEtapes(renommerEtape(e, "assets", libelleAssets(crees.length)), "assets", "fait") : avancerEtapes(e, "assets", "passe");
    await ecrire(d, { etapes: e, contexte: { ...ctx, preparation: { ...prep, assetsCrees: crees }, ...(note ? { notes: [...(ctx.notes ?? []), note] } : {}) } });
    return true;
  };

  if (prep.referencesRunUuid) {
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.uuid, prep.referencesRunUuid));
    if (!run) return echouer(d, "La tâche de choix des références n'existe plus.");
    if (run.statut === "en_attente" || run.statut === "en_cours") return false;
    if (run.statut === "annulee" || (run.statut === "echoue" && run.erreur === ERREUR_ANNULEE)) return annuler(d);
    if (run.statut !== "termine") return echouer(d, `Le choix des références a échoué : ${run.erreur ?? "erreur inconnue"}`);
    const [prop] = run.propositionId ? await db.select({ id: propositions.id, uuid: propositions.uuid, statut: propositions.statut, resume: propositions.resume }).from(propositions).where(eq(propositions.id, run.propositionId)) : [];
    if (!prop) return echouer(d, "La proposition du choix des références est introuvable.");
    if (prop.statut === "en_generation") return false;
    if (prop.statut === "appliquee") return finir(await codesCreesPar(d.projectId, prop.uuid), prop.resume || null);
    if (prop.statut !== "prete") return echouer(d, "Le choix des références a été abandonné (proposition annulée).");
    // All creations refused or blocked by a check: the skill's references (without these assets) are written anyway.
    const passables = ((await lireProposition(prop.uuid))?.groupes ?? []).flatMap((g) => g.changements).filter((c) => !c.bloque && !c.refuseRaison);
    if (passables.length === 0) {
      await ecrireReferencesDuSkill(db, prop.id, run.id);
      return finir([], `${prop.resume ? `${prop.resume} ` : ""}Les assets manquants proposés ont été refusés par un contrôle : à créer à la main si besoin.`);
    }
    const a = await appliquerToutCeQuiPasse(prop.uuid, false);
    if (!a.ok) return echouer(d, `Les assets manquants n'ont pas pu être créés : ${a.erreur}`);
    return finir(await codesCreesPar(d.projectId, prop.uuid), prop.resume || null);
  }

  const existantes = (await etatsRefsVisuelles(d.projectId, [ctx.planUuid])).get(ctx.planUuid)?.total ?? 0;
  const rechoisir = prep.rechoisir === true;
  const garde = existantes > 0 && !rechoisir;
  const attente = garde ? false : await attendUnPlanPrecedent(d.cibleId);
  const choix = garde || attente ? null : await choisirReferencesPlan(db, d.cibleId);
  const decision = deciderReferences({ existantes, rechoisir, precedentEnAttente: attente, choix: choix ? { suffit: choix.suffit, references: choix.references.map((r) => r.code) } : null });
  switch (decision.action) {
    case "attendre": {
      const libelle = "Choix des références (après le plan précédent)";
      if (etapes.find((e) => e.cle === "references")?.libelle === libelle) return false;
      await ecrire(d, { etapes: renommerEtape(etapes, "references", libelle) });
      return true;
    }
    case "garder": {
      const e = avancerEtapes(avancerEtapes(renommerEtape(etapes, "references", "Références déjà posées"), "references", "passe"), "assets", "passe");
      await ecrire(d, { etapes: e });
      return true;
    }
    case "ecrire": {
      const r = await ecrireReferencesPlan(db, d.cibleId, decision.codes, { remplacer: rechoisir });
      if (!r.ok && r.raison !== "deja-des-references") return echouer(d, "Aucune référence d'image n'a pu être écrite pour ce plan.");
      return finir([], r.ok ? `Références choisies par le code : ${decision.codes.join(", ")}.` : null);
    }
    case "skill": {
      const conv = await ouvrirConversation(d.projectId, "plan", { uuid: ctx.planUuid }, "courte");
      if (!conv.ok) return echouer(d, conv.erreur);
      const g = await genererReferencesPlan(conv.conversationUuid, { demandeId: d.id, rechoisir, assetsProposesParLeLot: await assetsCreesParLeLot(d.projectId, d.id) });
      if (!g.ok) return occupe(g.erreur) ? false : echouer(d, g.erreur);
      await ecrire(d, { contexte: { ...ctx, runUuid: g.runUuid, preparation: { ...prep, referencesRunUuid: g.runUuid } } });
      return true;
    }
    case "echec":
      return echouer(d, decision.erreur);
  }
}

/** The `prompts` and `images` steps, common to a clip's sheet and to « Itérer »: `codes` = the expected references (those of the clip, or those
 * the decisions will have); `prep` / `ecrirePrep`: the state kept in the request; `lancerSuite`: the compilation, once all the images are there
 * (returns false if its conversation is busy: we retry at the next turn). */
export async function avancerPromptsImages(
  d: LigneDemande,
  etapes: EtapeDemande[],
  cle: "prompts" | "images",
  codes: string[],
  prep: { promptsPropositionUuid?: string; imagesLancees?: string[] },
  ecrirePrep: (maj: { etapes?: EtapeDemande[]; prep?: { promptsPropositionUuid?: string; imagesLancees?: string[] } }) => Promise<void>,
  lancerSuite: (etapes: EtapeDemande[]) => Promise<boolean>,
): Promise<boolean> {
  if (cle === "prompts") {
    if (prep.promptsPropositionUuid) {
      const lue = await lireProposition(prep.promptsPropositionUuid);
      if (!lue) return echouer(d, "Le lot des prompts d'assets est introuvable.");
      if (lue.statut === "en_generation") return false;
      if (lue.statut === "prete") {
        const a = await appliquerToutCeQuiPasse(prep.promptsPropositionUuid, true);
        if (!a.ok) return echouer(d, `Les prompts d'assets n'ont pas pu être écrits : ${a.erreur}`);
      } else if (lue.statut !== "appliquee") {
        return echouer(d, `Les prompts d'assets n'ont pas pu être écrits : ${lue.erreur ?? "le lot a échoué"}.`);
      }
      await ecrirePrep({ etapes: avancerEtapes(etapes, "prompts", "fait") });
      return true;
    }
    const dec = deciderImages(await etatImagesAssets(d.projectId, codes, d.createdAt));
    if (dec.action === "echec") return echouer(d, dec.erreur);
    if (dec.action !== "prompts") {
      await ecrirePrep({ etapes: avancerEtapes(etapes, "prompts", "passe") });
      return true;
    }
    const ids = (await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, d.projectId), inArray(assets.code, dec.codes)))).map((a) => a.id);
    const g = await genererPromptsAssets(d.projectId, ids, { demandeId: d.id });
    if (!g.ok) return echouer(d, g.erreur);
    await ecrirePrep({ etapes: renommerEtape(etapes, "prompts", libellePrompts(g.nbSousTaches)), prep: { ...prep, promptsPropositionUuid: g.propositionUuid } });
    return true;
  }

  // images
  const dec = deciderImages(await etatImagesAssets(d.projectId, codes, d.createdAt));
  switch (dec.action) {
    case "echec":
      return echouer(d, dec.erreur);
    case "prompts":
      return echouer(d, `Pas de prompt d'image pour ${dec.codes.join(", ")} : écris-le dans sa fiche d'asset (ou importe son image), puis relance.`);
    case "pret":
      return lancerSuite(avancerEtapes(renommerEtape(etapes, "images", libelleImages(dec.total, dec.total)), "images", "fait"));
    case "attendre": {
      const lancees = dec.aLancer.length ? await lancerImagesAssets(d.projectId, dec.aLancer) : { lancees: 0, ecartes: [] };
      const libelle = libelleImages(dec.faites, dec.total);
      const changeLibelle = etapes.find((e) => e.cle === "images")?.libelle !== libelle;
      if (lancees.lancees === 0 && !changeLibelle) return false;
      const deja = prep.imagesLancees ?? [];
      const nouvelles = dec.aLancer.filter((c) => !lancees.ecartes.some((e) => e.code === c) && !deja.includes(c));
      await ecrirePrep({ etapes: renommerEtape(etapes, "images", libelle), prep: { ...prep, imagesLancees: [...deja, ...nouvelles] } });
      return true;
    }
  }
}

/** The Open H3 IR compilation of a prepared clip's sheet: the task leaves, the `compilation` step becomes the current step. */
async function poserCompilation(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[]): Promise<boolean> {
  const conv = await ouvrirConversation(d.projectId, "plan", { uuid: ctx.planUuid }, "courte");
  if (!conv.ok) return echouer(d, conv.erreur);
  const g = await genererFiches(conv.conversationUuid, { planUuids: [ctx.planUuid], demandeId: d.id, reglagesH3ir: ctx.reglagesH3ir ?? {} });
  if (!g.ok) return occupe(g.erreur) ? false : echouer(d, g.erreur);
  await ecrire(d, { etapes, contexte: { ...ctx, ...(g.runUuid ? { runUuid: g.runUuid } : {}) } });
  return true;
}

/** One turn of a clip sheet: references → assets → prompts → images → Open H3 IR compilation. */
export async function avancerFichePlan(d: LigneDemande): Promise<boolean> {
  const etapes = lireEtapes(d);
  const ctx = d.contexte as ContexteFichePlan;
  const courante = etapeCouranteDemande(etapes);
  if (!courante) {
    await ecrire(d, { statut: "termine" });
    return true;
  }
  switch (courante.cle) {
    case "references":
      return avancerReferences(d, ctx, etapes);
    case "assets":
      await ecrire(d, { etapes: avancerEtapes(etapes, "assets", "passe") });
      return true;
    case "prompts":
    case "images": {
      const codes = await codesRefsVisuelles(d.cibleId);
      if (codes.length === 0) return echouer(d, "Ce plan n'a aucune image de référence, et aucune n'a pu être choisie : nomme dans sa description qui ou quoi est à l'image (ou ajoute une référence à la main), puis relance « Générer la fiche ».");
      const prep: CtxPrep = ctx.preparation ?? {};
      return avancerPromptsImages(
        d,
        etapes,
        courante.cle,
        codes,
        prep,
        (maj) => ecrire(d, { ...(maj.etapes ? { etapes: maj.etapes } : {}), ...(maj.prep ? { contexte: { ...ctx, preparation: { ...prep, ...maj.prep } } } : {}) }),
        (suite) => poserCompilation(d, { ...ctx, preparation: prep }, suite),
      );
    }
    default:
      return avancerTacheFiche(d, ctx, etapes);
  }
}

/** The task that compiles the sheet (`compilation` step). Same wait as the additions; once the proposal is ready, we record the sheet. */
async function avancerTacheFiche(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[]): Promise<boolean> {
  const [run] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
  if (!run) return echouer(d, "La tâche de l'agent n'existe plus.");
  if (run.statut === "en_attente" || run.statut === "en_cours") return false;
  if (run.statut === "annulee" || (run.statut === "echoue" && run.erreur === ERREUR_ANNULEE)) return annuler(d);
  const prefixe = "La compilation Open H3 IR a échoué : ";
  if (run.statut !== "termine") return echouer(d, `${prefixe}${run.erreur ?? "L'agent a échoué."}`);
  const [prop] = run.propositionId ? await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, run.propositionId)) : [];
  if (!prop) return echouer(d, `${prefixe}La proposition de l'agent est introuvable.`);
  const lue = await lireProposition(prop.uuid);
  const decision = decisionFichePlan(lue);
  const fini = avancerEtapes(etapes, "compilation", "fait");
  const suite = async () => {
    await ecrire(d, { statut: "termine", etapes: fini, erreur: null });
    return true;
  };
  switch (decision.action) {
    case "attendre":
      return false;
    case "echec":
      return echouer(d, `${prefixe}${decision.erreur}`);
    case "fait":
      return suite();
    case "appliquer": {
      // The sheet and the assets it cites are kept; any other change slipped into the proposal is left out.
      // Open H3 IR replaces the existing sheet without asking again: the user's click is confirmation, and the old prompt is kept in the history.
      const a = await appliquerSelection(prop.uuid, { ids: decision.changementIds, confirmeEcrasement: true });
      if (!a.ok) return echouer(d, `${prefixe}${a.erreur}`);
      return suite();
    }
  }
}
