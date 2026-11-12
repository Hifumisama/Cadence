import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, assets, briefs, plans, propositions } from "../../db/schema";
import { horsAffiches } from "../../lib/assets/assets-visible";
import { sortieVersBrief } from "../../lib/agents/brief";
import { ecrireBrouillon } from "../../lib/agents/brief-db";
import { entreeTour, messageBriefPret } from "../../lib/agents/brief-input";
import { appliquerNotes, detailsAPreciser, ficheComplete, manquesEssentiels, manquesFiche } from "../../lib/agents/sheet";
import { ficheCourante, enregistrerFiche } from "../../lib/agents/sheet-db";
import { informationsFormat } from "../../lib/projects/design";
import { lireConception } from "../../lib/projects/design-db";
import { creerRun } from "../../lib/agents/runs";
import { ecrireAfficheEtGenerer } from "../../lib/agents/poster-clap";
import { BUT_ESSAI, ecrireEssaiTraduit, terminerEssaiSansPrompt } from "../../lib/agents/asset-attempt";
import { VARIANTE_AFFICHE } from "../../lib/llm/variants";
import type { ChangementBrut } from "../../lib/agents/changes";
import {
  depuisCorrectionPlan,
  depuisPlanAInserer,
  depuisPromptAffiche,
  depuisPromptAsset,
  depuisRegistreAsset,
  depuisScenarioEpisode,
  depuisSceneAInserer,
  depuisScenarioScene,
  depuisTraitement,
  type EpisodeCourant,
  type SortiePromptAffiche,
  type SortiePromptAsset,
  type SortieScenarioEpisode,
  type SortieScenarioScene,
  type SortieTraitement,
} from "../../lib/agents/conversion";
import { finaliserLot, runsDuLot } from "../../lib/agents/batches";
import { PAS_ORDRE_SOUS_TACHE, episodeIdDeCle, groupeEpisode, rangSousTache, sceneIdDeCle } from "../../lib/agents/batches-pure";
import { traitementDeScene } from "../../lib/agents/treatment";
import { entreeScenarioEpisode } from "../../lib/agents/context";
import { codeDeCleAsset } from "../../lib/agents/registry";
import { enregistrerChangements } from "../../lib/agents/proposal-db";
import type { PlaceScene, Position } from "../../lib/agents/types";
import type { Tx } from "../../lib/clips/clip-order";
import { planUuidDeCle } from "../../lib/agents/sheets";
import { depuisRelecture, type EntreeRelecture, type SortieRelecture } from "../../lib/agents/review";
import { scenes } from "../../db/schema";
import { depuisInventaire, type OptionsRunInventaire, type SortieInventaire } from "../../lib/agents/inventory";
import { assetsACreer, ecrireReferencesDesTaches, phraseBilan } from "../../lib/agents/inventory-db";
import { lireVueEpisode } from "../../lib/agents/view-operations/view-episode";
import { PREFIXE_SANS_ECRITURE, contexteDepuisEntree, decisionsEffectives, raisonSansEcriture, type SortieIterationPlan } from "../../lib/agents/iteration-clip";
import type { InfosExecution } from "./preparation";
import { depuisCompilationH3ir, depuisRetouche } from "../../lib/h3ir/conversion";
import { estResultatRetouche } from "../../lib/h3ir/retouch";
import { SKILL_H3IR, type ResultatH3ir } from "../../lib/h3ir/result";
import type { MessageConversation } from "../../lib/agents/types";
import { normaliserChoix } from "../../lib/agents/choice";
import { SKILL_REFERENCES_PLAN, type SortieReferencesPlan } from "../../lib/agents/references-clip";
import { brutsManquants, decisionSortieReferencesPlan } from "../../lib/h3ir/preparation";
import { registreCodesTypes } from "../../lib/h3ir/preparation-db";
import { ecrireReferencesPlan } from "../../lib/h3ir/references-write";

/** What the validated result of an agent-system task becomes, INSIDE the transaction that writes it (worker/llm.ts): a failure here cancels everything and the task is marked failed.
 * - `tour`        : either the coverage grid of a message (skill `couverture-entretien`, which then posts the agent's turn), or the agent's message, which joins the conversation (`briefPret` is decided in code);
 * - `brief`       : a DRAFT brief is written (never over a validated brief);
 * - `proposition` : the changes are built IN CODE from the skill's JSON;
 * - `affiche`     : the clap poster (lib/agents/poster-clap.ts): the written prompt launches the image generation. */

type RunAgent = typeof agentRuns.$inferSelect;
type OptionsRunAgent = { modele?: string; variante?: string; position?: Position; sceneVoisineId?: number | null; place?: PlaceScene };

export async function postTraiterRun(tx: Tx, run: RunAgent, json: unknown, execution: InfosExecution = {}): Promise<void> {
  if (!run.but) return; // call outside the agents system (npm run llm:task): nothing to do
  if (run.but === "tour") {
    if (run.skill === "notes-entretien") return postNotes(tx, run, json);
    // The screenwriter's hook (first message of a designed project) is filed like an agent turn: it opens the conversation.
    return postTour(tx, run, json as { reponse: string; resteADefinir?: string[] });
  }
  if (run.but === "brief") return postBrief(tx, run, json as Record<string, unknown>);
  // The clap poster: the prompt written by `prompt-asset` (variant `affiche`) immediately launches the generation of the project's poster (automatic adoption).
  if (run.but === "affiche") {
    if (run.projectId == null) throw new Error("Affiche sans projet.");
    return ecrireAfficheEtGenerer(tx, run.projectId, json as { promptGeneration?: unknown });
  }
  // An attempt at an asset's sheet: the translated prompt launches the attempt in the image queue.
  if (run.but === BUT_ESSAI) return ecrireEssaiTraduit(tx, run.options, json as { promptGeneration?: unknown });
  if (run.but === "proposition") return postProposition(tx, run, json, execution);
}

/** The « reste à définir » list of a turn: short sentences, without duplicates or blanks. */
export function resteADefinirDe(sortie: { resteADefinir?: unknown }): string[] {
  const l = Array.isArray(sortie.resteADefinir) ? sortie.resteADefinir : [];
  return [...new Set(l.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 12);
}

/** Interview notes (skill `notes-entretien`): a short call posted BEFORE each agent turn. It returns a PATCH of the notes sheet with the quotes that prove it; the code checks the quotes, applies the patch, decides by itself what is missing
 * and when the sheet is complete (then it becomes the draft brief, without any writing call). This is where the agent's turn is posted, with the updated sheet and what remains to ask (or « c'est complet »). */
async function postNotes(tx: Tx, run: RunAgent, sortie: unknown) {
  if (run.conversationId == null) return;
  const [conv] = await tx.select().from(agentConversations).where(eq(agentConversations.id, run.conversationId));
  if (!conv) return; // conversation overwritten in the meantime
  const messages = ((conv.messages as { role: "user" | "assistant"; content: string }[]) ?? []).map((m) => ({ role: m.role, content: m.content }));
  const utilisateur = messages.filter((m) => m.role === "user").map((m) => m.content);
  const avant = await ficheCourante(tx, conv);
  // The whole conversation (the agent's questions included) bounds the delegations: « je te laisse décider » only counts for the question asked.
  const fiche = appliquerNotes(avant, sortie, utilisateur, messages);
  const complete = await enregistrerFiche(tx, conv, fiche, utilisateur);
  if (complete && !ficheComplete(avant, utilisateur.slice(0, -1))) {
    // The sheet has just become complete: it is the CODE that announces it (summary, assumptions, « étape suivante » button), without an agent
    // turn. If the user carries on, the agent resumes to refine (« complète » note of entreeTour).
    const messagesStockes = [...((conv.messages as unknown[]) ?? []), { role: "assistant", content: messageBriefPret(fiche), at: new Date().toISOString() }];
    await tx.update(agentConversations).set({ messages: messagesStockes, briefPret: true, resteADefinir: [], etape: "conversation", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    return;
  }
  await creerRun(tx, {
    skill: "conversation-agent",
    entree: entreeTour(messages, fiche, { manques: manquesEssentiels(fiche), details: detailsAPreciser(fiche).map((d) => d.libelle), complete }, await formatDuProjet(tx, conv.projectId)),
    but: "tour",
    projectId: conv.projectId,
    conversationId: conv.id,
  });
}

/** The format of the designed project (a film), for the conversation agent; undefined for a project without design. */
async function formatDuProjet(tx: Tx, projectId: number): Promise<string | undefined> {
  const c = await lireConception(tx, projectId);
  return c ? informationsFormat() : undefined;
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

async function postTour(tx: Tx, run: RunAgent, sortie: { reponse: string; resteADefinir?: string[]; choix?: unknown }) {
  if (run.conversationId == null) return;
  const [conv] = await tx.select().from(agentConversations).where(eq(agentConversations.id, run.conversationId));
  if (!conv) return; // conversation overwritten in the meantime: the turn is lost, without error
  // Choice cards: optional, validated here; an invalid shape is ignored and the message stays text only.
  const choix = normaliserChoix(sortie.choix);
  const message: MessageConversation = { role: "assistant", content: sortie.reponse, at: new Date().toISOString(), ...(choix ? { choix } : {}) };
  const messages = [...((conv.messages as unknown[]) ?? []), message];
  const utilisateur = messages
    .filter((m) => (m as { role?: string }).role === "user")
    .map((m) => (m as { content?: unknown }).content)
    .map((c) => (typeof c === "string" ? c : ""));
  // « Prêt » is decided IN CODE, from the notes sheet (postNotes): the essentials and the details settled, after enough exchanges.
  const fiche = await ficheCourante(tx, conv);
  const pret = ficheComplete(fiche, utilisateur);
  // The displayed list: what the code notes as not said, then the nuances the agent has noted.
  const reste = [...manquesFiche(fiche).map(majuscule), ...resteADefinirDe(sortie)].filter((x, i, l) => l.indexOf(x) === i);
  await tx
    .update(agentConversations)
    .set({ messages, briefPret: pret, resteADefinir: reste.slice(0, 12), etape: "conversation", updatedAt: new Date() })
    .where(eq(agentConversations.id, conv.id));
}

async function postBrief(tx: Tx, run: RunAgent, sortie: Record<string, unknown>) {
  if (run.projectId == null) throw new Error("Brief sans projet.");
  await ecrireBrouillon(tx, run.projectId, sortieVersBrief(sortie));
  if (run.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "brief", updatedAt: new Date() }).where(eq(agentConversations.id, run.conversationId));
  }
}

async function postProposition(tx: Tx, run: RunAgent, json: unknown, execution: InfosExecution) {
  if (run.propositionId == null) throw new Error("Tâche de proposition sans proposition.");
  const [prop] = await tx.select().from(propositions).where(eq(propositions.id, run.propositionId));
  if (!prop) return; // proposal deleted in the meantime
  if (prop.statut !== "en_generation") return; // rejected during generation: we write nothing
  const options = (run.options ?? {}) as OptionsRunAgent;
  const scope = { type: prop.portee as "projet" | "episode" | "plan" | "asset", cibleId: prop.cibleId };
  // Batch: this task is only a SUB-TASK (one episode) of a larger proposal.
  if (prop.lot) {
    if (run.skill === "prompt-asset") return postSousTacheRegistre(tx, run, prop, scope, json as SortiePromptAsset);
    if (run.skill === SKILL_H3IR) return postSousTacheFicheH3ir(tx, run, prop, scope, json as ResultatH3ir);
    if (run.skill === "relecture-scenario") return postSousTacheRelecture(tx, run, prop, scope, json as SortieRelecture);
    if (run.skill === "traitement-episode") return postSousTacheTraitement(tx, run, prop, scope, json as SortieTraitement);
    if (run.skill === "scenario-scene") return postSousTacheScene(tx, run, prop, scope, json as SortieScenarioScene);
    if (run.skill === "inventaire-assets") return postInventaire(tx, run, prop, scope, json as SortieInventaire); // a group of scenes of a long film
    return postSousTacheLot(tx, run, prop, scope, json as SortieScenarioEpisode);
  }

  let bruts: ChangementBrut[] = [];
  // The presentation poster is the `affiche` variant of the `prompt-asset` skill: same output, different conversion.
  const estAffiche = run.skill === "prompt-asset" && options.variante === VARIANTE_AFFICHE;
  if (run.skill === "prompt-asset" && !estAffiche) {
    if (prop.cibleId == null) throw new Error("Proposition d'asset sans cible.");
    const [asset] = await tx.select().from(assets).where(eq(assets.id, prop.cibleId));
    if (!asset) throw new Error("L'asset visé n'existe plus.");
    bruts = depuisPromptAsset(json as SortiePromptAsset, {
      id: asset.id,
      code: asset.code,
      type: asset.type,
      methodeGeneration: asset.methodeGeneration,
    });
  } else if (estAffiche) {
    if (prop.cibleId == null) throw new Error("Proposition d'affiche sans cible.");
    const [asset] = await tx.select().from(assets).where(eq(assets.id, prop.cibleId));
    if (!asset) throw new Error("L'affiche visée n'existe plus.");
    const entree = run.entree as { titre?: string; personnagePrincipal?: { imageDisponible?: boolean } | null };
    bruts = depuisPromptAffiche(json as SortiePromptAffiche, asset, {
      titre: entree.titre ?? "",
      imagePersonnageDisponible: entree.personnagePrincipal?.imageDisponible === true,
    });
  } else if (run.skill === "scenario-episode") {
    const sortie = json as SortieScenarioEpisode;
    if (prop.portee === "plan") {
      if (prop.cibleId == null) throw new Error("Proposition de plan sans cible.");
      const [plan] = await tx.select({ uuid: plans.uuid, titre: plans.titre }).from(plans).where(eq(plans.id, prop.cibleId));
      if (!plan) throw new Error("Le plan visé n'existe plus.");
      bruts = depuisCorrectionPlan(sortie, plan);
    } else if (prop.portee === "episode" && prop.cibleId != null) {
      if (options.place) {
        const courant = await episodeCourant(tx, prop.projectId, prop.cibleId);
        bruts = depuisSceneAInserer(sortie, { episodeId: prop.cibleId, place: options.place, titresPris: courant.scenes.map((s) => s.titre) });
      } else if (options.position) {
        bruts = depuisPlanAInserer(sortie, { episodeId: prop.cibleId, position: options.position, sceneId: options.sceneVoisineId ?? null });
      } else {
        bruts = depuisScenarioEpisode(sortie, await episodeCourant(tx, prop.projectId, prop.cibleId), { dureeCibleSecondes: await dureeCibleDuProjet(tx, prop.projectId) });
      }
    } else {
      throw new Error(`Portée « ${prop.portee} » non prise en charge pour le skill scenario-episode.`);
    }
  } else if (run.skill === SKILL_H3IR) {
    // The sheet of ONE clip compiled by Open H3 IR (worker/h3ir.ts): a sheet alone, with no asset to create; it is written without review (lib/tasks/requests-db.ts).
    if (prop.cibleId == null) throw new Error("Proposition de fiche sans plan.");
    const [plan] = await tx.select({ uuid: plans.uuid, titre: plans.titre }).from(plans).where(eq(plans.id, prop.cibleId));
    if (!plan) throw new Error("Le plan visé n'existe plus.");
    // « Partir de cet essai »: the attempt's prompt was retouched (worker/h3ir.ts) instead of being recompiled; the rest is the same (description, duration written with the sheet).
    bruts = estResultatRetouche(json) ? depuisRetouche(json, plan) : depuisCompilationH3ir(json as ResultatH3ir, plan);
    // Recompilation from « Itérer » (lib/agents/service.ts, genererReecriturePlan): the compiled decisions (description, duration, clip settings) are written
    // with the sheet, in the same application; the references follow the compilation's manifest.
    const o = (run.options ?? {}) as { descriptionNouvelle?: unknown; dureeNouvelle?: unknown; reglagesNouveaux?: { creativite?: unknown; styleCamera?: unknown } | null };
    const nouvelle = typeof o.descriptionNouvelle === "string" ? o.descriptionNouvelle.trim() : "";
    const duree = typeof o.dureeNouvelle === "number" && Number.isInteger(o.dureeNouvelle) ? o.dureeNouvelle : null;
    const rg = o.reglagesNouveaux ?? null;
    const reglages = rg ? { ...(typeof rg.creativite === "string" ? { creativite: rg.creativite } : {}), ...(typeof rg.styleCamera === "string" ? { styleCamera: rg.styleCamera } : {}) } : {};
    if (nouvelle || duree != null || Object.keys(reglages).length) {
      for (const b of bruts) {
        if (b.cibleType === "fiche") {
          b.apres = { ...(b.apres as object), ...(nouvelle ? { description: nouvelle } : {}), ...(duree != null ? { dureeGenerationSecondes: duree } : {}), ...(Object.keys(reglages).length ? { reglages } : {}) };
        }
      }
    }
  } else if (run.skill === "inventaire-assets") {
    // The assets the clips call for and that the registry does not have (creations without prompt, written afterwards), and each clip's references.
    return postInventaire(tx, run, prop, scope, json as SortieInventaire);
  } else if (run.skill === SKILL_REFERENCES_PLAN) {
    // The choice of a clip's references (preparation, wave 4a): references written right away, or missing asset creations to apply first.
    return postReferencesPlan(tx, run, prop, scope, json as SortieReferencesPlan);
  } else if (run.skill === "iteration-plan") {
    // Correction after viewing: DECISIONS (no change here), recompiled afterwards by Open H3 IR; or nothing (the diagnosis alone) with the reason.
    if (prop.cibleId == null) throw new Error("Correction de plan sans plan.");
    return postIteration(tx, run, prop, scope, json as SortieIterationPlan, execution);
  } else {
    throw new Error(`Skill « ${run.skill} » : pas de conversion en proposition.`);
  }

  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts);
  if (prop.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
}

/** Asset inventory (a single call, or a group of scenes of a long film): the asset creations become changes; the references of the
 * clips that cite only existing assets are written RIGHT AWAY (lib/agents/inventory-db.ts), the others at application, after the creations.
 * Group of a batch: its lines replace those it had posted (re-run), what the other groups propose is not re-proposed, then the next
 * group is posted (only once), with the assets already proposed; finally the batch decides its status. */
async function postInventaire(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieInventaire,
) {
  const cle = prop.lot ? run.cleSousTache : null;
  if (prop.lot && !cle) throw new Error("Groupe d'inventaire sans clé de sous-tâche.");
  const registre = await tx.select({ code: assets.code, type: assets.type, description: assets.description }).from(assets).where(and(eq(assets.projectId, prop.projectId), horsAffiches));
  // The effects and objects of the brief that the agent read (run input): a VFX is only accepted if it is drawn from it.
  const elements = (run.entree as { brief?: { elements?: { nom: string; nature: string }[] } | null } | null)?.brief?.elements;
  const autres = cle ? await assetsACreer(tx, prop.id, { saufSousTache: cle }) : [];
  const bruts = depuisInventaire(sortie, registre.map((a) => ({ code: a.code, type: a.type, description: a.description ?? "" })), {
    elements: Array.isArray(elements) ? elements : [],
    proposes: autres,
  });
  if (cle) {
    const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
    await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  } else {
    await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts);
  }
  // The references: written now if they cite only existing assets; a proposed asset (not refused) makes them wait for the application.
  const bilan = await ecrireReferencesDesTaches(tx, prop.projectId, [{ entree: run.entree, options: run.options, resultat: sortie }], await assetsACreer(tx, prop.id));

  if (cle) {
    const options = (run.options ?? {}) as OptionsRunInventaire;
    const [suivant, ...reste] = options.suite ?? [];
    const dejaPose = suivant ? (await runsDuLot(tx, prop.id)).some((r) => r.cle === suivant.cle) : true;
    if (suivant && !dejaPose) {
      const proposes = (await assetsACreer(tx, prop.id)).map((a) => ({ code: a.code, type: a.type, description: a.description }));
      await creerRun(tx, {
        skill: "inventaire-assets",
        entree: { ...suivant.entree, ...(proposes.length ? { assetsDejaProposes: proposes } : {}) },
        options: { plans: suivant.plans, suite: reste } satisfies OptionsRunInventaire,
        but: "proposition",
        projectId: prop.projectId,
        conversationId: prop.conversationId,
        propositionId: prop.id,
        cleSousTache: suivant.cle,
        libelleSousTache: suivant.libelle,
      });
    }
    await finaliserLot(tx, prop.id, { runTermineId: run.id });
    return;
  }
  // Nothing to add: the proposal says so (with the model's notes) rather than showing an empty list.
  const phrase = phraseBilan(bilan);
  if (bruts.length === 0 || phrase) {
    const notes = (sortie.notes ?? "").trim();
    const [p] = await tx.select({ resume: propositions.resume }).from(propositions).where(eq(propositions.id, prop.id));
    const resume = bruts.length === 0 ? `Le registre suffit : aucun asset à ajouter.${notes ? ` ${notes}` : ""}` : (p?.resume ?? "");
    await tx.update(propositions).set({ resume: [resume, phrase].filter(Boolean).join(" ") }).where(eq(propositions.id, prop.id));
  }
  if (prop.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
}

/** The episode as it is now (title, summary, scenes, clips): what the conversion compares to the skill's output. */
async function episodeCourant(tx: Tx, projectId: number, episodeId: number): Promise<EpisodeCourant> {
  const ep = await entreeScenarioEpisode(tx, projectId, episodeId, "");
  if (!ep) throw new Error("L'épisode visé n'existe plus.");
  const entree = ep.entree as { episode: { titre: string; resume: string }; scenesExistantes: { id: number; titre: string }[] };
  const lesPlans = await tx.select({ uuid: plans.uuid, titre: plans.titre, sceneId: plans.sceneId }).from(plans).where(eq(plans.episodeId, episodeId));
  return { id: episodeId, titre: entree.episode.titre, resume: entree.episode.resume, scenes: entree.scenesExistantes, plans: lesPlans };
}

/** The target duration of an episode, as the project's brief carries it (null without a brief or duration). */
async function dureeCibleDuProjet(tx: Tx, projectId: number): Promise<number | null> {
  const [b] = await tx.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  const d = (b?.contenu as { dureeEpisodeSecondes?: unknown } | undefined)?.dureeEpisodeSecondes;
  return typeof d === "number" && d > 0 ? d : null;
}

/** A sub-task of a screenplay batch (one episode): its changes REPLACE those it had already posted (re-run) without touching the other
 * sub-tasks, in the same transaction as its result (idempotent: replaying the same result doubles nothing); then the batch decides its status. */
async function postSousTacheLot(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieScenarioEpisode,
) {
  const cle = run.cleSousTache;
  const episodeId = episodeIdDeCle(cle);
  if (!cle || episodeId == null || run.skill !== "scenario-episode") throw new Error(`Sous-tâche de lot inconnue (« ${cle ?? "?"} », skill « ${run.skill} »).`);
  const bruts = depuisScenarioEpisode(sortie, await episodeCourant(tx, prop.projectId, episodeId), {
    prefixeCle: `ep${episodeId}-`,
    groupe: groupeEpisode(episodeId),
    signalerEcrasement: true,
    dureeCibleSecondes: await dureeCibleDuProjet(tx, prop.projectId),
  });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** A sub-task of the « traitements » batch (one episode): the breakdown into scenes becomes scene creations, with their treatment. The changes of the
 * sub-task REPLACE those it had posted (re-run), then the batch decides its status. */
async function postSousTacheTraitement(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieTraitement,
) {
  const cle = run.cleSousTache;
  const episodeId = episodeIdDeCle(cle);
  if (!cle || episodeId == null) throw new Error(`Sous-tâche de traitement inconnue (« ${cle ?? "?"} »).`);
  const duree = await dureeCibleDuProjet(tx, prop.projectId);
  if (duree == null) throw new Error("Le brief ne donne plus de durée d'épisode : le traitement ne peut pas répartir les scènes.");
  const bruts = depuisTraitement(sortie, await episodeCourant(tx, prop.projectId, episodeId), {
    dureeEpisodeSecondes: duree,
    prefixeCle: `ep${episodeId}-`,
    groupe: groupeEpisode(episodeId),
  });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** A sub-task of the « scénarios » batch written per scene (`scene:<id>`): the clips of the scene, durations brought back to its target, on the scene as it is now.
 * Replaces what the sub-task had posted (re-run), then the batch decides its status. */
async function postSousTacheScene(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieScenarioScene,
) {
  const cle = run.cleSousTache;
  const sceneId = sceneIdDeCle(cle);
  if (!cle || sceneId == null) throw new Error(`Sous-tâche de scène inconnue (« ${cle ?? "?"} »).`);
  const [sc] = await tx.select({ id: scenes.id, episodeId: scenes.episodeId, titre: scenes.titre, fonction: scenes.fonction, traitement: scenes.traitement }).from(scenes).where(eq(scenes.id, sceneId));
  const t = sc ? traitementDeScene(sc.traitement) : null;
  if (!sc || !t) throw new Error("La scène n'existe plus ou n'a plus de traitement.");
  const bruts = depuisScenarioScene(sortie, await episodeCourant(tx, prop.projectId, sc.episodeId), { id: sc.id, titre: sc.titre, fonction: sc.fonction ?? "", dureeCibleSecondes: t.dureeCibleSecondes }, {
    prefixeCle: `sc${sc.id}-`,
    groupe: groupeEpisode(sc.episodeId),
  });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** A sub-task of the « relectures » batch (one episode): the screenplay corrections are translated into clip changes (handles → uuid, on the episode as it is NOW)
 * that REPLACE those the sub-task had posted (re-run). The order of the clips must be the one the model read: otherwise a handle would target another clip,
 * the sub-task fails and is re-run. Then the batch decides its status. */
async function postSousTacheRelecture(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieRelecture,
) {
  const cle = run.cleSousTache;
  const episodeId = episodeIdDeCle(cle);
  if (!cle || episodeId == null) throw new Error(`Sous-tâche de relecture inconnue (« ${cle ?? "?"} »).`);
  const vue = await lireVueEpisode(tx, prop.projectId, episodeId);
  if (!vue) throw new Error("L'épisode relu n'existe plus.");
  const luParLeModele = (run.options as { planUuids?: string[] } | null)?.planUuids;
  if (luParLeModele && (luParLeModele.length !== vue.plans.length || luParLeModele.some((u, i) => vue.plans[i]?.uuid !== u))) {
    throw new Error("Les plans de l'épisode ont changé (ajoutés, supprimés ou déplacés) pendant la relecture : relance-la.");
  }
  const { bruts } = depuisRelecture(sortie, vue, run.entree as EntreeRelecture, { groupe: groupeEpisode(episodeId) });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** A sub-task of the « registre » batch (a master): the asset is created if it does not exist (description from the
 * brief + prompt), otherwise its prompt is proposed. Same rule as for an episode: its changes
 * REPLACE those it had posted (re-run), idempotent, then the batch decides its status. */
async function postSousTacheRegistre(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortiePromptAsset,
) {
  const cle = run.cleSousTache;
  const code = codeDeCleAsset(cle);
  if (!cle || !code) throw new Error(`Sous-tâche de registre inconnue (« ${cle ?? "?"} »).`);
  const entree = run.entree as { asset?: { code?: string; type?: string; descriptionCanonique?: string } };
  const type = entree.asset?.type;
  if (!type) throw new Error("Sous-tâche de registre sans type d'asset.");
  const [existant] = await tx.select().from(assets).where(and(eq(assets.projectId, prop.projectId), eq(assets.code, code)));
  const suffixe = code.includes("_") ? code.slice(code.indexOf("_") + 1) : code;
  const bruts = depuisRegistreAsset(sortie, {
    code,
    type,
    suffixe,
    description: entree.asset?.descriptionCanonique ?? "",
    descriptionVide: existant ? !(existant.description ?? "").trim() : false,
    existant: existant
      ? { id: existant.id, code: existant.code, type: existant.type, methodeGeneration: existant.methodeGeneration }
      : null,
  });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** An Open H3 IR sub-task of a sheets batch (a compilable clip, lib/h3ir/engine.ts): its compiled sheet, filed under its episode and its scene,
 * with no asset to create. Same rule as the other batches: its changes REPLACE those it had posted (re-run), then the batch decides its status. */
async function postSousTacheFicheH3ir(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  res: ResultatH3ir,
) {
  const cle = run.cleSousTache;
  const planUuid = planUuidDeCle(cle);
  if (!cle || !planUuid) throw new Error(`Sous-tâche de fiche inconnue (« ${cle ?? "?"} »).`);
  const [plan] = await tx.select({ uuid: plans.uuid, titre: plans.titre, episodeId: plans.episodeId, sceneId: plans.sceneId }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, prop.projectId)));
  if (!plan) throw new Error("Le plan visé n'existe plus.");
  const [scene] = plan.sceneId != null ? await tx.select({ titre: scenes.titre }).from(scenes).where(eq(scenes.id, plan.sceneId)) : [];
  const bruts = depuisCompilationH3ir(res, plan, { groupe: groupeEpisode(plan.episodeId), sousGroupe: scene?.titre ?? null });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** The choice of a clip's references by the small `references-plan` skill (called only when the code had doubts, lib/h3ir/preparation.ts). With no asset to
 * create, the references are written RIGHT AWAY on the clip (never over references posted in the meantime, except `rechoisir`) and the proposal is
 * closed (« appliquée »); with missing ones (two at most, valid code and parent), these are asset creations that the request applies, and the
 * references (missing ones included) are written in the same transaction (lib/agents/service.ts, `appliquerSelection`). */
async function postReferencesPlan(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieReferencesPlan,
) {
  if (prop.cibleId == null) throw new Error("Choix des références sans plan.");
  const d = decisionSortieReferencesPlan(sortie, await registreCodesTypes(tx, prop.projectId));
  const rechoisir = (run.options as { rechoisir?: boolean } | null)?.rechoisir === true;
  const ecartes = d.ecartes.length ? ` Écarté${d.ecartes.length > 1 ? "s" : ""} : ${d.ecartes.map((e) => `${e.code} (${e.raison})`).join(", ")}.` : "";
  const notes = (sortie.notes ?? "").trim();
  if (d.manquants.length === 0) {
    await enregistrerChangements(tx, prop.id, prop.projectId, scope, []);
    const e = d.references.length ? await ecrireReferencesPlan(tx, prop.cibleId, d.references, { remplacer: rechoisir }) : null;
    const resume = e?.ok
      ? `Références écrites : ${d.references.join(", ")}.`
      : e && e.raison === "deja-des-references"
        ? "Le plan a reçu des références entre-temps : elles sont gardées."
        : "Aucune référence retenue par l'agent.";
    await tx.update(propositions).set({ statut: "appliquee", appliedAt: new Date(), resume: [resume, ecartes.trim(), notes].filter(Boolean).join(" ") }).where(eq(propositions.id, prop.id));
    if (prop.conversationId != null) await tx.update(agentConversations).set({ etape: "applique", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
    return;
  } else {
    await enregistrerChangements(tx, prop.id, prop.projectId, scope, brutsManquants(d.manquants));
    const resume = `${d.manquants.length} asset${d.manquants.length > 1 ? "s" : ""} à créer (${d.manquants.map((m) => m.code).join(", ")}) ; références : ${[...d.references, ...d.manquants.map((m) => m.code)].join(", ")}.`;
    await tx.update(propositions).set({ resume: [resume, ecartes.trim(), notes].filter(Boolean).join(" ") }).where(eq(propositions.id, prop.id));
  }
  if (prop.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
}

/** A correction after viewing (`iteration-plan`, 2026-11-09): the agent only DECIDES (intent, duration, references, settings); the proposal carries
 * NO change, its decisions are read in the diagnosis (lib/agents/queries-agents.ts) and go to Open H3 IR recompilation (lib/tasks/requests-db.ts). Without an
 * applicable decision (incoherent duration, abandonment, cause outside the clip…), the summary starts with `PREFIXE_SANS_ECRITURE` and says why: nothing is
 * recompiled. The « contexte utilisé » gains the render measurement (real duration, number of thumbnails). */
async function postIteration(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieIterationPlan,
  execution: InfosExecution,
) {
  // The context is what the model saw (its input), the real duration the one the worker measured.
  const ctx = { ...contexteDepuisEntree(run.entree), dureeReelleSecondes: execution.dureeReelleSecondes ?? null };
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, []);
  const raison = raisonSansEcriture(sortie, ctx);
  const voulue = ctx.dureeGenerationSecondes;
  const mesure =
    execution.dureeReelleSecondes != null
      ? [{ type: "plan" as const, libelle: `Rendu mesuré : ${String(execution.dureeReelleSecondes).replace(".", ",")} s pour ${voulue} s voulues · ${execution.nbVignettes ?? "?"} vignettes regardées` }]
      : [];
  const resume = raison ? `${PREFIXE_SANS_ECRITURE} ${raison}` : decisionsEffectives(sortie, ctx) ? "Décisions de l'agent : la fiche est recompilée par Open H3 IR avec elles, puis tout s'écrit ensemble." : "";
  const maj = {
    ...(resume ? { resume } : {}),
    ...(mesure.length ? { contexte: [...((prop.contexte as unknown[]) ?? []), ...mesure] } : {}),
  };
  if (Object.keys(maj).length) await tx.update(propositions).set(maj).where(eq(propositions.id, prop.id));
  if (prop.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
}

/** Failure or cancellation of an agent task: the linked proposal will not wait indefinitely. */
export async function surEchecRun(run: RunAgent, message: string): Promise<void> {
  if (run.but === BUT_ESSAI) await terminerEssaiSansPrompt(db, run.options, "echoue", message);
  if (run.but === "proposition" && run.propositionId != null) {
    // A batch sub-task that fails does not fail the batch: it decides from all its tasks.
    const [prop] = await db.select({ lot: propositions.lot }).from(propositions).where(eq(propositions.id, run.propositionId));
    if (prop?.lot) {
      await finaliserLot(db, run.propositionId);
      return;
    }
    await db
      .update(propositions)
      .set({ statut: "echouee", erreur: message.slice(0, 2000) })
      .where(eq(propositions.id, run.propositionId));
  }
}
