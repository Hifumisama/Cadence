import { PRIORITE_GENRE, type GenreTache } from "../renders/gpu";

/** GPU tasks as seen by the user (header indicator) — pure rules,
 * without database or disk, shared by the server request (lib/tasks/queries-tasks.ts),
 * the API (app/api/taches) and the client panel. One table per task type
 * (asset_generations, jobs, agent_runs); this is only the common reading layer. */

export type { GenreTache };

/** Readable name of an agent skill's work, for the panel. */
export const LIBELLE_SKILL: Record<string, string> = {
  "brief-projet": "Brief du projet",
  "scenario-episode": "Scénario d'épisode",
  "scenario-scene": "Scénario d'une scène",
  "traitement-episode": "Traitement de l'épisode",
  traitements: "Traitement du film",
  "prompt-asset": "Prompt d'asset",
  "prompt-affiche": "Prompt d'affiche",
  "plan-h3ir": "Fiche de plan (Open H3 IR)",
  "traduction-intent": "Traduction de l'intent",
  "retouche-prompt": "Retouche du prompt",
  "references-plan": "Choix des références d'un plan",
  "assets-manquants": "Assets manquants d'un plan",
  "iteration-plan": "Correction après visionnage",
  scenarios: "Scénarios des épisodes",
  registre: "Registre d'assets",
  fiches: "Fiches de plan",
  "prompts-assets": "Prompts des assets créés",
  "inventaire-assets": "Inventaire des assets",
  "relecture-scenario": "Relecture du scénario",
  relectures: "Relecture des scénarios",
};

export type Tache = {
  /** Stable client-side identifier: « image:<uuid> », « video:<job id> », « llm:<uuid> », « lot: », « creation: », « demande: »
   * or « montage:<export id> » (see analyserCle). */
  cle: string;
  genre: GenreTache;
  /** en_attente | en_cours | termine | echoue | annulee (a cancelled video is
   * `echoue` in the database with the error « Annulée »: the reading presents it as `annulee`). */
  statut: string;
  libelle: string;
  detail: string | null;
  href: string;
  projectId: number;
  /** Asset concerned (images only). */
  assetId: number | null;
  progression: { valeur: number; max: number; etape: string | null } | null;
  /** Current preview of an image generation in progress (file overwritten at each step). */
  apercuSrc: string | null;
  /** Result of a finished image generation. */
  vignetteSrc: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  vuAt: string | null;
  erreur: string | null;
  /** Waiting rank (1 = next), null if the task is not waiting. */
  positionFile: number | null;
  /** An image waiting while a video job runs: it will go after it. */
  derriereVideo: boolean;
  /** Kind of the task in progress behind which this one waits (another task
   * holds the GPU), null if it waits behind nobody of another kind. */
  derriere: GenreTache | null;
  /** LLM call in progress: output tokens received (the maximum is unknown, so no bar). */
  jetons: number | null;
  /** Task in progress whose cancellation is requested: the worker interrupts ComfyUI. */
  annulationDemandee: boolean;
  /** LLM call of an agent conversation: a click on the task reopens the agent popup
   * on this conversation (instead of the project page). Absent for the other kinds. */
  conversationUuid?: string | null;
  /** The instructions given to an iteration (one per entry): an expandable detail of its line, so as not to weigh down the queue. */
  consignes?: string[];
  /** Iteration waiting its turn: the line leads to the clip's page, where its instruction is corrected until it leaves; ↑ ↓ reorder it in the queue. */
  consigneModifiable?: boolean;
};

export type ResumeTaches = {
  actives: number;
  enCours: number;
  enFile: number;
  echecsNonVus: number;
  terminesNonVus: number;
};

/** Finished tasks kept in the panel: recent (or not yet seen), and
 * never more than PLAFOND_TERMINEES. */
export const RETENTION_TERMINEES_JOURS = 7;
export const PLAFOND_TERMINEES = 20;
/** Failures and cancellations: visible for one day only (user's decision),
 * seen or not. The worker purges them from the database (worker/purge.ts). */
const RETENTION_ECHECS_HEURES = 24;

/** Cap of images waiting in the queue (one more request is refused). */
export const PLAFOND_FILE_IMAGES = 10;

export const estActive = (t: Pick<Tache, "statut">) => t.statut === "en_attente" || t.statut === "en_cours";
const estEchec = (t: Pick<Tache, "statut">) => t.statut === "echoue";
const estAnnulee = (t: Pick<Tache, "statut">) => t.statut === "annulee";
const estTerminee = (t: Pick<Tache, "statut">) => t.statut === "termine";

const t = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/** Keep the task in the panel? Active ones always; finished ones as long as
 * they are not seen, or if they are recent; failures and cancellations
 * for one day, seen or not. */
export function estAffichable(tache: Pick<Tache, "statut" | "vuAt" | "finishedAt" | "createdAt">, maintenant: Date): boolean {
  if (estActive(tache)) return true;
  const fin = t(tache.finishedAt) || t(tache.createdAt);
  const age = maintenant.getTime() - fin;
  if (estEchec(tache) || estAnnulee(tache)) return age <= RETENTION_ECHECS_HEURES * 3600 * 1000;
  if (tache.vuAt == null && estTerminee(tache)) return true;
  return age <= RETENTION_TERMINEES_JOURS * 24 * 3600 * 1000;
}

/** Orders and annotates the tasks: in progress first, then the queue in the order
 * the worker will take them (images before video, FIFO on a tie, no preemption),
 * then the finished ones from most recent to oldest (capped). Computes
 * `positionFile` and `derriereVideo`. */
export function ordonnerTaches(entrees: Tache[], maintenant: Date): Tache[] {
  const gardees = entrees.filter((x) => estAffichable(x, maintenant));
  const enCours = gardees.filter((x) => x.statut === "en_cours").sort((a, b) => t(a.startedAt ?? a.createdAt) - t(b.startedAt ?? b.createdAt));
  const attente = gardees.filter((x) => x.statut === "en_attente" && !estHorsFileGpu(x));
  const parAnciennete = (a: Tache, b: Tache) => t(a.createdAt) - t(b.createdAt);
  // The worker's order (worker/scheduler.ts): image, then llm, then video.
  // A request (iteration) goes before background work, as in the worker.
  const deDemande = (x: Tache) => (x.cle.startsWith("demande:") ? 0 : 1);
  const file = [...attente].sort((a, b) => deDemande(a) - deDemande(b) || PRIORITE_GENRE[a.genre] - PRIORITE_GENRE[b.genre] || parAnciennete(a, b));
  // Tasks outside the GPU (montage export) have their own loop in the worker: they take no rank in the GPU queue and
  // delay nobody; their rank is that of their own queue (FIFO).
  const fileHorsGpu = gardees.filter((x) => x.statut === "en_attente" && estHorsFileGpu(x)).sort(parAnciennete);
  const enCoursGpu = enCours.filter((x) => !estHorsFileGpu(x));
  const videoEnCours = enCoursGpu.some((x) => x.genre === "video");
  // The task holding the GPU: a task of another kind waits behind it.
  const genreEnCours = enCoursGpu[0]?.genre ?? null;
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
      // « derrière une vidéo / une image / un agent »: the task in progress is of another
      // kind (for the same kind, the rank is enough: « n°2 »).
      derriere: genreEnCours != null && genreEnCours !== x.genre ? genreEnCours : null,
    })),
    ...fileHorsGpu.map((x, i) => ({ ...x, positionFile: i + 1, derriereVideo: false, derriere: null })),
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

/** Image tasks of an asset (the sheet uses them to know when to refresh). */
export function tachesDeAsset(taches: Tache[], assetId: number): Tache[] {
  return taches.filter((x) => x.genre === "image" && x.assetId === assetId);
}

/** Is the asset's page (rendered server side) late on the indicator?
 * True when a task of this asset has another status than its generation in the
 * page, or is not yet there (launched from another tab). Progress is
 * deliberately ignored: the page does not reload at each step of the sampler. The
 * generations the indicator no longer shows (old, seen) have no effect. */
export function pageEstPerimee(tachesAsset: Tache[], page: { uuid: string; statut: string }[]): boolean {
  return tachesAsset.some((x) => {
    const g = page.find((p) => cleImage(p.uuid) === x.cle);
    return !g || g.statut !== x.statut;
  });
}

/** Key of an image generation / a video job / an LLM call. */
export const cleImage = (uuid: string) => `image:${uuid}`;
export const cleVideo = (jobId: number) => `video:${jobId}`;
export const cleLlm = (uuid: string) => `llm:${uuid}`;
/** An agent BATCH (a proposal whose generation is made of several tasks, e.g. one episode each): ONE entry in the header, identified by the PROPOSAL's uuid. */
export const cleLot = (propositionUuid: string) => `lot:${propositionUuid}`;
/** The CREATION of a project (the installer, lib/agents/creation.ts): ONE entry in the header for all its
 * steps, identified by the project. A click leads to the progress page (`/p/<id>/creation`). */
export const cleCreation = (projectId: number) => `creation:${projectId}`;

/** A REQUEST (lib/tasks/requests.ts: iterate a clip…): ONE entry for all its steps, identified by its id. */
export const cleDemande = (id: number) => `demande:${id}`;

/** An EXPORT of the episode (Montage page, table `montage_exports`), identified by its id. OUT-OF-GPU task (ffmpeg, separate loop of the
 * worker): displayed with the kind « video », but outside the GPU queue (`estHorsFileGpu`) and without cancellation. */
export const cleMontage = (exportId: number) => `montage:${exportId}`;

/** Task that does not go through the GPU queue (montage export): no rank in this queue, delays nobody and waits for nobody. */
export const estHorsFileGpu = (x: Pick<Tache, "cle">) => x.cle.startsWith("montage:");

/** Does the panel offer to cancel this task (active)? Not a montage export: it lasts a few seconds. */
export const estAnnulable = (x: Pick<Tache, "cle">) => !x.cle.startsWith("montage:");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function analyserCle(cle: string): { genre: GenreTache | "lot" | "creation" | "demande" | "montage"; ref: string } | null {
  const i = cle.indexOf(":");
  if (i < 0) return null;
  const genre = cle.slice(0, i);
  const ref = cle.slice(i + 1);
  if ((genre !== "image" && genre !== "video" && genre !== "llm" && genre !== "lot" && genre !== "creation" && genre !== "demande" && genre !== "montage") || !ref)
    return null;
  // A key comes from the browser: a malformed uuid or id must never
  // reach the database (Postgres would raise a syntax error instead of ignoring it).
  if ((genre === "image" || genre === "llm" || genre === "lot") && !UUID.test(ref)) return null;
  if ((genre === "video" || genre === "creation" || genre === "demande" || genre === "montage") && !/^\d+$/.test(ref)) return null;
  return { genre, ref };
}
