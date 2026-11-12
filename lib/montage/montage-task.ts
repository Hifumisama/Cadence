import { formatTemps, type SegmentExport } from "./montage";
import { cleMontage, type Tache } from "../tasks/tasks";

/** An export of the episode (table `montage_exports`, worker/montage-export.ts) seen as ONE task of the band's panel — pure rule,
 * no database. It is not a GPU task: it is displayed with the « video » kind (icon, « Prête »), but its key `montage:<id>` keeps it
 * out of the GPU queue (`estHorsFileGpu`, lib/tasks/tasks.ts) and without a cancel button (`estAnnulable`). */

export type EntreeTacheExport = {
  id: number;
  projectId: number;
  episodeId: number;
  projetNom: string | null;
  statut: string;
  /** The snapshot frozen on click (jsonb): the end of each segment is explicit in it. */
  segments: unknown;
  nbIgnores: number;
  /** Duration actually encoded (known once the export is finished). */
  dureeSecondes: number | null;
  erreur: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  vuAt: Date | null;
};

/** Expected duration of a snapshot: sum of the segments (end - start; a missing end does not count). */
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
    // No measured progress (ffmpeg does not report any): an indeterminate bar and the step in plain text.
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
