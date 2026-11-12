/** Montage of an episode (2026-11-07, docs/PLAN_MONTAGE.md): PURE rules (no database or disk access), importable client-side
 * as well as worker-side. Two orders coexist:
 * - the SCÉNARIO order: `plans.ordre` (+ each clip's scene), all the clips of the episode;
 * - the FINAL MONTAGE order: the entries of `montage_entrees`, in the order of their `rang`. An entry points to a clip, the selected render
 *   for it and a non-destructive trim (start, end; the render stays whole). A clip can have 0, 1 or several entries.
 * Positions are displayed (« 04 »), never as an identifier (F03). */

/** Minimum duration of a trimmed clip: we never go below half a second. */
export const DUREE_MIN_CLIP = 0.5;
/** Snapping: the step (half a second) and the distance under which an edge sticks to the playhead. */
const PAS_AIMANT = 0.5;
const SEUIL_AIMANT_TETE = 0.2;

export type GenreRendu = "aperçu" | "final" | "import";

/** A readable render of a clip (finished, with its file). */
export type RenduMontage = {
  id: number;
  numeroRendu: number;
  genre: GenreRendu;
  /** Path relative to the media storage (`plans/<id>/…`): what the export reads. */
  chemin: string;
  /** Playback URL (`/api/media/…`). */
  src: string;
  /** Nominal duration of the render (the one the worker submitted, otherwise the clip's). */
  dureeSecondes: number;
  creeLe: string;
};

/** A clip of the episode, as the montage sees it. */
export type PlanMontage = {
  /** Technical key, for the actions only: never displayed nor in a URL. */
  id: number;
  uuid: string;
  titre: string;
  statut: string;
  sceneId: number | null;
  /** Rank in the SCÉNARIO ORDER (1-based), what is displayed as « sc. 04 ». */
  position: number;
  /** Planned duration, the one the clip occupies as long as it has no render. */
  dureePrevue: number;
  /** « CHAR_maya, prompt modifié » if the last render is stale, otherwise null. */
  perime: string | null;
  /** Error of the last attempt, if it failed. */
  erreur: string | null;
  /** Readable renders, from most recent to oldest. */
  rendus: RenduMontage[];
  /** The render of an entry that has not chosen one: the clip's selected attempt if it is readable, otherwise the most recent. */
  renduParDefautId: number | null;
};

export type EntreeMontage = {
  id: number;
  planId: number;
  /** null = the clip's default render. */
  renduRetenuId: number | null;
  debut: number;
  /** null = up to the end of the render. */
  fin: number | null;
};

export type SceneMontage = { id: number; titre: string };

/** An entry ready to display and play: its effective bounds, limited by the duration of the selected render. */
export type Clip = {
  entree: EntreeMontage;
  plan: PlanMontage;
  rendu: RenduMontage | null;
  debut: number;
  fin: number;
  duree: number;
  /** No render: the clip takes the planned duration of the clip (hatched), it is skipped at export. */
  prevu: boolean;
};

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The render an entry reads: the one it selected if it is still readable, otherwise the clip's default one. */
export function renduEffectif(entree: Pick<EntreeMontage, "renduRetenuId">, plan: Pick<PlanMontage, "rendus" | "renduParDefautId">): RenduMontage | null {
  const choisi = entree.renduRetenuId != null ? plan.rendus.find((r) => r.id === entree.renduRetenuId) : undefined;
  return choisi ?? plan.rendus.find((r) => r.id === plan.renduParDefautId) ?? plan.rendus[0] ?? null;
}

/** Effective bounds of an entry. With a render: start and end limited by its duration (end null = whole render), at least `DUREE_MIN_CLIP`.
 * Without a render: the clip's planned duration, without trimming. */
export function bornes(
  entree: Pick<EntreeMontage, "debut" | "fin">,
  dureeRendu: number | null,
  dureePrevue: number,
): { debut: number; fin: number; duree: number; prevu: boolean } {
  if (dureeRendu == null) {
    const d = Math.max(1, dureePrevue);
    return { debut: 0, fin: d, duree: d, prevu: true };
  }
  const total = Math.max(DUREE_MIN_CLIP, dureeRendu);
  const debut = borner(entree.debut, 0, total - DUREE_MIN_CLIP);
  const fin = entree.fin == null ? total : borner(entree.fin, debut + DUREE_MIN_CLIP, total);
  return { debut, fin, duree: fin - debut, prevu: false };
}

/** The clips of the montage, in entry order (an entry whose clip has disappeared is skipped). */
export function construireClips(entrees: EntreeMontage[], plans: PlanMontage[]): Clip[] {
  const parId = new Map(plans.map((p) => [p.id, p]));
  const clips: Clip[] = [];
  for (const entree of entrees) {
    const plan = parId.get(entree.planId);
    if (!plan) continue;
    const rendu = renduEffectif(entree, plan);
    clips.push({ entree, plan, rendu, ...bornes(entree, rendu?.dureeSecondes ?? null, plan.dureePrevue) });
  }
  return clips;
}

/** Start of each clip on the timeline (seconds since the start of the episode). */
export function debuts(durees: readonly number[]): number[] {
  const res: number[] = [];
  let t = 0;
  for (const d of durees) {
    res.push(t);
    t += d;
  }
  return res;
}

export const dureeTotale = (durees: readonly number[]): number => durees.reduce((s, d) => s + d, 0);

/** The clip under the instant `t` (the last one whose start is reached; 0 if the timeline is empty). */
export function indexA(t: number, starts: readonly number[]): number {
  for (let k = starts.length - 1; k >= 0; k--) if (t >= starts[k]! - 1e-6) return k;
  return 0;
}

/** Copy of the list where the element `de` has been moved to position `vers`. */
export function deplacer<T>(liste: readonly T[], de: number, vers: number): T[] {
  const res = [...liste];
  const [x] = res.splice(de, 1);
  if (x === undefined) return res;
  res.splice(borner(vers, 0, res.length), 0, x);
  return res;
}

export function inserer<T>(liste: readonly T[], item: T, a: number): T[] {
  const res = [...liste];
  res.splice(borner(a, 0, res.length), 0, item);
  return res;
}

/** Where to insert an element dropped at the instant `seconde`: before the first clip whose midpoint it has not passed. */
export function indexInsertion(durees: readonly number[], seconde: number): number {
  let acc = 0;
  for (let j = 0; j < durees.length; j++) {
    if (seconde < acc + durees[j]! / 2) return j;
    acc += durees[j]!;
  }
  return durees.length;
}

/** Dragging clip `k`: its new position when its CENTER is at `centre` (seconds), among the other clips. */
export function cibleGlisser(durees: readonly number[], k: number, centre: number): { index: number; debut: number } {
  const autres = durees.filter((_, j) => j !== k);
  let at = 0;
  let index = 0;
  for (let q = 0; q < autres.length; q++) {
    if (centre > at + autres[q]! / 2) {
      index = q + 1;
      at += autres[q]!;
    } else break;
  }
  return { index, debut: at };
}

/** Snapping of a trim edge: to the half second, or exactly onto the playhead if it is very close. */
export function aimanter(v: number, actif: boolean, tete?: number | null): number {
  if (!actif) return v;
  if (tete != null && Math.abs(v - tete) < SEUIL_AIMANT_TETE) return tete;
  return Math.round(v / PAS_AIMANT) * PAS_AIMANT;
}

// --- Two orders --------------------------------------------------------------------------------------------------------------------

/** The clips of the montage in the order of their FIRST entry (copies do not count). */
function ordreDesPlansAuMontage(entrees: readonly Pick<EntreeMontage, "planId">[]): number[] {
  const vus = new Set<number>();
  const res: number[] = [];
  for (const e of entrees) {
    if (vus.has(e.planId)) continue;
    vus.add(e.planId);
    res.push(e.planId);
  }
  return res;
}

/** The scenario order restricted to the clips present in the montage. */
function ordreScenarioAuMontage(entrees: readonly Pick<EntreeMontage, "planId">[], ordreScenario: readonly number[]): number[] {
  const presents = new Set(entrees.map((e) => e.planId));
  return ordreScenario.filter((id) => presents.has(id));
}

/** Does the montage deviate from the scenario order (badge « Montage différent du scénario »)? */
export function differeDuScenario(entrees: readonly Pick<EntreeMontage, "planId">[], ordreScenario: readonly number[]): boolean {
  const mo = ordreDesPlansAuMontage(entrees);
  const so = ordreScenarioAuMontage(entrees, ordreScenario);
  return mo.some((id, i) => so[i] !== id);
}

/** The entries (first occurrences of their clip) that are not at the rank the scenario would give them: they display « sc. NN ». */
export function entreesDecalees(entrees: readonly Pick<EntreeMontage, "id" | "planId">[], ordreScenario: readonly number[]): Set<number> {
  const so = ordreScenarioAuMontage(entrees, ordreScenario);
  const vus = new Set<number>();
  const res = new Set<number>();
  let i = 0;
  for (const e of entrees) {
    if (vus.has(e.planId)) continue;
    vus.add(e.planId);
    if (so[i] !== e.planId) res.add(e.id);
    i++;
  }
  return res;
}

/** « Recaler sur l'ordre des scènes »: the entries sorted according to the scenario order of their clip. Stable sort: the copies of one clip
 * keep their relative order, trims and selected renders are intact (they are the same entries). A clip unknown to the scenario goes to the end. */
export function recaler<E extends Pick<EntreeMontage, "planId">>(entrees: readonly E[], ordreScenario: readonly number[]): E[] {
  const rang = new Map(ordreScenario.map((id, i) => [id, i]));
  const r = (e: E) => rang.get(e.planId) ?? Number.MAX_SAFE_INTEGER;
  return entrees
    .map((e, i) => ({ e, i }))
    .sort((a, b) => r(a.e) - r(b.e) || a.i - b.i)
    .map((x) => x.e);
}

/** The clips with no entry at all (« Hors montage » band), in scenario order. */
export function plansHorsMontage<P extends Pick<PlanMontage, "id">>(plansScenario: readonly P[], entrees: readonly Pick<EntreeMontage, "planId">[]): P[] {
  const presents = new Set(entrees.map((e) => e.planId));
  return plansScenario.filter((p) => !presents.has(p.id));
}

/** Where a clip that has just been born (agent proposal, import) enters an already started montage: right after the last entry of the
 * clip that precedes it in the scenario (the nearest one present in the montage), otherwise before the first entry of a clip that follows it, otherwise
 * at the end. */
export function rangNouveauPlan(entrees: readonly Pick<EntreeMontage, "planId">[], ordreScenario: readonly number[], planId: number): number {
  const ici = ordreScenario.indexOf(planId);
  if (ici === -1) return entrees.length;
  for (let j = ici - 1; j >= 0; j--) {
    const id = ordreScenario[j]!;
    for (let k = entrees.length - 1; k >= 0; k--) if (entrees[k]!.planId === id) return k + 1;
  }
  for (let j = ici + 1; j < ordreScenario.length; j++) {
    const id = ordreScenario[j]!;
    const k = entrees.findIndex((e) => e.planId === id);
    if (k !== -1) return k;
  }
  return entrees.length;
}

// --- Export ---------------------------------------------------------------------------------------------------------------------------

/** A piece of the export: the file of the selected render and its trim (end null = up to the end of the file; the interface always provides it). */
export type SegmentExport = { chemin: string; debut: number; fin: number | null; titre: string };

/** What the export joins end to end: the entries that have a readable render, in order, trim applied. The others (no render, render in
 * failure) are counted as skipped. */
export function segmentsExport(clips: readonly Clip[]): { segments: SegmentExport[]; ignores: number; dureeSecondes: number } {
  const segments: SegmentExport[] = [];
  let ignores = 0;
  let dureeSecondes = 0;
  for (const c of clips) {
    if (c.prevu || !c.rendu) {
      ignores++;
      continue;
    }
    // The end is always explicit (nominal end of the render for a whole clip): the export outputs exactly what the timeline and the player
    // show, even if the file lasts a few frames longer than its nominal duration (10.13 s for a 10 s render).
    segments.push({ chemin: c.rendu.chemin, debut: c.debut, fin: c.fin, titre: c.plan.titre });
    dureeSecondes += c.duree;
  }
  return { segments, ignores, dureeSecondes };
}

/** What ffprobe reports about a file to export. */
export type SondeVideo = { largeur: number; hauteur: number; fps: number; duree: number; audio: boolean };

/** Output format: the largest frame of the segments (even dimensions), the highest frame rate (24 by default, 60 at most). */
export function formatSortie(sondes: readonly SondeVideo[]): { largeur: number; hauteur: number; fps: number } {
  let largeur = 0;
  let hauteur = 0;
  let fps = 0;
  for (const s of sondes) {
    if (s.largeur * s.hauteur > largeur * hauteur) {
      largeur = s.largeur;
      hauteur = s.hauteur;
    }
    if (Number.isFinite(s.fps) && s.fps > fps) fps = s.fps;
  }
  const pair = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { largeur: pair(largeur || 1280), hauteur: pair(hauteur || 720), fps: Math.min(60, Math.round(fps) || 24) };
}

const s3 = (n: number) => String(Math.round(n * 1000) / 1000);

/** Effective duration of a segment: from its start to its end, limited by the real duration of the file. */
export function dureeSegment(seg: Pick<SegmentExport, "debut" | "fin">, dureeFichier: number): number {
  const fin = seg.fin == null ? dureeFichier : Math.min(seg.fin, dureeFichier);
  return Math.max(0, fin - seg.debut);
}

/** ffmpeg arguments of the export: each segment read with `-ss` for its duration (`-t`), put in the same format (scaling without distortion,
 * black bars if needed, same frame rate), a silence for a render without an audio track, then everything is concatenated (`concat` filter,
 * H.264/AAC re-encoding: renders of different resolutions do not join as they are). */
export function argsExport(
  segments: readonly { chemin: string; debut: number; duree: number; audio: boolean }[],
  format: { largeur: number; hauteur: number; fps: number },
  sortie: string,
): string[] {
  const { largeur: W, hauteur: H, fps } = format;
  const args: string[] = ["-v", "error", "-y"];
  segments.forEach((s) => args.push("-ss", s3(s.debut), "-t", s3(s.duree), "-i", s.chemin));
  // One silence source per mute segment, after the videos.
  const silences = new Map<number, number>();
  segments.forEach((s, i) => {
    if (s.audio) return;
    silences.set(i, segments.length + silences.size);
    args.push("-f", "lavfi", "-t", s3(s.duree), "-i", "anullsrc=r=48000:cl=stereo");
  });
  const filtres: string[] = [];
  const paires: string[] = [];
  segments.forEach((s, i) => {
    filtres.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`);
    const source = s.audio ? `${i}:a` : `${silences.get(i)}:a`;
    filtres.push(`[${source}]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${s3(s.duree)}[a${i}]`);
    paires.push(`[v${i}][a${i}]`);
  });
  filtres.push(`${paires.join("")}concat=n=${segments.length}:v=1:a=1[v][a]`);
  args.push(
    "-filter_complex", filtres.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    sortie,
  );
  return args;
}

// --- Affichage ------------------------------------------------------------------------------------------------------------------------

/** 83.4 → « 1:23.4 ». */
export function formatTemps(t: number): string {
  const v = Math.max(0, t);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The four colour families of the clips (gold = done, scarlet = failure, hatched = nothing yet). */
export type FamilleStatut = "termine" | "encours" | "echoue" | "attente";

export function familleStatut(statut: string): FamilleStatut {
  if (statut === "termine" || statut === "previsualise") return "termine";
  if (statut === "en_cours" || statut === "rejoue") return "encours";
  if (statut === "echoue") return "echoue";
  return "attente";
}
