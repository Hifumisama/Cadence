import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, briefs, creationsProjet, projects, propositionChangements } from "../../db/schema";
import { estDeLaCreation, fenetreDeCreation } from "./creation-tache";
import { lireProposition } from "../queries-agents";
import {
  decider,
  estOccupe,
  estRienAFaire,
  estFinale,
  etapeCourante,
  etapesNeuves,
  statutDepuisEtapes,
  type CleEtapeCreation,
  type EtapeCreation,
  type ObservationEtape,
  type StatutCreation,
} from "./creation";
import { tacheActive } from "./runs";
import * as service from "./service";
import type { Resultat } from "./types";

/** Le PILOTE de l'installateur (règles dans lib/agents/creation.ts). `piloterCreations` est appelé à chaque tour de la
 * boucle du worker : une transition au plus par création en cours, état dans `creations_projet` (reprise sur
 * redémarrage, rien en mémoire). Les actions de l'interface (lancer, reprendre, arrêter) écrivent le même état. */

export type LigneCreation = typeof creationsProjet.$inferSelect;
const ERR = (erreur: string) => ({ ok: false as const, erreur });

export async function lireCreation(projectId: number): Promise<LigneCreation | null> {
  const [c] = await db.select().from(creationsProjet).where(eq(creationsProjet.projectId, projectId));
  return c ?? null;
}

const lireEtapes = (c: LigneCreation): EtapeCreation[] => (Array.isArray(c.etapes) ? (c.etapes as EtapeCreation[]) : etapesNeuves());

async function ecrire(c: LigneCreation, etapes: EtapeCreation[], extra: { statut?: StatutCreation; erreur?: string | null } = {}): Promise<void> {
  const statut = extra.statut ?? statutDepuisEtapes(etapes, c.statut as StatutCreation);
  await db
    .update(creationsProjet)
    .set({ etapes, statut, erreur: extra.erreur !== undefined ? extra.erreur : statut === "echoue" ? (etapes.find((e) => e.statut === "echoue")?.erreur ?? null) : null, updatedAt: new Date() })
    .where(eq(creationsProjet.id, c.id));
}

/** Les tâches d'agent de la création d'un projet (voir creation-tache.ts) : ce que la ligne « Conception » du header regroupe. */
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

/** Lance l'installateur : une création par projet (une précédente, finie ou arrêtée, est remplacée). Refusé si une
 * création est déjà en cours, ou si le projet n'a ni brief ni conversation de départ. */
export async function lancerCreation(projectId: number): Promise<Resultat<{ creationId: number }>> {
  const existante = await lireCreation(projectId);
  if (existante?.statut === "en_cours") return ERR("Une création est déjà en cours pour ce projet.");
  const o = await service.ouvrirConversation(projectId, "projet", null, "complete");
  if (!o.ok) return o;
  const conv = await service.conversationParUuid(o.conversationUuid);
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

/** Reprend une création en échec ou arrêtée : l'étape bloquée repart de zéro (nouvelle proposition). */
export async function reprendreCreation(projectId: number): Promise<Resultat> {
  const c = await lireCreation(projectId);
  if (!c) return ERR("Aucune création pour ce projet.");
  if (c.statut === "en_cours") return ERR("La création est déjà en cours.");
  if (c.statut === "termine") return ERR("La création est terminée.");
  const etapes = lireEtapes(c).map((e) => (estFinale(e) ? e : { ...e, statut: "a_venir" as const, essais: 0, erreur: null, propositionUuid: e.statut === "echoue" || e.statut === "en_cours" ? null : e.propositionUuid }));
  await ecrire(c, etapes, { statut: "en_cours", erreur: null });
  return { ok: true };
}

/** Arrête la création : ce qui tourne est annulé (rien n'est défait de ce qui est déjà écrit). */
export async function arreterCreation(projectId: number): Promise<Resultat> {
  const c = await lireCreation(projectId);
  if (!c) return ERR("Aucune création pour ce projet.");
  if (c.statut !== "en_cours") return ERR("La création n'est pas en cours.");
  const [conv] = await db.select({ id: agentConversations.id }).from(agentConversations).where(eq(agentConversations.projectId, projectId));
  if (conv) await service.arreterTravaux(conv.id);
  await ecrire(c, lireEtapes(c), { statut: "arretee", erreur: null });
  return { ok: true };
}

/** Un tour du pilote : fait avancer chaque création en cours d'une transition. Ne rejette jamais (une création qui
 * plante passe en échec avec son message, les autres continuent). Renvoie le nombre de créations touchées. */
export async function piloterCreations(options: { essais?: boolean } = {}): Promise<number> {
  const lignes = await db
    .select({ c: creationsProjet, nom: projects.nom })
    .from(creationsProjet)
    .innerJoin(projects, eq(projects.id, creationsProjet.projectId))
    .where(eq(creationsProjet.statut, "en_cours"));
  // Les projets des essais bout en bout (scripts/agents-e2e.ts) sont pilotés par leur script, avec son faux modèle :
  // le worker de dev ne les prend pas (il appellerait le vrai serveur LLM).
  // Idem pour les rejeux (scripts/rejeu-creation.ts, projets « REJEU … ») : le script les pilote lui-même.
  const enCours = lignes.filter((l) => options.essais || !(l.nom.startsWith("TEST_AGENTS_E2E") || l.nom.startsWith("REJEU "))).map((l) => l.c);
  let touchees = 0;
  for (const c of enCours) {
    try {
      if (await avancer(c)) touchees += 1;
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

/** Observe la conversation et la proposition de l'étape courante. */
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

/** Les clés des sous-tâches d'une proposition dont un changement est bloqué par un contrôle (non cochable). */
async function sousTachesBloquees(propositionUuid: string): Promise<Set<string>> {
  const prop = await service.propositionParUuid(propositionUuid);
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
  const o = await service.ouvrirConversation(c.projectId, "projet", null, "complete");
  if (!o.ok) throw new Error(o.erreur);
  const conv = (await service.conversationParUuid(o.conversationUuid))!;
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
      const r = await service.appliquerSelection(cur.propositionUuid!, { confirmeEcrasement: false });
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
      // Les sous-tâches en échec ET celles dont un changement est bloqué par un contrôle (relancées une fois : le modèle
      // peut mieux faire, ex. recopier le bon code d'asset).
      const bloquees = await sousTachesBloquees(cur.propositionUuid!);
      const aRelancer = (vue?.lot?.sousTaches ?? []).filter((s) => s.statut === "echoue" || s.statut === "annulee" || bloquees.has(s.cle));
      let derniereErreur: string | null = null;
      for (const s of aRelancer) {
        const r = await service.relancerSousTache(cur.propositionUuid!, s.cle);
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

type ResultatLancement = { type: "attendre" } | { type: "etat"; maj: Partial<EtapeCreation> };

/** Lance l'étape : appelle la fonction du service qui la porte. Un refus « rien à faire » passe l'étape, un refus
 * « occupé » la fait attendre, tout autre refus la fait échouer (avec la raison). */
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
        const r = await service.genererBrief(convUuid); // fige la fiche de notes en brouillon : immédiat, sans modèle
        return r.ok ? passe("Brief écrit depuis la fiche de notes.") : issue(r);
      }
    case "squelette":
      if (brief?.statut === "valide") return passe("Structure déjà appliquée.");
      return issue(await service.genererProposition(convUuid));
    case "scenarios":
      return issue(await service.genererScenarios(convUuid));
    case "registre":
      return issue(await service.genererRegistre(convUuid));
    case "inventaire":
      return issue(await service.genererInventaire(convUuid));
    case "voix":
      return issue(await service.genererVoix(convUuid));
    case "fiches":
      return issue(await service.genererFiches(convUuid));
    case "prompts-inventaire": {
      const source = sourceDe("inventaire");
      return source ? issue(await service.genererPromptsAssetsCrees(source)) : passe("Aucun asset ajouté par l'inventaire.");
    }
    case "prompts-fiches": {
      const source = sourceDe("fiches");
      return source ? issue(await service.genererPromptsAssetsCrees(source)) : passe("Aucun asset créé par les fiches.");
    }
  }
}
