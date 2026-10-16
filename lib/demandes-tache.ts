import { progressionDemande, type EtapeDemande, type StatutDemande } from "./demandes";
import { cleDemande, type Tache } from "./taches";

/** Une demande (lib/demandes.ts) vue comme UNE tâche du panneau — règles pures, sans base. Les tâches qui en sont des étapes (run d'agent,
 * job vidéo) ne sont plus listées à part : cette ligne les remplace, du clic au résultat, sans trou entre deux étapes. */

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
  /** État de la tâche de l'étape courante : en file, ou en cours (jetons reçus de l'agent, progression du rendu). */
  tacheEnFile: boolean;
  tacheEnCours: boolean;
  /** Quand la tâche de l'étape courante est entrée dans la file : c'est avec cette date que la ligne prend son rang (le worker ordonne les tâches). */
  tacheCreeeLe: Date | null;
  jetons: number | null;
  annulationDemandee: boolean;
  progressionRendu: { valeur: number; max: number } | null;
  /** L'étape courante est le rendu vidéo (le genre de la ligne suit : agent ou vidéo). */
  rendu: boolean;
};

export function tacheDeDemande(e: EntreeTacheDemande): Tache {
  const enCours = e.statut === "en_cours";
  const p = progressionDemande(e.etapes);
  const courante = e.etapes.find((x) => x.statut === "en_cours") ?? null;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  // Une demande en cours est « en cours » dans le panneau, sauf quand la tâche de son étape attend son tour dans la file : elle prend alors
  // le rang de cette tâche (« n°2 », « derrière une vidéo »), comme n'importe quelle autre. Entre deux étapes (la suivante n'est pas encore
  // posée) elle reste « en cours » : jamais de trou.
  const detail = !enCours
    ? e.statut === "termine"
      ? "Essai terminé"
      : e.statut === "annulee"
        ? "Annulée"
        : "Itération"
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
  };
}
