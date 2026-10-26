/** Le TRAITEMENT d'un épisode (étape E de la création) : avant d'écrire les plans, un premier appel découpe l'épisode en scènes et dit
 * pour chacune ce qu'elle raconte, d'où elle part, où elle arrive et son poids. Les durées sont du ressort du CODE : le modèle ne sait pas
 * additionner (écarts de ×2 constatés), il donne des poids et c'est ici qu'on en fait des secondes. Règles pures, testées. */

export const DUREE_PLAN_MIN = 5;
export const DUREE_PLAN_MAX = 15;

/** En dessous de cette durée visée, l'épisode s'écrit d'un seul tenant (skill `scenario-episode`) : une ou deux scènes, un traitement n'apporte rien.
 * Au-dessus, même un film court se découpe : ses scènes (2 à 5 plans) s'écrivent en parallèle. */
export const SEUIL_TRAITEMENT_SECONDES = 90;

/** Durée visée d'une scène, en secondes, pour fixer le nombre de scènes (une scène par minute et demie environ). */
const DUREE_SCENE_MOYENNE = 90;

/** La fourchette de scènes à demander pour une durée visée (au moins 3 pour un film assez long pour avoir un traitement). */
export function nombreDeScenesVise(dureeCibleSecondes: number): { min: number; max: number } {
  const milieu = dureeCibleSecondes / DUREE_SCENE_MOYENNE;
  return { min: Math.max(3, Math.round(milieu * 0.75)), max: Math.max(4, Math.round(milieu * 1.35)) };
}

export type TraitementScene = {
  intention: string;
  etatEntree: string;
  etatSortie: string;
  dureeCibleSecondes: number;
  /** Ce que l'auteur a dit de cette scène (ses mots, au plus près) ; vide si rien. */
  momentsDeLAuteur: string;
};

const texte = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Un traitement lu dans la base ou dans un changement de proposition : null s'il n'a pas la forme attendue. */
export function traitementDeScene(v: unknown): TraitementScene | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const duree = Number(o.dureeCibleSecondes);
  if (!texte(o.intention) || !Number.isFinite(duree) || duree <= 0) return null;
  return { intention: texte(o.intention), etatEntree: texte(o.etatEntree), etatSortie: texte(o.etatSortie), dureeCibleSecondes: Math.round(duree), momentsDeLAuteur: texte(o.momentsDeLAuteur) };
}

/** Des poids (1 à 5, pas des secondes) aux durées visées des scènes : la somme tombe EXACTEMENT sur la durée de l'épisode, aucune scène ne
 * descend sous un plan minimal. Plus grand reste pour l'arrondi. */
export function repartirDureesScenes(poids: number[], dureeEpisodeSecondes: number): number[] {
  const n = poids.length;
  if (n === 0) return [];
  const total = Math.max(Math.round(dureeEpisodeSecondes), n * DUREE_PLAN_MIN);
  const p = poids.map((x) => (Number.isFinite(x) && x > 0 ? x : 1));
  const somme = p.reduce((a, b) => a + b, 0);
  // Chaque scène garde d'abord le minimum, le reste se partage au prorata des poids.
  const reste = total - n * DUREE_PLAN_MIN;
  const parts = p.map((x) => (x / somme) * reste);
  const durees = parts.map((x) => DUREE_PLAN_MIN + Math.floor(x));
  let manque = total - durees.reduce((a, b) => a + b, 0);
  const ordre = parts.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; manque > 0; k = (k + 1) % n, manque--) durees[ordre[k]!.i]! += 1;
  return durees;
}

/** Écart toléré entre la somme des plans d'une scène et sa durée visée avant que le code les ajuste. En dessous, les durées du modèle
 * restent : elles portent le jeu (un dialogue garde sa marge). */
export const ECART_SCENE_TOLERE = 0.15;

/** Ajuste les durées des plans d'une scène à sa durée visée : proportionnellement, en entiers de 5 à 15 s, puis au plus près de la cible seconde par
 * seconde. Sans effet si l'écart est dans la tolérance. Si la cible est hors d'atteinte (trop peu ou trop de plans), on s'en approche autant que possible :
 * l'avertissement de durée de la revue dit le reste. */
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
  // Un cran à la fois, sur le plan qui a le plus de marge : la forme générale (qui est long, qui est court) se conserve.
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

/** Ce que le traitement rendu doit respecter ; chaque défaut est une erreur renvoyée au modèle (un seul renvoi, voir lib/llm/controles.ts). Pur. */
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
