import { formatTemps, type SegmentExport } from "./montage";
import { cleMontage, type Tache } from "../taches";

/** Un export de l'épisode (table `montage_exports`, worker/montage-export.ts) vu comme UNE tâche du panneau du bandeau — règle pure,
 * sans base. Ce n'est pas une tâche GPU : elle s'affiche avec le genre « video » (icône, « Prête »), mais sa clé `montage:<id>` la tient
 * hors de la file GPU (`estHorsFileGpu`, lib/taches.ts) et sans bouton d'annulation (`estAnnulable`). */

export type EntreeTacheExport = {
  id: number;
  projectId: number;
  episodeId: number;
  projetNom: string | null;
  statut: string;
  /** L'instantané figé au clic (jsonb) : la fin de chaque segment y est explicite. */
  segments: unknown;
  nbIgnores: number;
  /** Durée réellement encodée (connue une fois l'export terminé). */
  dureeSecondes: number | null;
  erreur: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  vuAt: Date | null;
};

/** Durée attendue d'un instantané : somme des segments (fin - début ; une fin absente ne compte pas). */
export function dureeAttendue(segments: readonly Pick<SegmentExport, "debut" | "fin">[]): number {
  return segments.reduce((t, s) => t + (s.fin == null ? 0 : Math.max(0, s.fin - s.debut)), 0);
}

export function tacheDExport(e: EntreeTacheExport): Tache {
  const segments = (Array.isArray(e.segments) ? e.segments : []) as SegmentExport[];
  const n = segments.length;
  const duree = e.statut === "termine" && e.dureeSecondes != null ? e.dureeSecondes : dureeAttendue(segments);
  const morceaux = [
    `${n} segment${n > 1 ? "s" : ""}`,
    duree > 0 ? formatTemps(duree) : null,
    e.nbIgnores > 0 ? `${e.nbIgnores} ignoré${e.nbIgnores > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    cle: cleMontage(e.id),
    genre: "video",
    statut: e.statut,
    libelle: `Export du montage${e.projetNom ? ` · ${e.projetNom}` : ""}`,
    detail: morceaux.join(" · "),
    href: `/p/${e.projectId}/e/${e.episodeId}/montage`,
    projectId: e.projectId,
    assetId: null,
    // Pas de progression mesurée (ffmpeg n'en rend pas) : une barre indéterminée et l'étape en clair.
    progression: e.statut === "en_cours" ? { valeur: 0, max: 0, etape: "Encodage (ffmpeg)" } : null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: e.createdAt.toISOString(),
    startedAt: iso(e.startedAt),
    finishedAt: iso(e.finishedAt),
    vuAt: iso(e.vuAt),
    erreur: e.statut === "echoue" ? (e.erreur ?? "Échec de l'export") : null,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: null,
    annulationDemandee: false,
  };
}
