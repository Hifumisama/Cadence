/** Batches of the agent system — PURE rules (no database or Next), shared by the server, the
 * worker, the header and the tests. A BATCH is a proposal whose generation is made up of
 * several `agent_runs` tasks, one per SUBTASK (e.g. an episode). See docs/CONCEPTION_AGENTS.md
 * (step 1: episode screenplays, 2026-10-02).
 *
 * Decisions: the proposal stays `en_generation` as long as a subtask is still active; it
 * becomes `prete` as soon as all are closed and at least one succeeded (isolated failures are
 * shown in the review, re-runnable); `echouee` only if EVERYTHING failed; `rejetee` if everything
 * was cancelled. Results already written are never lost. */

const PREFIXE_CLE_EPISODE = "ep:";

/** Subtask key of an episode (`agent_runs.cle_sous_tache`). */
export const cleSousTacheEpisode = (episodeId: number): string => `${PREFIXE_CLE_EPISODE}${episodeId}`;

export function episodeIdDeCle(cle: string | null | undefined): number | null {
  if (!cle || !cle.startsWith(PREFIXE_CLE_EPISODE)) return null;
  const n = Number(cle.slice(PREFIXE_CLE_EPISODE.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

const PREFIXE_CLE_SCENE = "scene:";

/** Subtask key of a scene (step E: a feature film's screenplay is written scene by scene). */
export const cleSousTacheScene = (sceneId: number): string => `${PREFIXE_CLE_SCENE}${sceneId}`;

export function sceneIdDeCle(cle: string | null | undefined): number | null {
  if (!cle || !cle.startsWith(PREFIXE_CLE_SCENE)) return null;
  const n = Number(cle.slice(PREFIXE_CLE_SCENE.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Display group of an episode in a batch's review (`proposition_changements.groupe`). */
export const groupeEpisode = (episodeId: number): string => `ep-${episodeId}`;

export function episodeIdDeGroupe(groupe: string): number | null {
  const m = /^ep-(\d+)$/.exec(groupe);
  return m ? Number(m[1]) : null;
}

/** `ordre` space reserved for each subtask: a batch's changes stay in subtask order,
 * and re-running one does not disturb the others. */
export const PAS_ORDRE_SOUS_TACHE = 100_000;

export type StatutRun = "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";

/** What needs to be known about a batch task. */
export type RunLot = {
  id: number;
  uuid: string;
  cle: string;
  libelle: string | null;
  statut: StatutRun | string;
  progressionJetons: number | null;
  erreur: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  vuAt: Date | null;
  annulationDemandeeAt: Date | null;
};

export const estRunActif = (r: Pick<RunLot, "statut">): boolean => r.statut === "en_attente" || r.statut === "en_cours";

/** The last task set for each key (a re-run replaces the previous one), in the order in which
 * the subtasks were first created. `relancee`: an older task exists. */
export function dernieresSousTaches(runs: RunLot[]): { run: RunLot; relancee: boolean; rang: number }[] {
  const parCle = new Map<string, RunLot[]>();
  for (const r of [...runs].sort((a, b) => a.id - b.id)) parCle.set(r.cle, [...(parCle.get(r.cle) ?? []), r]);
  return [...parCle.values()]
    .map((liste, rang) => ({ run: liste[liste.length - 1]!, relancee: liste.length > 1, rang }))
    .sort((a, b) => a.rang - b.rang);
}

/** Rank (0, 1, 2…) of a key in the batch, by order of first creation. */
export function rangSousTache(runs: RunLot[], cle: string): number {
  const ordre = dernieresSousTaches(runs);
  const i = ordre.findIndex((x) => x.run.cle === cle);
  return i >= 0 ? i : ordre.length;
}

export type ComptesLot = { total: number; terminees: number; echecs: number; annulees: number; actives: number };

export function comptesLot(runs: RunLot[]): ComptesLot {
  const dernieres = dernieresSousTaches(runs).map((x) => x.run);
  return {
    total: dernieres.length,
    terminees: dernieres.filter((r) => r.statut === "termine").length,
    echecs: dernieres.filter((r) => r.statut === "echoue").length,
    annulees: dernieres.filter((r) => r.statut === "annulee").length,
    actives: dernieres.filter(estRunActif).length,
  };
}

/** The status a batch's proposal must have, based on its subtasks. */
export function statutPropositionDuLot(c: ComptesLot): "en_generation" | "prete" | "echouee" | "rejetee" {
  if (c.actives > 0) return "en_generation";
  if (c.terminees > 0) return "prete";
  if (c.total > 0 && c.annulees === c.total) return "rejetee";
  return "echouee";
}

/** Message for a batch proposal that produced nothing. */
export function erreurDuLot(runs: RunLot[]): string {
  const echec = dernieresSousTaches(runs).find((x) => x.run.statut === "echoue")?.run;
  return echec?.erreur ? `Toutes les sous-tâches ont échoué. Première erreur : ${echec.erreur}` : "Toutes les sous-tâches ont échoué.";
}

/** "3/12 · 1 échec · 2 annulées" — the batch's progress line. */
export function resumeAvancement(c: ComptesLot): string {
  const closes = c.terminees + c.echecs + c.annulees;
  return [
    `${closes}/${c.total}`,
    c.echecs > 0 ? `${c.echecs} échec${c.echecs > 1 ? "s" : ""}` : null,
    c.annulees > 0 ? `${c.annulees} annulée${c.annulees > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Batch view for the header (one entry per batch, not one line per subtask)
// ---------------------------------------------------------------------------

export type EtatLotHeader = {
  statut: "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";
  /** Closed subtasks / total: the "3/12" bar. */
  progression: { valeur: number; max: number; etape: string | null };
  /** Tokens of the running subtask (the maximum is unknown). */
  jetons: number | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  vuAt: Date | null;
  erreur: string | null;
  annulationDemandee: boolean;
  detail: string;
};

const min = (a: Date | null, b: Date | null) => (a == null ? b : b == null ? a : a < b ? a : b);
const max = (a: Date | null, b: Date | null) => (a == null ? b : b == null ? a : a > b ? a : b);

/** A batch's aggregate state as the header shows it. The batch is "en cours" as soon as a
 * subtask runs; between two subtasks (the GPU is busy with something else) it is "en attente"
 * but its bar keeps its progress. */
export function etatLotPourHeader(runs: RunLot[]): EtatLotHeader | null {
  const dernieres = dernieresSousTaches(runs).map((x) => x.run);
  if (dernieres.length === 0) return null;
  const c = comptesLot(runs);
  const enCours = dernieres.find((r) => r.statut === "en_cours") ?? null;
  const closes = c.terminees + c.echecs + c.annulees;

  let statut: EtatLotHeader["statut"];
  if (enCours) statut = "en_cours";
  else if (c.actives > 0) statut = "en_attente";
  else if (c.terminees > 0) statut = "termine";
  else if (c.annulees === c.total) statut = "annulee";
  else statut = "echoue";

  let debut: Date | null = null;
  let fin: Date | null = null;
  let creation = dernieres[0]!.createdAt;
  for (const r of runs) {
    debut = min(debut, r.startedAt);
    fin = max(fin, r.finishedAt);
    if (r.createdAt < creation) creation = r.createdAt;
  }
  const premiereErreur = dernieres.find((r) => r.statut === "echoue" && r.erreur)?.erreur ?? null;
  return {
    statut,
    progression: { valeur: closes, max: c.total, etape: enCours?.libelle ?? null },
    jetons: enCours?.progressionJetons ?? null,
    createdAt: creation,
    startedAt: debut,
    finishedAt: c.actives === 0 ? fin : null,
    // A batch is "seen" when ALL its tasks are (marking seen sets them all).
    vuAt: dernieres.every((r) => r.vuAt != null) ? (dernieres.map((r) => r.vuAt!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null) : null,
    erreur: statut === "echoue" ? premiereErreur ?? "Toutes les sous-tâches ont échoué" : c.echecs > 0 && c.actives === 0 ? `${c.echecs} sous-tâche${c.echecs > 1 ? "s" : ""} en échec` : null,
    annulationDemandee: dernieres.some((r) => r.annulationDemandeeAt != null && estRunActif(r)),
    detail: resumeAvancement(c),
  };
}
