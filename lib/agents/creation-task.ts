import { cleCreation, type Tache } from "../tasks/tasks";
import { ETAPES_CREATION, etapeCourante, normaliserEtapes, progression, statutEffectif, type EtapeCreation, type StatutCreation } from "./creation";

/** A project's creation (the installer) seen as ONE header task — pure rules, no database. The installer
 * runs its steps in the project's conversation (batches, single calls): they are grouped into one line, which leads to the
 * progress page. The rest (posters, images, videos, agent work outside the installer) keeps its lines. */

/** What the creation says about its work window: the agent tasks of THIS conversation, created between its start
 * and its end (or with no end while it works), are its own. After the end, manual work with the project's
 * agent becomes separate tasks again. */
export type FenetreCreation = { conversationId: number; debut: Date; fin: Date | null };

export type RunDeCreation = {
  conversationId: number | null;
  createdAt: Date;
  statut: string;
  vuAt: Date | null;
  jetons: number | null;
  annulationDemandee: boolean;
};

export function fenetreDeCreation(c: { statut: string; createdAt: Date; updatedAt: Date }, conversationId: number): FenetreCreation {
  return { conversationId, debut: c.createdAt, fin: c.statut === "en_cours" ? null : c.updatedAt };
}

export function estDeLaCreation(run: Pick<RunDeCreation, "conversationId" | "createdAt">, f: FenetreCreation): boolean {
  if (run.conversationId !== f.conversationId) return false;
  const t = run.createdAt.getTime();
  return t >= f.debut.getTime() && (f.fin == null || t <= f.fin.getTime());
}

export type EntreeTacheCreation = {
  projectId: number;
  projetNom: string | null;
  statut: StatutCreation;
  erreur: string | null;
  etapes: EtapeCreation[];
  createdAt: Date;
  updatedAt: Date;
  runs: RunDeCreation[];
};

const actif = (statut: string) => statut === "en_attente" || statut === "en_cours";

/** The header line, or null when there is nothing left to show (creation finished, failed or stopped with all its
 * tasks removed from the list: the panel's ✕ hides the tasks, here those of the creation). */
export function tacheDeCreation(entree: EntreeTacheCreation): Tache | null {
  // Steps read from the database may carry steps removed since (the sheets of the old phase 2): ignored (see `normaliserEtapes`).
  const etapes = normaliserEtapes(entree.etapes);
  const e = { ...entree, etapes, statut: statutEffectif(etapes, entree.statut) };
  const enCours = e.statut === "en_cours";
  if (!enCours && e.runs.length === 0) return null;

  const p = progression(e.etapes);
  const courante = etapeCourante(e.etapes);
  const libelleCourant = courante ? (ETAPES_CREATION.find((d) => d.cle === courante.cle)?.libelle ?? null) : null;

  const tourne = e.runs.some((r) => r.statut === "en_cours");
  const attend = !tourne && e.runs.some((r) => r.statut === "en_attente");
  const statut = enCours ? (attend ? "en_attente" : "en_cours") : e.statut === "termine" ? "termine" : e.statut === "echoue" ? "echoue" : "annulee";

  const finies = e.runs.filter((r) => !actif(r.statut));
  const nonVues = finies.some((r) => r.vuAt == null);
  const dernierVu = finies.reduce<Date | null>((m, r) => (r.vuAt && (!m || r.vuAt > m) ? r.vuAt : m), null);
  const vuAt = enCours ? null : nonVues ? null : (dernierVu ?? e.updatedAt);

  const jetons = e.runs.filter((r) => r.statut === "en_cours").reduce((s, r) => s + (r.jetons ?? 0), 0);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  return {
    cle: cleCreation(e.projectId),
    genre: "llm",
    statut,
    libelle: `Conception${e.projetNom ? ` · ${e.projetNom}` : ""}`,
    detail: statut === "termine" ? "Le projet est prêt" : "Préparation du projet",
    href: `/p/${e.projectId}/creation`,
    projectId: e.projectId,
    assetId: null,
    progression: enCours ? { valeur: p.faites, max: p.total, etape: libelleCourant } : null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: e.createdAt.toISOString(),
    startedAt: iso(e.createdAt),
    finishedAt: enCours ? null : iso(e.updatedAt),
    vuAt: iso(vuAt),
    erreur: statut === "echoue" ? (e.erreur ?? e.etapes.find((x) => x.statut === "echoue")?.erreur ?? "Échec") : null,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: jetons > 0 ? jetons : null,
    annulationDemandee: enCours && e.runs.some((r) => r.statut === "en_cours" && r.annulationDemandee),
  };
}
