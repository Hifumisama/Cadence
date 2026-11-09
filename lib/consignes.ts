import type { ContexteIteration } from "./demandes";

/** La FILE DE CONSIGNES (docs/PLAN_FILE_CONSIGNES.md) : règles pures. Les lectures et écritures sont dans lib/consignes-db.ts.
 * Plusieurs consignes d'un même plan ne font QU'UN passage de l'agent et UN rendu : elles sont fusionnées en une seule consigne. */

export const MAX_CONSIGNE = 4000;

export type Reglages = ContexteIteration["reglages"];
export type ConsigneEnAttente = { id: number; texte: string; reglages: Reglages; rang: number };

/** Une seule consigne : telle quelle. Plusieurs : une liste numérotée, dans l'ordre où elles ont été données, que l'agent lit comme un
 * tout à appliquer ensemble (la dernière l'emporte si deux se contredisent). */
export function fusionnerConsignes(textes: string[]): string {
  const propres = textes.map((t) => t.trim()).filter(Boolean);
  if (propres.length <= 1) return propres[0] ?? "";
  return [
    "Plusieurs consignes à appliquer ensemble, dans cet ordre (si deux se contredisent, la dernière l'emporte) :",
    ...propres.map((t, i) => `${i + 1}. ${t}`),
  ].join("\n");
}

/** Les réglages de plusieurs consignes : pour chaque réglage, la dernière valeur demandée gagne. */
export function fusionnerReglages(liste: Reglages[]): Reglages {
  const r: Reglages = {};
  for (const g of liste) {
    if (g.dureeGenerationSecondes != null) r.dureeGenerationSecondes = g.dureeGenerationSecondes;
    if (g.fps != null) r.fps = g.fps;
    if (g.seed != null && g.seed !== "") r.seed = g.seed;
  }
  return r;
}

/** Valide le texte d'une consigne ; renvoie le texte nettoyé ou l'erreur à montrer. */
export function verifierConsigne(texte: string): { ok: true; texte: string } | { ok: false; erreur: string } {
  const t = (texte ?? "").trim();
  if (!t) return { ok: false, erreur: "Écris d'abord ce que tu veux changer." };
  if (t.length > MAX_CONSIGNE) return { ok: false, erreur: `Cette consigne est trop longue (${MAX_CONSIGNE} caractères au plus).` };
  return { ok: true, texte: t };
}

/** La fusion de toutes les consignes d'un plan tient-elle dans ce que l'agent accepte ? */
export const fusionTropLongue = (textes: string[]): boolean => fusionnerConsignes(textes).length > MAX_CONSIGNE;

/** Échange le rang d'une consigne avec sa voisine (sens −1 = monter, +1 = descendre). Renvoie la liste réordonnée, ou null si le déplacement est impossible. */
export function deplacer<T extends { id: number }>(liste: T[], id: number, sens: -1 | 1): T[] | null {
  const i = liste.findIndex((c) => c.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return null;
  const copie = [...liste];
  [copie[i], copie[j]] = [copie[j]!, copie[i]!];
  return copie;
}
