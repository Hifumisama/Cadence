/** Lots du système d'agents — règles PURES (sans base ni Next), partagées par le serveur, le
 * worker, le header et les tests. Un LOT est une proposition dont la génération est composée de
 * plusieurs tâches `agent_runs`, une par SOUS-TÂCHE (ex. un épisode). Voir docs/CONCEPTION_AGENTS.md
 * (étape 1 : scénarios d'épisodes, 2026-10-02).
 *
 * Décisions : la proposition reste `en_generation` tant qu'il reste une sous-tâche active ; elle
 * devient `prete` dès que toutes sont closes et qu'au moins une a réussi (les échecs isolés sont
 * montrés dans la revue, relançables) ; `echouee` seulement si TOUT a échoué ; `rejetee` si tout
 * a été annulé. Les résultats déjà écrits ne se perdent jamais. */

export const PREFIXE_CLE_EPISODE = "ep:";

/** Clé de sous-tâche d'un épisode (`agent_runs.cle_sous_tache`). */
export const cleSousTacheEpisode = (episodeId: number): string => `${PREFIXE_CLE_EPISODE}${episodeId}`;

export function episodeIdDeCle(cle: string | null | undefined): number | null {
  if (!cle || !cle.startsWith(PREFIXE_CLE_EPISODE)) return null;
  const n = Number(cle.slice(PREFIXE_CLE_EPISODE.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Groupe d'affichage d'un épisode dans la revue d'un lot (`proposition_changements.groupe`). */
export const groupeEpisode = (episodeId: number): string => `ep-${episodeId}`;

export function episodeIdDeGroupe(groupe: string): number | null {
  const m = /^ep-(\d+)$/.exec(groupe);
  return m ? Number(m[1]) : null;
}

/** Espace d'`ordre` réservé à chaque sous-tâche : les changements d'un lot restent dans l'ordre
 * des sous-tâches, et relancer l'une ne bouscule pas les autres. */
export const PAS_ORDRE_SOUS_TACHE = 100_000;

export type StatutRun = "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";

/** Ce qu'il faut savoir d'une tâche d'un lot. */
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

/** La dernière tâche posée pour chaque clé (une relance remplace la précédente), dans l'ordre où
 * les sous-tâches ont été créées pour la première fois. `relancee` : une tâche plus ancienne existe. */
export function dernieresSousTaches(runs: RunLot[]): { run: RunLot; relancee: boolean; rang: number }[] {
  const parCle = new Map<string, RunLot[]>();
  for (const r of [...runs].sort((a, b) => a.id - b.id)) parCle.set(r.cle, [...(parCle.get(r.cle) ?? []), r]);
  return [...parCle.values()]
    .map((liste, rang) => ({ run: liste[liste.length - 1]!, relancee: liste.length > 1, rang }))
    .sort((a, b) => a.rang - b.rang);
}

/** Rang (0, 1, 2…) d'une clé dans le lot, selon l'ordre de première création. */
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

/** Le statut que doit avoir la proposition d'un lot, d'après ses sous-tâches. */
export function statutPropositionDuLot(c: ComptesLot): "en_generation" | "prete" | "echouee" | "rejetee" {
  if (c.actives > 0) return "en_generation";
  if (c.terminees > 0) return "prete";
  if (c.total > 0 && c.annulees === c.total) return "rejetee";
  return "echouee";
}

/** Message d'une proposition de lot qui n'a rien produit. */
export function erreurDuLot(runs: RunLot[]): string {
  const echec = dernieresSousTaches(runs).find((x) => x.run.statut === "echoue")?.run;
  return echec?.erreur ? `Toutes les sous-tâches ont échoué. Première erreur : ${echec.erreur}` : "Toutes les sous-tâches ont échoué.";
}

/** « 3/12 · 1 échec · 2 annulées » — la ligne de progression du lot. */
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
// Vue du lot pour le header (une entrée par lot, pas une ligne par sous-tâche)
// ---------------------------------------------------------------------------

export type EtatLotHeader = {
  statut: "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";
  /** Sous-tâches closes / total : la barre « 3/12 ». */
  progression: { valeur: number; max: number; etape: string | null };
  /** Jetons de la sous-tâche en cours (le maximum est inconnu). */
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

/** L'état agrégé d'un lot tel que le header le montre. Le lot est « en cours » dès qu'une
 * sous-tâche tourne ; entre deux sous-tâches (le GPU fait autre chose) il est « en attente »
 * mais sa barre garde son avancement. */
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
    // Un lot est « vu » quand TOUTES ses tâches le sont (marquer vu les pose toutes).
    vuAt: dernieres.every((r) => r.vuAt != null) ? (dernieres.map((r) => r.vuAt!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null) : null,
    erreur: statut === "echoue" ? premiereErreur ?? "Toutes les sous-tâches ont échoué" : c.echecs > 0 && c.actives === 0 ? `${c.echecs} sous-tâche${c.echecs > 1 ? "s" : ""} en échec` : null,
    annulationDemandee: dernieres.some((r) => r.annulationDemandeeAt != null && estRunActif(r)),
    detail: resumeAvancement(c),
  };
}
