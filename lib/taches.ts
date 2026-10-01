import { PRIORITE_GENRE, domaineDe, type GenreTache } from "./gpu";

/** Tâches du GPU vues par l'utilisateur (indicateur du header) — règles pures,
 * sans base ni disque, partagées par la requête serveur (lib/queries-taches.ts),
 * l'API (app/api/taches) et le panneau client. Une table par type de tâche
 * (asset_generations, jobs, agent_runs) ; ceci n'est que la couche de lecture
 * commune. */

export type { GenreTache };

/** Nom lisible du travail d'un skill d'agent, pour le panneau. */
export const LIBELLE_SKILL: Record<string, string> = {
  "brief-projet": "Brief du projet",
  "scenario-episode": "Scénario d'épisode",
  "prompt-asset": "Prompt d'asset",
  "prompt-voix": "Prompt de voix",
  "plan-h3": "Plans H3",
  "iteration-plan": "Itération de plan",
  scenarios: "Scénarios des épisodes",
};

export type Tache = {
  /** Identifiant stable côté client : « image:<uuid> », « video:<id du job> » ou « llm:<uuid> ». */
  cle: string;
  genre: GenreTache;
  /** en_attente | en_cours | termine | echoue | annulee (une vidéo annulée est
   * `echoue` en base avec l'erreur « Annulée » : la lecture la présente `annulee`). */
  statut: string;
  libelle: string;
  detail: string | null;
  href: string;
  projectId: number;
  /** Asset concerné (images seulement). */
  assetId: number | null;
  progression: { valeur: number; max: number; etape: string | null } | null;
  /** Aperçu courant d'une génération d'image en cours (fichier écrasé à chaque étape). */
  apercuSrc: string | null;
  /** Résultat d'une génération d'image terminée. */
  vignetteSrc: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  vuAt: string | null;
  erreur: string | null;
  /** Rang d'attente (1 = prochaine), null si la tâche n'attend pas. */
  positionFile: number | null;
  /** Une image qui attend pendant qu'un job vidéo tourne : elle passera après lui. */
  derriereVideo: boolean;
  /** Genre de la tâche en cours derrière laquelle celle-ci attend (une autre
   * tâche tient le GPU), null si elle n'attend derrière personne d'un autre genre. */
  derriere: GenreTache | null;
  /** Appel LLM en cours : jetons de sortie reçus (le maximum est inconnu, pas de barre). */
  jetons: number | null;
  /** Tâche en cours dont l'annulation est demandée : le worker interrompt ComfyUI. */
  annulationDemandee: boolean;
  /** Appel LLM d'une conversation d'agent : un clic sur la tâche rouvre la popup d'agent
   * sur cette conversation (au lieu de la page du projet). Absent pour les autres genres. */
  conversationUuid?: string | null;
};

export type ResumeTaches = {
  actives: number;
  enCours: number;
  enFile: number;
  echecsNonVus: number;
  terminesNonVus: number;
};

/** Tâches terminées gardées dans le panneau : récentes (ou pas encore vues), et
 * jamais plus de PLAFOND_TERMINEES. */
export const RETENTION_TERMINEES_JOURS = 7;
export const PLAFOND_TERMINEES = 20;
/** Échecs et annulations : visibles une journée seulement (décision de
 * l'utilisateur), vus ou non. Le worker les purge de la base (worker/purge.ts). */
export const RETENTION_ECHECS_HEURES = 24;

/** Plafond d'images en attente dans la file (une demande de plus est refusée). */
export const PLAFOND_FILE_IMAGES = 10;

export const estActive = (t: Pick<Tache, "statut">) => t.statut === "en_attente" || t.statut === "en_cours";
export const estEchec = (t: Pick<Tache, "statut">) => t.statut === "echoue";
export const estAnnulee = (t: Pick<Tache, "statut">) => t.statut === "annulee";
export const estTerminee = (t: Pick<Tache, "statut">) => t.statut === "termine";

const t = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/** Garde la tâche dans le panneau ? Les actives toujours ; les terminées tant
 * qu'elles ne sont pas vues, ou si elles sont récentes ; les échecs et annulations
 * une journée, vus ou non. */
export function estAffichable(tache: Pick<Tache, "statut" | "vuAt" | "finishedAt" | "createdAt">, maintenant: Date): boolean {
  if (estActive(tache)) return true;
  const fin = t(tache.finishedAt) || t(tache.createdAt);
  const age = maintenant.getTime() - fin;
  if (estEchec(tache) || estAnnulee(tache)) return age <= RETENTION_ECHECS_HEURES * 3600 * 1000;
  if (tache.vuAt == null && estTerminee(tache)) return true;
  return age <= RETENTION_TERMINEES_JOURS * 24 * 3600 * 1000;
}

/** Ordonne et annote les tâches : en cours d'abord, puis la file dans l'ordre où
 * le worker les prendra (images avant vidéo, FIFO à égalité, sans préemption),
 * puis les terminées de la plus récente à la plus ancienne (plafonnées). Calcule
 * `positionFile` et `derriereVideo`. */
export function ordonnerTaches(entrees: Tache[], maintenant: Date): Tache[] {
  const gardees = entrees.filter((x) => estAffichable(x, maintenant));
  const enCours = gardees.filter((x) => x.statut === "en_cours").sort((a, b) => t(a.startedAt ?? a.createdAt) - t(b.startedAt ?? b.createdAt));
  const attente = gardees.filter((x) => x.statut === "en_attente");
  const parAnciennete = (a: Tache, b: Tache) => t(a.createdAt) - t(b.createdAt);
  // L'ordre du worker (worker/ordonnanceur.ts) : image, puis llm, puis vidéo.
  const file = [...attente].sort((a, b) => PRIORITE_GENRE[a.genre] - PRIORITE_GENRE[b.genre] || parAnciennete(a, b));
  const videoEnCours = enCours.some((x) => x.genre === "video");
  // La tâche qui tient le GPU : une tâche d'un autre genre patiente derrière elle.
  const genreEnCours = enCours[0]?.genre ?? null;
  const finies = gardees
    .filter((x) => !estActive(x))
    .sort((a, b) => (t(b.finishedAt) || t(b.createdAt)) - (t(a.finishedAt) || t(a.createdAt)))
    .slice(0, PLAFOND_TERMINEES);

  return [
    ...enCours.map((x) => ({ ...x, positionFile: null, derriereVideo: false, derriere: null })),
    ...file.map((x, i) => ({
      ...x,
      positionFile: i + 1,
      derriereVideo: x.genre === "image" && videoEnCours,
      // « derrière une vidéo / une image / un agent » : la tâche en cours est d'un
      // autre genre (pour un même genre, le rang suffit : « n°2 »).
      derriere: genreEnCours != null && genreEnCours !== x.genre ? genreEnCours : null,
    })),
    ...finies.map((x) => ({ ...x, positionFile: null, derriereVideo: false, derriere: null })),
  ];
}

export function resumerTaches(taches: Tache[]): ResumeTaches {
  return {
    actives: taches.filter(estActive).length,
    enCours: taches.filter((x) => x.statut === "en_cours").length,
    enFile: taches.filter((x) => x.statut === "en_attente").length,
    echecsNonVus: taches.filter((x) => estEchec(x) && x.vuAt == null).length,
    terminesNonVus: taches.filter((x) => estTerminee(x) && x.vuAt == null).length,
  };
}

/** Tâches d'images d'un asset (la fiche s'en sert pour savoir quand rafraîchir). */
export function tachesDeAsset(taches: Tache[], assetId: number): Tache[] {
  return taches.filter((x) => x.genre === "image" && x.assetId === assetId);
}

/** La page de l'asset (rendue côté serveur) est-elle en retard sur l'indicateur ?
 * Vrai quand une tâche de cet asset a un autre statut que sa génération dans la
 * page, ou n'y figure pas encore (lancée depuis un autre onglet). La progression
 * est ignorée exprès : la page ne se recharge pas à chaque étape du sampler. Les
 * générations que l'indicateur ne montre plus (anciennes, vues) sont sans effet. */
export function pageEstPerimee(tachesAsset: Tache[], page: { uuid: string; statut: string }[]): boolean {
  return tachesAsset.some((x) => {
    const g = page.find((p) => cleImage(p.uuid) === x.cle);
    return !g || g.statut !== x.statut;
  });
}

/** Clé d'une génération d'image / d'un job vidéo / d'un appel LLM. */
export const cleImage = (uuid: string) => `image:${uuid}`;
export const cleVideo = (jobId: number) => `video:${jobId}`;
export const cleLlm = (uuid: string) => `llm:${uuid}`;
/** Un LOT d'agent (une proposition dont la génération est composée de plusieurs tâches, ex. un
 * épisode chacune) : UNE entrée dans le header, identifiée par l'uuid de la PROPOSITION. */
export const cleLot = (propositionUuid: string) => `lot:${propositionUuid}`;

/** Domaine GPU d'une tâche (voir lib/gpu.ts). */
export const domaineDeTache = (t: Pick<Tache, "genre">) => domaineDe(t.genre);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function analyserCle(cle: string): { genre: GenreTache | "lot"; ref: string } | null {
  const i = cle.indexOf(":");
  if (i < 0) return null;
  const genre = cle.slice(0, i);
  const ref = cle.slice(i + 1);
  if ((genre !== "image" && genre !== "video" && genre !== "llm" && genre !== "lot") || !ref) return null;
  // Une clé vient du navigateur : un uuid ou un id mal formé ne doit jamais
  // atteindre la base (Postgres lèverait une erreur de syntaxe au lieu de l'ignorer).
  if ((genre === "image" || genre === "llm" || genre === "lot") && !UUID.test(ref)) return null;
  if (genre === "video" && !/^\d+$/.test(ref)) return null;
  return { genre, ref };
}
