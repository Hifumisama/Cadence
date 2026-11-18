/** The palette as DATA (2026-11-18, mock-up C4): a character's outfit piece by piece (each piece with its named colour and material) and a
 * colour chart (named colours with their hex value), and the same chart for a place's look. The text fields of the brief stay (old sheets, and
 * what the prompts read when the data is absent); when the data is there, the prompts' text is composed from it (`registry.ts`). The hex values
 * are for the screen (real swatches), never written into a prompt: image models read colour NAMES. Pure. */

export type CouleurNommee = { nom: string; hex: string };
export type PieceTenue = { piece: string; couleur?: string; matiere?: string };

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_COULEURS = 6;
const MAX_PIECES = 8;

const net = (v: unknown, max = 80): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A colour chart, checked: a name and a 6-digit hex each, no duplicates, at most six. Malformed entries are dropped. */
export function normaliserNuancier(v: unknown): CouleurNommee[] {
  if (!Array.isArray(v)) return [];
  const vus = new Set<string>();
  const res: CouleurNommee[] = [];
  for (const x of v) {
    const o = (x && typeof x === "object" ? x : {}) as { nom?: unknown; hex?: unknown };
    const nom = net(o.nom, 40);
    const hex = net(o.hex, 7).toLowerCase();
    if (!nom || !HEX.test(hex) || vus.has(nom.toLowerCase())) continue;
    vus.add(nom.toLowerCase());
    res.push({ nom, hex });
    if (res.length >= MAX_COULEURS) break;
  }
  return res;
}

/** The outfit's pieces, checked: a piece name each, colour and material optional, at most eight. */
export function normaliserPieces(v: unknown): PieceTenue[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x): PieceTenue | null => {
      const o = (x && typeof x === "object" ? x : {}) as { piece?: unknown; couleur?: unknown; matiere?: unknown };
      const piece = net(o.piece);
      if (!piece) return null;
      const couleur = net(o.couleur);
      const matiere = net(o.matiere);
      return { piece, ...(couleur ? { couleur } : {}), ...(matiere ? { matiere } : {}) };
    })
    .filter((p): p is PieceTenue => p !== null)
    .slice(0, MAX_PIECES);
}

/** The pieces as one French phrase for the prompts: « veste en laine bleu nuit, pantalon en toile ocre ». */
export function piecesEnTexte(pieces: readonly PieceTenue[]): string {
  return pieces.map((p) => [p.piece, p.matiere ? `en ${p.matiere}` : "", p.couleur ?? ""].filter(Boolean).join(" ")).join(", ");
}

/** The chart's colour names, for the prompts: « bleu nuit, ocre, blanc cassé ». */
export const nuancierEnTexte = (n: readonly CouleurNommee[]): string => n.map((c) => c.nom).join(", ");

/** A text field without hex values (« Beige #e5d9c9, Bleu gris #8a9ba8 » → « Beige, Bleu gris »): the prompts read colour names only. */
export const sansHex = (t: string): string => t.replace(/\s*\(?#[0-9a-f]{6}\)?/gi, "").replace(/\s+([,.;])/g, "$1").trim();
