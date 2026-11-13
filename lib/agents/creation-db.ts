import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, briefs, creationsProjet, demandes, plans, projects, propositionChangements } from "../../db/schema";
import { lancerDemandesFiches } from "../tasks/requests-sheets";
import { estDeLaCreation, fenetreDeCreation } from "./creation-task";
import { lireProposition } from "./queries-agents";
import {
  decider,
  estOccupe,
  estRienAFaire,
  estFinale,
  etapeCourante,
  etapesNeuves,
  normaliserEtapes,
  plansAEcrire,
  statutDepuisEtapes,
  type CleEtapeCreation,
  type EtapeCreation,
  type ObservationEtape,
  type StatutCreation,
} from "./creation";
import { lancerImagesPretes } from "../assets/images-auto";
import { tacheActive } from "./runs";
import { arreterTravaux, conversationParUuid, genererBrief, ouvrirConversation } from "./service-conversation";
import { appliquerSelection, propositionParUuid } from "./service-proposals";
import { relancerSousTache } from "./service-retry";
import { genererProposition } from "./service-dispatch";
import { genererInventaire, genererRegistre, genererRelectures, genererScenarios, genererTraitements } from "./service-episodes";
import { genererPromptsAssetsCrees } from "./service-assets";
import type { Resultat } from "./types";

/** The installer's PILOT (rules in lib/agents/creation.ts). `piloterCreations` is called on each turn of the
 * worker loop: at most one transition per ongoing creation, state in `creations_projet` (resumed on
 * restart, nothing in memory). The interface actions (launch, resume, stop) write the same state. */

export type LigneCreation = typeof creationsProjet.$inferSelect;
const ERR = (erreur: string) => ({ ok: false as const, erreur });

export async function lireCreation(projectId: number): Promise<LigneCreation | null> {
  const [c] = await db.select().from(creationsProjet).where(eq(creationsProjet.projectId, projectId));
  return c ?? null;
}

// Steps removed since (`voix`, the sheets of the old phase 2) are ignored: see `normaliserEtapes`.
const lireEtapes = (c: LigneCreation): EtapeCreation[] => (Array.isArray(c.etapes) ? normaliserEtapes(c.etapes) : etapesNeuves());

async function ecrire(c: LigneCreation, etapes: EtapeCreation[], extra: { statut?: StatutCreation; erreur?: string | null } = {}): Promise<void> {
  const statut = extra.statut ?? statutDepuisEtapes(etapes, c.statut as StatutCreation);
  await db
    .update(creationsProjet)
    .set({ etapes, statut, erreur: extra.erreur !== undefined ? extra.erreur : statut === "echoue" ? (etapes.find((e) => e.statut === "echoue")?.erreur ?? null) : null, updatedAt: new Date() })
    .where(eq(creationsProjet.id, c.id));
}

/** The project creation's agent tasks (see creation-task.ts): what the header's "Conception" line groups together. */
export async function idsRunsDeCreation(projectId: number): Promise<number[]> {
  const c = await lireCreation(projectId);
  if (!c) return [];
  const [conv] = await db
    .select({ id: agentConversations.id })
    .from(agentConversations)
    .where(and(eq(agentConversations.projectId, projectId), eq(agentConversations.portee, "projet"), isNull(agentConversations.cibleId)));
  if (!conv) return [];
  const f = fenetreDeCreation(c, conv.id);
  const runs = await db.select({ id: agentRuns.id, conversationId: agentRuns.conversationId, createdAt: agentRuns.createdAt }).from(agentRuns).where(and(eq(agentRuns.projectId, projectId), eq(agentRuns.conversationId, conv.id)));
  return runs.filter((r) => estDeLaCreation(r, f)).map((r) => r.id);
}

/** Launches the installer: one creation per project (a previous one, finished or stopped, is replaced). Refused if a
 * creation is already running, or if the project has neither a brief nor a starting conversation. */
export async function lancerCreation(projectId: number): Promise<Resultat<{ creationId: number }>> {
  const existante = await lireCreation(projectId);
  if (existante?.statut === "en_cours") return ERR("Une création est déjà en cours pour ce projet.");
  const o = await ouvrirConversation(projectId, "projet", null, "complete");
  if (!o.ok) return o;
  const conv = await conversationParUuid(o.conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  const [brief] = await db.select({ statut: briefs.statut }).from(briefs).where(eq(briefs.projectId, projectId));
  const aDitQuelqueChose = ((conv.messages as { role: string }[]) ?? []).some((m) => m.role === "user");
  if (!brief && !aDitQuelqueChose) return ERR("Parle d'abord de ton projet à l'agent : l'installateur part de la conversation.");
  const etapes = etapesNeuves();
  const valeurs = { statut: "en_cours" as const, etapes, erreur: null, updatedAt: new Date() };
  if (existante) {
    await db.update(creationsProjet).set({ ...valeurs, createdAt: new Date() }).where(eq(creationsProjet.id, existante.id));
    return { ok: true, creationId: existante.id };
  }
  const [c] = await db.insert(creationsProjet).values({ projectId, ...valeurs }).returning({ id: creationsProjet.id });
  return { ok: true, creationId: c!.id };
}

/** Resumes a creation that failed or was stopped: the blocked step starts over from zero (new proposal). */
export async function reprendreCreation(projectId: number): Promise<Resultat> {
  const c = await lireCreation(projectId);
  if (!c) return ERR("Aucune création pour ce projet.");
  if (c.statut === "en_cours") return ERR("La création est déjà en cours.");
  if (c.statut === "termine") return ERR("La création est terminée.");
  const etapes = lireEtapes(c).map((e) => (estFinale(e) ? e : { ...e, statut: "a_venir" as const, essais: 0, erreur: null, propositionUuid: e.statut === "echoue" || e.statut === "en_cours" ? null : e.propositionUuid }));
  // An old creation stopped (or failed) on a sheets step, removed since, has nothing left to do: it ends.
  await ecrire(c, etapes, { statut: statutDepuisEtapes(etapes, "en_cours"), erreur: null });
  return { ok: true };
}

/** "Écrire les fiches" (intents screen, after the creation): ONE `fiche-plan` REQUEST PER CLIP (lib/tasks/requests-*.ts: references, missing assets,
 * prompts, images, Open H3 IR compilation), posed in screenplay order, INDEPENDENT of the creation (2026-11-09, wave 4b). By default the clips
 * without a sheet; `tous`: also those that have one (recompiled, the old prompt stays in the history). A clip whose request is already running is skipped.
 * Refused while a creation runs: worker/images.ts then holds back the project's images, the sheets would wait. */
export async function lancerFichesApresCreation(projectId: number, options: { tous?: boolean } = {}): Promise<Resultat<{ lancees: number; demandeIds: number[]; erreurs: string[] }>> {
  const c = await lireCreation(projectId);
  if (c?.statut === "en_cours") return ERR("La préparation est encore en cours : les fiches s'écrivent une fois le scénario relu.");
  const lus = await db.select({ id: plans.id, uuid: plans.uuid, statut: plans.statut }).from(plans).where(eq(plans.projectId, projectId));
  const occupes = new Set(
    (await db.select({ cibleId: demandes.cibleId }).from(demandes).where(and(eq(demandes.projectId, projectId), eq(demandes.cibleType, "plan"), eq(demandes.statut, "en_cours")))).map((d) => d.cibleId),
  );
  const uuids = plansAEcrire(lus.map((p) => ({ uuid: p.uuid, aUneFiche: p.statut !== "brouillon", demandeEnCours: occupes.has(p.id) })), options.tous);
  if (uuids.length === 0) return ERR(lus.length === 0 ? "Ce projet n'a pas encore de plan." : "Aucun plan à écrire : chaque plan a sa fiche ou une demande en cours.");
  const r = await lancerDemandesFiches(projectId, uuids);
  if (r.lancees === 0) return ERR(r.erreurs[0] ?? "Aucune fiche n'a pu être lancée.");
  return { ok: true, ...r };
}

/** Stops the creation: what is running is cancelled (nothing already written is undone). */
export async function arreterCreation(projectId: number): Promise<Resultat> {
  const c = await lireCreation(projectId);
  if (!c) return ERR("Aucune création pour ce projet.");
  if (c.statut !== "en_cours") return ERR("La création n'est pas en cours.");
  const [conv] = await db.select({ id: agentConversations.id }).from(agentConversations).where(eq(agentConversations.projectId, projectId));
  if (conv) await arreterTravaux(conv.id);
  await ecrire(c, lireEtapes(c), { statut: "arretee", erreur: null });
  return { ok: true };
}

/** One turn of the pilot: advances each ongoing creation by one transition. Never rejects (a creation that
 * crashes goes to failure with its message, the others carry on). Returns the number of creations touched. */
export async function piloterCreations(options: { essais?: boolean } = {}): Promise<number> {
  const lignes = await db
    .select({ c: creationsProjet, nom: projects.nom })
    .from(creationsProjet)
    .innerJoin(projects, eq(projects.id, creationsProjet.projectId))
    .where(eq(creationsProjet.statut, "en_cours"));
  // The end-to-end test projects (end-to-end tests) are driven by their script, with its fake model:
  // the dev worker does not take them (it would call the real LLM server).
  // Same for replays: the script drives them itself.
  const enCours = lignes.filter((l) => options.essais || !(l.nom.startsWith("TEST_AGENTS_E2E") || l.nom.startsWith("REJEU "))).map((l) => l.c);
  let touchees = 0;
  for (const c of enCours) {
    try {
      if (await avancer(c)) touchees += 1;
      // Images whose prompt is written leave right away (ComfyUI route), while the LLM carries on with the steps.
      // This pass follows `avancer`: the prompts the step that just finished wrote leave in the same turn, including
      // those of the last step (worker/images.ts only takes them once the creation is finished).
      if ((await lancerImagesPretes(c.projectId)) > 0) touchees += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Création du projet ${c.projectId} : ${message}`);
      const etapes = lireEtapes(c);
      const cur = etapeCourante(etapes);
      if (cur) await ecrire(c, etapes.map((e) => (e === cur || e.cle === cur.cle ? { ...e, statut: "echoue" as const, erreur: message.slice(0, 500) } : e)));
    }
  }
  return touchees;
}

/** Observes the conversation and the proposal of the current step. */
async function observer(c: LigneCreation, cur: EtapeCreation, convId: number): Promise<ObservationEtape> {
  const [b] = await db.select({ statut: briefs.statut }).from(briefs).where(eq(briefs.projectId, c.projectId));
  const proposition = cur.propositionUuid ? await lireProposition(cur.propositionUuid) : null;
  return {
    occupe: await tacheActive(convId),
    brief: b ? (b.statut as ObservationEtape["brief"]) : "aucun",
    proposition: proposition
      ? {
          statut: proposition.statut,
          lot: proposition.lot != null,
          echecs: (proposition.lot?.echecs ?? 0) + (proposition.lot?.annulees ?? 0),
          bloques: proposition.compteurs.bloques,
          nbChangements: proposition.compteurs.total,
          erreur: proposition.erreur,
        }
      : null,
  };
}

/** The keys of the subtasks of a proposal in which a change is blocked by a check (not tickable). */
async function sousTachesBloquees(propositionUuid: string): Promise<Set<string>> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return new Set();
  const lignes = await db
    .select({ sousTache: propositionChangements.sousTache, avertissements: propositionChangements.avertissements, refuse: propositionChangements.refuseRaison })
    .from(propositionChangements)
    .where(eq(propositionChangements.propositionId, prop.id));
  return new Set(
    lignes
      .filter((l) => l.sousTache && !l.refuse && ((l.avertissements ?? []) as { type: string }[]).some((a) => a.type === "bloque_controle"))
      .map((l) => l.sousTache!),
  );
}

const remplacer = (etapes: EtapeCreation[], cle: CleEtapeCreation, maj: Partial<EtapeCreation>): EtapeCreation[] => etapes.map((e) => (e.cle === cle ? { ...e, ...maj } : e));

async function avancer(c: LigneCreation): Promise<boolean> {
  let etapes = lireEtapes(c);
  const cur = etapeCourante(etapes);
  if (!cur) {
    await ecrire(c, etapes);
    return true;
  }
  const o = await ouvrirConversation(c.projectId, "projet", null, "complete");
  if (!o.ok) throw new Error(o.erreur);
  const conv = (await conversationParUuid(o.conversationUuid))!;
  const obs = await observer(c, cur, conv.id);
  const d = decider(cur, obs);

  switch (d.type) {
    case "attendre":
      return false;
    case "fait":
      etapes = remplacer(etapes, cur.cle, { statut: "fait", detail: d.detail, erreur: null, ...(obs.proposition && obs.proposition.nbChangements === 0 ? { propositionUuid: null } : {}) });
      break;
    case "echouer":
      etapes = remplacer(etapes, cur.cle, { statut: "echoue", erreur: d.erreur });
      break;
    case "appliquer": {
      const r = await appliquerSelection(cur.propositionUuid!, { confirmeEcrasement: false });
      etapes = r.ok
        ? remplacer(etapes, cur.cle, {
            statut: "fait",
            detail: `${r.appliques} changement${r.appliques > 1 ? "s" : ""} écrit${r.appliques > 1 ? "s" : ""}${r.ecartes ? ` · ${r.ecartes} écarté${r.ecartes > 1 ? "s" : ""} (à refaire depuis l'agent)` : ""}`,
            erreur: null,
          })
        : remplacer(etapes, cur.cle, { statut: "echoue", erreur: r.erreur });
      break;
    }
    case "relancer-echecs": {
      const vue = await lireProposition(cur.propositionUuid!);
      // The subtasks that failed AND those whose change is blocked by a check (re-run once: the model
      // may do better, e.g. copy the right asset code).
      const bloquees = await sousTachesBloquees(cur.propositionUuid!);
      const aRelancer = (vue?.lot?.sousTaches ?? []).filter((s) => s.statut === "echoue" || s.statut === "annulee" || bloquees.has(s.cle));
      let derniereErreur: string | null = null;
      for (const s of aRelancer) {
        const r = await relancerSousTache(cur.propositionUuid!, s.cle);
        if (!r.ok) derniereErreur = r.erreur;
      }
      etapes = remplacer(etapes, cur.cle, derniereErreur && aRelancer.length > 0 ? { statut: "echoue", erreur: derniereErreur, essais: cur.essais + 1 } : { essais: cur.essais + 1 });
      break;
    }
    case "lancer": {
      const r = await lancerEtape(c.projectId, cur.cle, conv.uuid, etapes);
      if (r.type === "attendre") return false;
      etapes = remplacer(etapes, cur.cle, r.maj);
      break;
    }
  }
  await ecrire(c, etapes);
  return true;
}

/** Launches the step: calls the service function that carries it. A "rien à faire" refusal passes the step, a
 * "occupé" refusal makes it wait, any other refusal makes it fail (with the reason). */
async function lancerEtape(projectId: number, cle: CleEtapeCreation, convUuid: string, etapes: EtapeCreation[]): Promise<{ type: "attendre" } | { type: "etat"; maj: Partial<EtapeCreation> }> {
  const passe = (detail: string) => ({ type: "etat" as const, maj: { statut: "passe" as const, detail } });
  const lance = (propositionUuid: string | null) => ({ type: "etat" as const, maj: { statut: "en_cours" as const, propositionUuid, erreur: null } });
  const issue = (r: Resultat<{ propositionUuid?: string }>) => {
    if (r.ok) return lance(r.propositionUuid ?? null);
    if (estOccupe(r.erreur)) return { type: "attendre" as const };
    if (estRienAFaire(r.erreur)) return passe(r.erreur);
    return { type: "etat" as const, maj: { statut: "echoue" as const, erreur: r.erreur } };
  };
  const sourceDe = (autre: CleEtapeCreation) => etapes.find((e) => e.cle === autre)?.propositionUuid ?? null;
  const [brief] = await db.select({ statut: briefs.statut }).from(briefs).where(eq(briefs.projectId, projectId));

  switch (cle) {
    case "brief":
      if (brief && brief.statut !== "partiel") return passe("Brief déjà écrit.");
      {
        const r = await genererBrief(convUuid); // freezes the notes sheet into a draft: immediate, no model
        return r.ok ? passe("Brief écrit depuis la fiche de notes.") : issue(r);
      }
    case "squelette":
      if (brief?.statut === "valide") return passe("Structure déjà appliquée.");
      return issue(await genererProposition(convUuid));
    case "traitement":
      return issue(await genererTraitements(convUuid));
    case "scenarios":
      return issue(await genererScenarios(convUuid));
    case "registre":
      return issue(await genererRegistre(convUuid));
    case "inventaire":
      return issue(await genererInventaire(convUuid));
    case "relecture":
      return issue(await genererRelectures(convUuid));
    case "prompts-inventaire": {
      const source = sourceDe("inventaire");
      return source ? issue(await genererPromptsAssetsCrees(source)) : passe("Aucun asset ajouté par l'inventaire.");
    }
  }
}
