/** An episode's TREATMENT (step E of the creation): before writing the clips, a first call splits the episode into scenes and says
 * for each what it tells, where it starts, where it ends and its weight. The durations are the CODE's job: the model cannot
 * add up (×2 discrepancies found), it gives weights and this is where they become seconds. Pure rules, tested. */

import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../clips/clip-checks";

const DUREE_PLAN_MIN = DUREE_GENERATION_MIN;
const DUREE_PLAN_MAX = DUREE_GENERATION_MAX;

/** Below this target duration, the episode is written in one piece (skill `scenario-episode`): one or two scenes, a treatment adds nothing.
 * Above it, even a short film is split: its scenes (2 to 5 clips) are written in parallel. */
export const SEUIL_TRAITEMENT_SECONDES = 90;

/** Target duration of a scene, in seconds, to set the number of scenes (about one scene per minute and a half). */
const DUREE_SCENE_MOYENNE = 90;

/** The range of scenes to request for a target duration (at least 3 for a film long enough to have a treatment). */
export function nombreDeScenesVise(dureeCibleSecondes: number): { min: number; max: number } {
  const milieu = dureeCibleSecondes / DUREE_SCENE_MOYENNE;
  return { min: Math.max(3, Math.round(milieu * 0.75)), max: Math.max(4, Math.round(milieu * 1.35)) };
}

export type TraitementScene = {
  intention: string;
  etatEntree: string;
  etatSortie: string;
  dureeCibleSecondes: number;
  /** What the author said about this scene (their words, as close as possible); empty if nothing. */
  momentsDeLAuteur: string;
};

const texte = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A treatment read from the database or from a proposal change: null if it does not have the expected shape. */
export function traitementDeScene(v: unknown): TraitementScene | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const duree = Number(o.dureeCibleSecondes);
  if (!texte(o.intention) || !Number.isFinite(duree) || duree <= 0) return null;
  return { intention: texte(o.intention), etatEntree: texte(o.etatEntree), etatSortie: texte(o.etatSortie), dureeCibleSecondes: Math.round(duree), momentsDeLAuteur: texte(o.momentsDeLAuteur) };
}

/** From weights (1 to 5, not seconds) to the scenes' target durations: the sum falls EXACTLY on the episode's duration, no scene
 * drops below a minimal clip. Largest remainder for rounding. */
export function repartirDureesScenes(poids: number[], dureeEpisodeSecondes: number): number[] {
  const n = poids.length;
  if (n === 0) return [];
  const total = Math.max(Math.round(dureeEpisodeSecondes), n * DUREE_PLAN_MIN);
  const p = poids.map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  const somme = p.reduce((a, b) => a + b, 0);
  // Each scene first keeps the minimum, the rest is shared in proportion to the weights.
  const reste = total - n * DUREE_PLAN_MIN;
  const parts = p.map((x) => (x / somme) * reste);
  const durees = parts.map((x) => DUREE_PLAN_MIN + Math.floor(x));
  let manque = total - durees.reduce((a, b) => a + b, 0);
  const ordre = parts.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; manque > 0; k = (k + 1) % n, manque--) durees[ordre[k]!.i]! += 1;
  return durees;
}

/** Tolerated gap between the sum of a scene's clips and its target duration before the code adjusts them. Below it, the model's durations
 * stay: they carry the pacing (a dialogue keeps its margin). */
const ECART_SCENE_TOLERE = 0.15;

/** Adjusts a scene's clip durations to its target duration: proportionally, in whole seconds from 4 to 10 s, then as close as possible to the target second by
 * second. No effect if the gap is within tolerance. If the target is out of reach (too few or too many clips), we get as close as possible:
 * the review's duration warning says the rest. */
export function ajusterDureesScene(durees: number[], cibleSecondes: number): number[] {
  if (durees.length === 0 || !(cibleSecondes > 0)) return durees;
  const borne = (x: number) => Math.min(DUREE_PLAN_MAX, Math.max(DUREE_PLAN_MIN, Math.round(x)));
  const actuelle = durees.map(borne);
  const total = actuelle.reduce((a, b) => a + b, 0);
  if (Math.abs(total - cibleSecondes) / cibleSecondes <= ECART_SCENE_TOLERE) return actuelle;
  const facteur = cibleSecondes / total;
  const res = actuelle.map((d) => borne(d * facteur));
  let ecart = Math.round(cibleSecondes) - res.reduce((a, b) => a + b, 0);
  const pas = ecart > 0 ? 1 : -1;
  // One step at a time, on the clip with the most margin: the general shape (which is long, which is short) is kept.
  while (ecart !== 0) {
    let choisi = -1;
    for (let i = 0; i < res.length; i++) {
      if (pas > 0 ? res[i]! >= DUREE_PLAN_MAX : res[i]! <= DUREE_PLAN_MIN) continue;
      if (choisi < 0 || (pas > 0 ? res[i]! < res[choisi]! : res[i]! > res[choisi]!)) choisi = i;
    }
    if (choisi < 0) break;
    res[choisi]! += pas;
    ecart -= pas;
  }
  return res;
}

/** What the returned treatment must respect; each defect is an error sent back to the model (a single re-prompt, see lib/llm/checks.ts). Pure. */
export function controlerTraitement(
  sortie: { scenes?: { titre?: string; intention?: string; etatEntree?: string; etatSortie?: string }[] },
  vise: { min: number; max: number },
): string[] {
  const l = sortie.scenes ?? [];
  const erreurs: string[] = [];
  if (l.length < vise.min || l.length > vise.max) {
    erreurs.push(`Tu as écrit ${l.length} scène${l.length > 1 ? "s" : ""} : il en faut entre ${vise.min} et ${vise.max}. ${l.length > vise.max ? "Fusionne les scènes qui partagent un lieu et un enjeu." : "Découpe à chaque changement de lieu, de moment ou d'enjeu."}`);
  }
  const vus = new Set<string>();
  for (const sc of l) {
    const t = (sc.titre ?? "").trim().toLowerCase();
    if (t && vus.has(t)) erreurs.push(`Deux scènes portent le titre « ${sc.titre} » : chaque scène a son titre.`);
    vus.add(t);
    for (const [champ, v] of [["intention", sc.intention], ["etatEntree", sc.etatEntree], ["etatSortie", sc.etatSortie]] as const) {
      if (!(v ?? "").trim()) erreurs.push(`La scène « ${sc.titre ?? "?"} » n'a pas de ${champ}.`);
    }
  }
  return erreurs;
}
