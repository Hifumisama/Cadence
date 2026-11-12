import { progressionDemande, type EtapeDemande, type StatutDemande } from "./requests";
import { cleDemande, type Tache } from "./tasks";

/** A request (lib/tasks/requests.ts) seen as ONE task of the panel — pure rules, without database. The tasks that are steps of it (agent run,
 * video job) are no longer listed separately: this line replaces them, from the click to the result, with no gap between two steps. */

export type EntreeTacheDemande = {
  id: number;
  projectId: number;
  libelle: string;
  href: string;
  statut: StatutDemande;
  erreur: string | null;
  etapes: EtapeDemande[];
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  vuAt: Date | null;
  /** State of the current step's task: queued, or in progress (tokens received from the agent, render progress). */
  tacheEnFile: boolean;
  tacheEnCours: boolean;
  /** When the current step's task entered the queue: it is with this date that the line takes its rank (the worker orders the tasks). */
  tacheCreeeLe: Date | null;
  jetons: number | null;
  annulationDemandee: boolean;
  progressionRendu: { valeur: number; max: number } | null;
  /** The current step is the video render (the line's kind follows: agent or video). */
  rendu: boolean;
  /** The words of the line once the request is finished, when it is not an iteration (« Plan ajouté »). */
  detailFin?: { termine: string; echoue: string };
  /** The instructions of the iteration, each as given (expandable in the line). */
  consignes?: string[];
};

export function tacheDeDemande(e: EntreeTacheDemande): Tache {
  const enCours = e.statut === "en_cours";
  const p = progressionDemande(e.etapes);
  const courante = e.etapes.find((x) => x.statut === "en_cours") ?? null;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  // A request in progress is « en cours » in the panel, except when its step's task waits its turn in the queue: it then takes
  // the rank of that task (« n°2 », « derrière une vidéo »), like any other. Between two steps (the next one is not yet posted)
  // it stays « en cours »: never a gap.
  const enAttente = e.statut === "en_attente";
  const detail = enAttente
    ? "En file · consigne modifiable jusqu'au départ"
    : !enCours
    ? e.statut === "termine"
      ? (e.detailFin?.termine ?? "Essai terminé")
      : e.statut === "annulee"
        ? "Annulée"
        : (e.detailFin?.echoue ?? "Itération")
    : `${courante?.libelle ?? "En cours"} · ${p.faites + 1}/${p.total}`;
  return {
    cle: cleDemande(e.id),
    genre: e.rendu ? "video" : "llm",
    statut: enCours ? (e.tacheEnFile ? "en_attente" : "en_cours") : e.statut,
    libelle: e.libelle,
    detail,
    href: e.href,
    projectId: e.projectId,
    assetId: null,
    progression: enCours ? (e.rendu && e.progressionRendu ? { valeur: e.progressionRendu.valeur, max: e.progressionRendu.max, etape: courante?.libelle ?? null } : { valeur: p.faites, max: p.total, etape: courante?.libelle ?? null }) : null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: (e.tacheEnFile && e.tacheCreeeLe ? e.tacheCreeeLe : e.createdAt).toISOString(),
    startedAt: iso(e.createdAt),
    finishedAt: iso(e.finishedAt),
    vuAt: iso(e.vuAt),
    erreur: e.statut === "echoue" ? (e.erreur ?? "Échec") : null,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: e.jetons,
    annulationDemandee: enCours && e.annulationDemandee,
    ...(e.consignes?.length ? { consignes: e.consignes } : {}),
    ...(enAttente ? { consigneModifiable: true } : {}),
  };
}
