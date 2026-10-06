/** Grille de couverture de l'entretien d'entrée (skill `conversation-agent`). À chaque tour, l'agent déclare où il en est sur
 * chaque dimension : « dit » (l'utilisateur l'a dit ou confirmé), « deduit » (l'agent l'a supposé), « inconnu ». Le modèle
 * oublie parfois ses propres critères (il avait dit « prêt » sans jamais avoir demandé le ton) : c'est donc le CODE qui refuse
 * « briefing prêt » tant que l'essentiel n'est pas « dit », et qui renvoie à l'agent ce qui manque. Pur. */

export const ETATS_COUVERTURE = ["dit", "deduit", "inconnu"] as const;
export type EtatCouverture = (typeof ETATS_COUVERTURE)[number];

export const DIMENSIONS = [
  { cle: "coeur", libelle: "le cœur de l'histoire (qui, ce qu'il veut, ce qui change)", essentielle: true },
  { cle: "basculementFin", libelle: "le basculement et la fin", essentielle: true },
  { cle: "ton", libelle: "le ton et le genre", essentielle: true },
  { cle: "reglesMonde", libelle: "les règles du monde", essentielle: false },
  { cle: "personnagesLieux", libelle: "les autres personnages et les lieux", essentielle: false },
  { cle: "styleRythme", libelle: "le style visuel et le rythme", essentielle: true },
  { cle: "dureeForme", libelle: "la durée, le nombre d'épisodes et les dialogues", essentielle: true },
] as const;

export type CleDimension = (typeof DIMENSIONS)[number]["cle"];
export type Couverture = Record<CleDimension, EtatCouverture>;

/** Lit une grille venue du modèle ou de la base : null si elle n'a pas la forme attendue. */
export function lireCouverture(brut: unknown): Couverture | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  const c = {} as Couverture;
  for (const d of DIMENSIONS) {
    const v = o[d.cle];
    if (!(ETATS_COUVERTURE as readonly unknown[]).includes(v)) return null;
    c[d.cle] = v as EtatCouverture;
  }
  return c;
}

/** Dimensions essentielles que l'utilisateur n'a pas encore DITES (libellés). Sans grille : toutes. */
export function manquesEssentiels(couverture: Couverture | null): string[] {
  return DIMENSIONS.filter((d) => d.essentielle && couverture?.[d.cle] !== "dit").map((d) => d.libelle);
}

/** Le briefing peut être déclaré prêt : tout l'essentiel est dit par l'utilisateur. */
export const couvertureSuffisante = (couverture: Couverture | null): boolean => manquesEssentiels(couverture).length === 0;
