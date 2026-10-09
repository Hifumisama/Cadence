import { cleCreation, type Tache } from "../taches";
import { ETAPES_CREATION, etapeCourante, progression, type EtapeCreation, type StatutCreation } from "./creation";

/** La création d'un projet (l'installateur) vue comme UNE tâche du header — règles pures, sans base. L'installateur
 * lance ses étapes dans la conversation du projet (lots, appels seuls) : on les regroupe en une ligne, qui mène à la page
 * d'avancée. Le reste (affiches, images, vidéos, travail d'agent hors installateur) garde ses lignes. */

/** Ce que la création dit de sa fenêtre de travail : les tâches d'agent de CETTE conversation, créées entre son début
 * et sa fin (ou sans fin tant qu'elle travaille), sont les siennes. Après la fin, le travail manuel avec l'agent du
 * projet redevient des tâches à part. */
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

/** La ligne du header, ou null quand il n'y a plus rien à montrer (création terminée, échouée ou arrêtée dont les
 * tâches ont toutes été retirées de la liste : le ✕ du panneau masque les tâches, ici celles de la création). */
export function tacheDeCreation(e: EntreeTacheCreation): Tache | null {
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
