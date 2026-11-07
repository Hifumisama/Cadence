/** Montage d'un épisode (2026-11-07, docs/PLAN_MONTAGE.md) : règles PURES (aucun accès base ni disque), importables côté client
 * comme côté worker. Deux ordres coexistent :
 * - l'ordre du SCÉNARIO : `plans.ordre` (+ la scène de chaque plan), tous les plans de l'épisode ;
 * - l'ordre du MONTAGE FINAL : les entrées de `montage_entrees`, dans l'ordre de leur `rang`. Une entrée pointe un plan, le rendu retenu
 *   pour elle et un rognage non destructif (début, fin ; le rendu reste entier). Un plan peut avoir 0, 1 ou plusieurs entrées.
 * Les positions s'affichent (« 04 »), jamais comme identifiant (F03). */

/** Durée minimale d'un clip rogné : on ne descend jamais sous une demi-seconde. */
export const DUREE_MIN_CLIP = 0.5;
/** Aimantation : le pas (demi-seconde) et la distance sous laquelle un bord colle à la tête de lecture. */
export const PAS_AIMANT = 0.5;
export const SEUIL_AIMANT_TETE = 0.2;

export type GenreRendu = "aperçu" | "final" | "import";

/** Un rendu lisible d'un plan (terminé, avec son fichier). */
export type RenduMontage = {
  id: number;
  numeroRendu: number;
  genre: GenreRendu;
  /** Chemin relatif au stockage média (`plans/<id>/…`) : ce que l'export lit. */
  chemin: string;
  /** URL de lecture (`/api/media/…`). */
  src: string;
  /** Durée nominale du rendu (celle que le worker a soumise, sinon celle du plan). */
  dureeSecondes: number;
  creeLe: string;
};

/** Un plan de l'épisode, tel que le montage le voit. */
export type PlanMontage = {
  /** Clé technique, pour les actions seulement : jamais affichée ni dans une URL. */
  id: number;
  uuid: string;
  titre: string;
  statut: string;
  sceneId: number | null;
  /** Rang dans l'ORDRE DU SCÉNARIO (1-based), ce qu'on affiche « sc. 04 ». */
  position: number;
  /** Durée prévue, celle qu'occupe le plan tant qu'il n'a pas de rendu. */
  dureePrevue: number;
  /** « CHAR_maya, prompt modifié » si le dernier rendu est périmé, sinon null. */
  perime: string | null;
  /** Erreur du dernier essai, s'il a échoué. */
  erreur: string | null;
  /** Rendus lisibles, du plus récent au plus ancien. */
  rendus: RenduMontage[];
  /** Le rendu d'une entrée qui n'en a pas choisi : l'essai retenu du plan s'il est lisible, sinon le plus récent. */
  renduParDefautId: number | null;
};

export type EntreeMontage = {
  id: number;
  planId: number;
  /** null = rendu par défaut du plan. */
  renduRetenuId: number | null;
  debut: number;
  /** null = jusqu'au bout du rendu. */
  fin: number | null;
};

export type SceneMontage = { id: number; titre: string };

/** Une entrée prête à afficher et à lire : ses bornes effectives, bornées par la durée du rendu retenu. */
export type Clip = {
  entree: EntreeMontage;
  plan: PlanMontage;
  rendu: RenduMontage | null;
  debut: number;
  fin: number;
  duree: number;
  /** Pas de rendu : le clip occupe la durée prévue du plan (hachuré), il est ignoré à l'export. */
  prevu: boolean;
};

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Le rendu que lit une entrée : celui qu'elle a retenu s'il est encore lisible, sinon celui du plan par défaut. */
export function renduEffectif(entree: Pick<EntreeMontage, "renduRetenuId">, plan: Pick<PlanMontage, "rendus" | "renduParDefautId">): RenduMontage | null {
  const choisi = entree.renduRetenuId != null ? plan.rendus.find((r) => r.id === entree.renduRetenuId) : undefined;
  return choisi ?? plan.rendus.find((r) => r.id === plan.renduParDefautId) ?? plan.rendus[0] ?? null;
}

/** Bornes effectives d'une entrée. Avec un rendu : début et fin bornés par sa durée (fin null = rendu entier), au moins `DUREE_MIN_CLIP`.
 * Sans rendu : la durée prévue du plan, sans rognage. */
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

/** Les clips du montage, dans l'ordre des entrées (une entrée dont le plan a disparu est ignorée). */
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

/** Début de chaque clip sur la table (secondes depuis le début de l'épisode). */
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

/** Le clip sous l'instant `t` (le dernier dont le début est atteint ; 0 si la table est vide). */
export function indexA(t: number, starts: readonly number[]): number {
  for (let k = starts.length - 1; k >= 0; k--) if (t >= starts[k]! - 1e-6) return k;
  return 0;
}

/** Copie de la liste où l'élément `de` est passé en position `vers`. */
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

/** Où insérer un élément lâché à l'instant `seconde` : avant le premier clip dont il n'a pas dépassé le milieu. */
export function indexInsertion(durees: readonly number[], seconde: number): number {
  let acc = 0;
  for (let j = 0; j < durees.length; j++) {
    if (seconde < acc + durees[j]! / 2) return j;
    acc += durees[j]!;
  }
  return durees.length;
}

/** Glisser le clip `k` : sa nouvelle position quand son CENTRE est à `centre` (secondes), parmi les autres clips. */
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

/** Aimantation d'un bord de rognage : à la demi-seconde, ou exactement sur la tête de lecture si elle est tout près. */
export function aimanter(v: number, actif: boolean, tete?: number | null): number {
  if (!actif) return v;
  if (tete != null && Math.abs(v - tete) < SEUIL_AIMANT_TETE) return tete;
  return Math.round(v / PAS_AIMANT) * PAS_AIMANT;
}

// --- Deux ordres --------------------------------------------------------------------------------------------------------------------

/** Les plans du montage dans l'ordre de leur PREMIÈRE entrée (les copies ne comptent pas). */
export function ordreDesPlansAuMontage(entrees: readonly Pick<EntreeMontage, "planId">[]): number[] {
  const vus = new Set<number>();
  const res: number[] = [];
  for (const e of entrees) {
    if (vus.has(e.planId)) continue;
    vus.add(e.planId);
    res.push(e.planId);
  }
  return res;
}

/** L'ordre du scénario restreint aux plans présents au montage. */
export function ordreScenarioAuMontage(entrees: readonly Pick<EntreeMontage, "planId">[], ordreScenario: readonly number[]): number[] {
  const presents = new Set(entrees.map((e) => e.planId));
  return ordreScenario.filter((id) => presents.has(id));
}

/** Le montage s'écarte-t-il de l'ordre du scénario (pastille « Montage différent du scénario ») ? */
export function differeDuScenario(entrees: readonly Pick<EntreeMontage, "planId">[], ordreScenario: readonly number[]): boolean {
  const mo = ordreDesPlansAuMontage(entrees);
  const so = ordreScenarioAuMontage(entrees, ordreScenario);
  return mo.some((id, i) => so[i] !== id);
}

/** Les entrées (premières occurrences de leur plan) qui ne sont pas au rang que le scénario leur donnerait : elles affichent « sc. NN ». */
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

/** « Recaler sur l'ordre des scènes » : les entrées triées selon l'ordre du scénario de leur plan. Tri stable : les copies d'un même plan
 * gardent leur ordre relatif, rognages et rendus retenus sont intacts (ce sont les mêmes entrées). Un plan inconnu du scénario va à la fin. */
export function recaler<E extends Pick<EntreeMontage, "planId">>(entrees: readonly E[], ordreScenario: readonly number[]): E[] {
  const rang = new Map(ordreScenario.map((id, i) => [id, i]));
  const r = (e: E) => rang.get(e.planId) ?? Number.MAX_SAFE_INTEGER;
  return entrees
    .map((e, i) => ({ e, i }))
    .sort((a, b) => r(a.e) - r(b.e) || a.i - b.i)
    .map((x) => x.e);
}

/** Les plans sans aucune entrée (bandeau « Hors montage »), dans l'ordre du scénario. */
export function plansHorsMontage<P extends Pick<PlanMontage, "id">>(plansScenario: readonly P[], entrees: readonly Pick<EntreeMontage, "planId">[]): P[] {
  const presents = new Set(entrees.map((e) => e.planId));
  return plansScenario.filter((p) => !presents.has(p.id));
}

/** Où entre un plan qui vient de naître (proposition d'agent, import) dans un montage déjà commencé : juste après la dernière entrée du
 * plan qui le précède dans le scénario (le plus proche qui soit au montage), sinon avant la première entrée d'un plan qui le suit, sinon
 * à la fin. */
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

/** Un morceau de l'export : le fichier du rendu retenu et son rognage (fin null = jusqu'au bout du fichier). */
export type SegmentExport = { chemin: string; debut: number; fin: number | null; titre: string };

/** Ce que l'export met bout à bout : les entrées qui ont un rendu lisible, dans l'ordre, rognage appliqué. Les autres (sans rendu, rendu en
 * échec) sont comptées comme ignorées. */
export function segmentsExport(clips: readonly Clip[]): { segments: SegmentExport[]; ignores: number; dureeSecondes: number } {
  const segments: SegmentExport[] = [];
  let ignores = 0;
  let dureeSecondes = 0;
  for (const c of clips) {
    if (c.prevu || !c.rendu) {
      ignores++;
      continue;
    }
    segments.push({ chemin: c.rendu.chemin, debut: c.debut, fin: c.entree.fin == null ? null : c.fin, titre: c.plan.titre });
    dureeSecondes += c.duree;
  }
  return { segments, ignores, dureeSecondes };
}

/** Ce que ffprobe dit d'un fichier à exporter. */
export type SondeVideo = { largeur: number; hauteur: number; fps: number; duree: number; audio: boolean };

/** Format de sortie : la plus grande image des segments (dimensions paires), la cadence la plus haute (24 par défaut, 60 au plus). */
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

/** Durée effective d'un segment : de son début à sa fin, bornée par la durée réelle du fichier. */
export function dureeSegment(seg: Pick<SegmentExport, "debut" | "fin">, dureeFichier: number): number {
  const fin = seg.fin == null ? dureeFichier : Math.min(seg.fin, dureeFichier);
  return Math.max(0, fin - seg.debut);
}

/** Arguments ffmpeg de l'export : chaque segment lu de `-ss` sur sa durée (`-t`), mis au même format (mise à l'échelle sans déformer,
 * bandes noires au besoin, même cadence), un silence pour un rendu sans piste son, puis tout est concaténé (filtre `concat`, ré-encodage
 * H.264/AAC : des rendus de résolutions différentes ne se collent pas tels quels). */
export function argsExport(
  segments: readonly { chemin: string; debut: number; duree: number; audio: boolean }[],
  format: { largeur: number; hauteur: number; fps: number },
  sortie: string,
): string[] {
  const { largeur: W, hauteur: H, fps } = format;
  const args: string[] = ["-v", "error", "-y"];
  segments.forEach((s) => args.push("-ss", s3(s.debut), "-t", s3(s.duree), "-i", s.chemin));
  // Une source de silence par segment muet, après les vidéos.
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

/** Les quatre familles de couleur des clips (or = fait, écarlate = échec, hachuré = rien encore). */
export type FamilleStatut = "termine" | "encours" | "echoue" | "attente";

export function familleStatut(statut: string): FamilleStatut {
  if (statut === "termine" || statut === "previsualise") return "termine";
  if (statut === "en_cours" || statut === "rejoue") return "encours";
  if (statut === "echoue") return "echoue";
  return "attente";
}
