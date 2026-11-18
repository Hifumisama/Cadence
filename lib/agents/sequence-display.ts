import { estTempsFort, sansMarqueTempsFort } from "./chat-sequence";
import { momentsDeFiche, momentsRequis, type StatutFiche } from "./sheet";

/** The film's moments (interview notes sheet, `moments` section), shaped for the sequence component: numbered, each with an approximate
 * position in the film, and optionally grouped. Pure.
 *
 * The interview stores the moments as a flat ordered list of sentences, with no times and no acts (the treatment distributes them per scene
 * later). So the time of a moment is an even split of the duration, and the "by acts" view is an even split in thirds (beginning, middle,
 * end): both are said to be approximate on screen, never presented as the treatment's cut. */

export type MomentView = {
  /** 1-based rank in the film. */
  number: number;
  /** The moment's sentence, without the strong-moment mark. */
  text: string;
  /** The strong moment the user kept on the sequence card (« (temps fort) » in the sheet). */
  strong: boolean;
  /** Approximate start and end in seconds (even split of the duration); null when the duration is unknown. */
  startSeconds: number | null;
  endSeconds: number | null;
};

export type SequenceGroup = { label: string; moments: MomentView[] };

export type SequenceView = {
  moments: MomentView[];
  /** Who settled the moments as a whole (the sheet has one status per section, not per moment). */
  status: StatutFiche | "absent";
  /** A discreet French label for that status ("" when absent). */
  statusLabel: string;
  durationSeconds: number | null;
  /** How many moments the duration calls for (0: duration unknown). */
  expected: number;
  /** How many more the duration calls for (0 when enough, or duration unknown). */
  missing: number;
  /** Even thirds (Début / Milieu / Fin); empty under three moments, where a grouping would say nothing. */
  thirds: SequenceGroup[];
};

const STATUS_LABELS: Record<StatutFiche, string> = {
  fourni: "dits par toi",
  delegue: "laissés au scénariste",
  deduit: "proposés par le scénariste, à valider",
};

const THIRD_LABELS = ["Début", "Milieu", "Fin"] as const;

const validDuration = (d: unknown): number | null => (typeof d === "number" && Number.isFinite(d) && d > 0 ? d : null);

/** "m:ss" (1:05). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "≈ 0:20 – 0:30", or "" without times. */
export function timeLabel(m: MomentView): string {
  return m.startSeconds === null || m.endSeconds === null ? "" : `≈ ${formatTime(m.startSeconds)} – ${formatTime(m.endSeconds)}`;
}

export function buildSequence(contenu: Record<string, unknown>, status: StatutFiche | "absent"): SequenceView {
  const texts = momentsDeFiche(contenu);
  const duration = validDuration(contenu.dureeEpisodeSecondes);
  const n = texts.length;
  const moments: MomentView[] = texts.map((text, i) => ({
    number: i + 1,
    text: sansMarqueTempsFort(text),
    strong: estTempsFort(text),
    startSeconds: duration === null ? null : Math.round((i * duration) / n),
    endSeconds: duration === null ? null : Math.round(((i + 1) * duration) / n),
  }));
  const thirds: SequenceGroup[] =
    n < 3
      ? []
      : THIRD_LABELS.map((label, k) => ({ label, moments: moments.filter((_, i) => Math.min(2, Math.floor((i * 3) / n)) === k) }));
  return {
    moments,
    status: n === 0 ? "absent" : status,
    statusLabel: n === 0 || status === "absent" ? "" : STATUS_LABELS[status],
    durationSeconds: duration,
    expected: momentsRequis(contenu.dureeEpisodeSecondes),
    missing: Math.max(0, momentsRequis(contenu.dureeEpisodeSecondes) - n),
    thirds,
  };
}
