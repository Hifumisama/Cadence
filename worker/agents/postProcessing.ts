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

/** Ce que devient le résultat validé d'une tâche du système d'agents, DANS la transaction qui
 * l'écrit (worker/llm.ts) : un échec ici annule tout et la tâche est marquée échouée.
 * - `tour`        : soit la grille de couverture d'un message (skill `couverture-entretien`, qui pose ensuite le tour de
 *                   l'agent), soit le message de l'agent, qui rejoint la conversation (`briefPret` est décidé en code) ;
 * - `brief`       : un BROUILLON de brief est écrit (jamais par-dessus un brief validé) ;
 * - `proposition` : les changements sont construits EN CODE depuis le JSON du skill ;
 * - `affiche`     : l'affiche du clap (lib/agents/poster-clap.ts) : le prompt écrit lance la génération de l'image. */

type RunAgent = typeof agentRuns.$inferSelect;
type OptionsRunAgent = { modele?: string; variante?: string; position?: Position; sceneVoisineId?: number | null; place?: PlaceScene };

export async function postTraiterRun(tx: Tx, run: RunAgent, json: unknown, execution: InfosExecution = {}): Promise<void> {
  if (!run.but) return; // appel hors système d'agents (npm run llm:tache) : rien à faire
  if (run.but === "tour") {
    if (run.skill === "notes-entretien") return postNotes(tx, run, json);
    // L'accroche du scénariste (premier message d'un projet conçu) se range comme un tour de l'agent : elle ouvre la conversation.
    return postTour(tx, run, json as { reponse: string; resteADefinir?: string[] });
  }
  if (run.but === "brief") return postBrief(tx, run, json as Record<string, unknown>);
  // L'affiche du clap : le prompt écrit par `prompt-asset` (variante `affiche`) lance tout de suite la génération de l'affiche du projet (adoption automatique).
  if (run.but === "affiche") {
    if (run.projectId == null) throw new Error("Affiche sans projet.");
    return ecrireAfficheEtGenerer(tx, run.projectId, json as { promptGeneration?: unknown });
  }
  // Un essai de la fiche d'un asset : le prompt traduit lance l'essai dans la file d'images.
  if (run.but === BUT_ESSAI) return ecrireEssaiTraduit(tx, run.options, json as { promptGeneration?: unknown });
  if (run.but === "proposition") return postProposition(tx, run, json, execution);
}

/** La liste « reste à définir » d'un tour : des phrases courtes, sans doublon ni vide. */
export function resteADefinirDe(sortie: { resteADefinir?: unknown }): string[] {
  const l = Array.isArray(sortie.resteADefinir) ? sortie.resteADefinir : [];
  return [...new Set(l.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 12);
}

/** Notes de l'entretien (skill `notes-entretien`) : un appel court posé AVANT chaque tour de l'agent. Il rend un PATCH de la fiche
 * de notes avec les citations qui le prouvent ; le code vérifie les citations, applique le patch, décide seul de ce qui manque
 * et de quand la fiche est complète (alors elle devient le brouillon du brief, sans appel de rédaction). C'est ici que le tour de
 * l'agent est posé, avec la fiche à jour et ce qui reste à demander (ou « c'est complet »). */
async function postNotes(tx: Tx, run: RunAgent, sortie: unknown) {
  if (run.conversationId == null) return;
  const [conv] = await tx.select().from(agentConversations).where(eq(agentConversations.id, run.conversationId));
  if (!conv) return; // conversation écrasée entre-temps
  const messages = ((conv.messages as { role: "user" | "assistant"; content: string }[]) ?? []).map((m) => ({ role: m.role, content: m.content }));
  const utilisateur = messages.filter((m) => m.role === "user").map((m) => m.content);
  const avant = await ficheCourante(tx, conv);
  // La conversation entière (questions de l'agent comprises) borne les délégations : « je te laisse décider » ne vaut que pour la question posée.
  const fiche = appliquerNotes(avant, sortie, utilisateur, messages);
  const complete = await enregistrerFiche(tx, conv, fiche, utilisateur);
  if (complete && !ficheComplete(avant, utilisateur.slice(0, -1))) {
    // La fiche vient de devenir complète : c'est le CODE qui l'annonce (résumé, suppositions, bouton « étape suivante »), sans tour
    // de l'agent. Si l'utilisateur continue, l'agent reprend pour affiner (note « complète » de entreeTour).
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

/** Le format du projet conçu (un film), pour l'agent de conversation ; undefined pour un projet sans conception. */
async function formatDuProjet(tx: Tx, projectId: number): Promise<string | undefined> {
  const c = await lireConception(tx, projectId);
  return c ? informationsFormat() : undefined;
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

async function postTour(tx: Tx, run: RunAgent, sortie: { reponse: string; resteADefinir?: string[]; choix?: unknown }) {
  if (run.conversationId == null) return;
  const [conv] = await tx.select().from(agentConversations).where(eq(agentConversations.id, run.conversationId));
  if (!conv) return; // conversation écrasée entre-temps : le tour est perdu, sans erreur
  // Cartes de choix : facultatives, validées ici ; une forme invalide est ignorée et le message reste du texte seul.
  const choix = normaliserChoix(sortie.choix);
  const message: MessageConversation = { role: "assistant", content: sortie.reponse, at: new Date().toISOString(), ...(choix ? { choix } : {}) };
  const messages = [...((conv.messages as unknown[]) ?? []), message];
  const utilisateur = messages
    .filter((m) => (m as { role?: string }).role === "user")
    .map((m) => (m as { content?: unknown }).content)
    .map((c) => (typeof c === "string" ? c : ""));
  // « Prêt » est décidé EN CODE, depuis la fiche de notes (postNotes) : l'essentiel et les détails tranchés, après assez d'échanges.
  const fiche = await ficheCourante(tx, conv);
  const pret = ficheComplete(fiche, utilisateur);
  // La liste affichée : ce que le code constate non dit, puis les nuances que l'agent a notées.
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
  if (!prop) return; // proposition supprimée entre-temps
  if (prop.statut !== "en_generation") return; // rejetée pendant la génération : on n'écrit rien
  const options = (run.options ?? {}) as OptionsRunAgent;
  const scope = { type: prop.portee as "projet" | "episode" | "plan" | "asset", cibleId: prop.cibleId };
  // Lot : cette tâche n'est qu'une SOUS-TÂCHE (un épisode) d'une proposition plus grande.
  if (prop.lot) {
    if (run.skill === "prompt-asset") return postSousTacheRegistre(tx, run, prop, scope, json as SortiePromptAsset);
    if (run.skill === SKILL_H3IR) return postSousTacheFicheH3ir(tx, run, prop, scope, json as ResultatH3ir);
    if (run.skill === "relecture-scenario") return postSousTacheRelecture(tx, run, prop, scope, json as SortieRelecture);
    if (run.skill === "traitement-episode") return postSousTacheTraitement(tx, run, prop, scope, json as SortieTraitement);
    if (run.skill === "scenario-scene") return postSousTacheScene(tx, run, prop, scope, json as SortieScenarioScene);
    if (run.skill === "inventaire-assets") return postInventaire(tx, run, prop, scope, json as SortieInventaire); // un groupe de scènes d'un long film
    return postSousTacheLot(tx, run, prop, scope, json as SortieScenarioEpisode);
  }

  let bruts: ChangementBrut[] = [];
  // L'affiche de présentation est la variante `affiche` du skill `prompt-asset` : même sortie, autre conversion.
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
    // La fiche d'UN plan compilée par Open H3 IR (worker/h3ir.ts) : une fiche seule, sans asset à créer ; elle s'écrit sans relecture (lib/tasks/requests-db.ts).
    if (prop.cibleId == null) throw new Error("Proposition de fiche sans plan.");
    const [plan] = await tx.select({ uuid: plans.uuid, titre: plans.titre }).from(plans).where(eq(plans.id, prop.cibleId));
    if (!plan) throw new Error("Le plan visé n'existe plus.");
    // « Partir de cet essai » : le prompt de l'essai a été retouché (worker/h3ir.ts) au lieu d'être recompilé ; la suite est la même (description, durée écrites avec la fiche).
    bruts = estResultatRetouche(json) ? depuisRetouche(json, plan) : depuisCompilationH3ir(json as ResultatH3ir, plan);
    // Recompilation depuis « Itérer » (lib/agents/service.ts, genererReecriturePlan) : les décisions compilées (description, durée, réglages du plan) s'écrivent
    // avec la fiche, dans la même application ; les références suivent le manifeste de la compilation.
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
    // Les assets que les plans réclament et que le registre n'a pas (des créations sans prompt, il s'écrit ensuite), et les références de chaque plan.
    return postInventaire(tx, run, prop, scope, json as SortieInventaire);
  } else if (run.skill === SKILL_REFERENCES_PLAN) {
    // Le choix des références d'un plan (préparation, vague 4a) : références écrites tout de suite, ou créations d'assets manquants à appliquer d'abord.
    return postReferencesPlan(tx, run, prop, scope, json as SortieReferencesPlan);
  } else if (run.skill === "iteration-plan") {
    // Correction après visionnage : des DÉCISIONS (aucun changement ici), recompilées ensuite par Open H3 IR ; ou rien (le diagnostic seul) avec la raison.
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

/** Inventaire des assets (un seul appel, ou un groupe de scènes d'un long film) : les créations d'assets deviennent des changements ; les références des
 * plans qui ne citent que des assets existants s'écrivent TOUT DE SUITE (lib/agents/inventory-db.ts), les autres à l'application, après les créations.
 * Groupe d'un lot : ses lignes remplacent celles qu'il avait posées (relance), ce que les autres groupes proposent n'est pas reproposé, puis le groupe
 * suivant est posé (une seule fois), avec les assets déjà proposés ; enfin le lot décide de son statut. */
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
  // Les effets et objets du brief que l'agent a lus (entrée du run) : un VFX n'est accepté que s'il en est tiré.
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
  // Les références : écrites maintenant si elles ne citent que des assets existants ; un asset proposé (non refusé) les fait attendre l'application.
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
  // Rien à ajouter : la proposition le dit (avec les notes du modèle) plutôt que d'afficher une liste vide.
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

/** L'épisode tel qu'il est maintenant (titre, résumé, scènes, plans) : ce que la conversion compare à la sortie du skill. */
async function episodeCourant(tx: Tx, projectId: number, episodeId: number): Promise<EpisodeCourant> {
  const ep = await entreeScenarioEpisode(tx, projectId, episodeId, "");
  if (!ep) throw new Error("L'épisode visé n'existe plus.");
  const entree = ep.entree as { episode: { titre: string; resume: string }; scenesExistantes: { id: number; titre: string }[] };
  const lesPlans = await tx.select({ uuid: plans.uuid, titre: plans.titre, sceneId: plans.sceneId }).from(plans).where(eq(plans.episodeId, episodeId));
  return { id: episodeId, titre: entree.episode.titre, resume: entree.episode.resume, scenes: entree.scenesExistantes, plans: lesPlans };
}

/** La durée visée d'un épisode, telle que le brief du projet la porte (null sans brief ni durée). */
async function dureeCibleDuProjet(tx: Tx, projectId: number): Promise<number | null> {
  const [b] = await tx.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  const d = (b?.contenu as { dureeEpisodeSecondes?: unknown } | undefined)?.dureeEpisodeSecondes;
  return typeof d === "number" && d > 0 ? d : null;
}

/** Une sous-tâche d'un lot de scénarios (un épisode) : ses changements REMPLACENT ceux qu'elle avait
 * déjà posés (relance) sans toucher aux autres sous-tâches, dans la même transaction que son résultat
 * (idempotent : rejouer le même résultat ne double rien) ; puis le lot décide de son statut. */
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

/** Une sous-tâche du lot « traitements » (un épisode) : le découpage en scènes devient des créations de scène, avec leur traitement. Les changements de la
 * sous-tâche REMPLACENT ceux qu'elle avait posés (relance), puis le lot décide de son statut. */
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

/** Une sous-tâche du lot « scénarios » écrite par scène (`scene:<id>`) : les plans de la scène, durées ramenées à sa cible, sur la scène telle qu'elle est maintenant.
 * Remplace ce que la sous-tâche avait posé (relance), puis le lot décide de son statut. */
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

/** Une sous-tâche du lot « relectures » (un épisode) : les corrections du scénario sont traduites en changements de plan (poignées → uuid, sur l'épisode
 * tel qu'il est MAINTENANT) qui REMPLACENT ceux que la sous-tâche avait posés (relance). L'ordre des plans doit être celui que le modèle a lu : sinon une
 * poignée viserait un autre plan, la sous-tâche échoue et se relance. Puis le lot décide de son statut. */
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

/** Une sous-tâche du lot « registre » (un master) : l'asset est créé s'il n'existe pas (description du
 * brief + prompt), sinon son prompt est proposé. Même règle que pour un épisode : ses changements
 * REMPLACENT ceux qu'elle avait posés (relance), idempotent, puis le lot décide de son statut. */
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

/** Une sous-tâche Open H3 IR d'un lot de fiches (un plan compilable, lib/h3ir/engine.ts) : sa fiche compilée, rangée sous son épisode et sa scène,
 * sans asset à créer. Même règle que les autres lots : ses changements REMPLACENT ceux qu'elle avait posés (relance), puis le lot décide de son statut. */
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

/** Le choix des références d'un plan par le petit skill `references-plan` (appelé seulement quand le code doutait, lib/h3ir/preparation.ts). Sans asset à
 * créer, les références s'écrivent TOUT DE SUITE sur le plan (jamais par-dessus des références posées entre-temps, sauf `rechoisir`) et la proposition est
 * close (« appliquée ») ; avec des manquants (deux au plus, code et parent valides), ce sont des créations d'assets que la demande applique, et les
 * références (manquants compris) s'écrivent dans la même transaction (lib/agents/service.ts, `appliquerSelection`). */
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

/** Une correction après visionnage (`iteration-plan`, 2026-11-09) : l'agent ne fait que DÉCIDER (intent, durée, références, réglages) ; la proposition ne porte
 * AUCUN changement, ses décisions se lisent dans le diagnostic (lib/agents/queries-agents.ts) et partent en recompilation Open H3 IR (lib/tasks/requests-db.ts). Sans
 * décision applicable (durée incohérente, abandon, cause hors du plan…), le résumé commence par `PREFIXE_SANS_ECRITURE` et dit pourquoi : rien n'est
 * recompilé. Le « contexte utilisé » gagne la mesure du rendu (durée réelle, nombre de vignettes). */
async function postIteration(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieIterationPlan,
  execution: InfosExecution,
) {
  // Le contexte est celui qu'a vu le modèle (son entrée), la durée réelle celle que le worker a mesurée.
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

/** Échec ou annulation d'une tâche d'agent : la proposition liée n'attendra pas indéfiniment. */
export async function surEchecRun(run: RunAgent, message: string): Promise<void> {
  if (run.but === BUT_ESSAI) await terminerEssaiSansPrompt(db, run.options, "echoue", message);
  if (run.but === "proposition" && run.propositionId != null) {
    // Une sous-tâche de lot qui échoue ne fait pas échouer le lot : il décide d'après toutes ses tâches.
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
