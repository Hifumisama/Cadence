/** References of a clip on an ALREADY ASSEMBLED prompt (2026-10-03): removing or adding a reference keeps the
 * labels without gaps (`<Picture 1>`, `<Picture 2>`, `<Picture 3>`…) and the sections `subject_definitions` /
 * `retention_analysis` up to date. It is the CODE that numbers, never a model (as at assembly). Pure: the database reads and writes are in lib/clips/clip-references.ts.
 *
 * - images: `<Subject N>` and `<Picture N>` share the same N; a removal compacts all remaining slots
 *   into 1..n (and catches up old gaps);
 * - videos: their slot does not move. */

export type TypeRef = "picture" | "video";
export type SectionsTexte = Record<string, string>;
/** `vfx`: the asset is a visual effect, taken up as a `weak_reference` (never shown as is). */
export type RefTexte = { type: TypeRef; slot: number; nom: string; vfx?: boolean };

/** « CHAR_iris_phare » → « iris phare »: the readable name of an asset of which one only has the code. */
export function nomDepuisCode(code: string): string {
  const [, ...reste] = code.split("_");
  return (reste.length ? reste : [code]).join(" ").trim();
}

/** The slot of a new reference: the chosen one if it is free (videos only: images stay numbered 1..n without gaps),
 * otherwise the first free one. Removing a video leaves a gap (their number does not move, the prompt cites them): we fill it first. null = full. */
export function emplacementLibre(type: TypeRef, pris: number[], max: number, voulu?: number): number | null {
  const libres = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !pris.includes(n));
  if (type !== "picture" && voulu != null && libres.includes(voulu)) return voulu;
  return libres[0] ?? null;
}

/** Old slot → new slot of the remaining images, compacted into 1..n in order. */
export function compacterImages(slotsRestants: number[]): Map<number, number> {
  const tries = [...slotsRestants].sort((a, b) => a - b);
  return new Map(tries.map((s, i) => [s, i + 1]));
}

const NOM_LABEL: Record<TypeRef, string> = { picture: "Picture", video: "Video" };
const SECTIONS_DE_LISTE = ["subject_definitions", "retention_analysis"];

/** Removes a reference from the sections: its definition and retention lines disappear, its mentions in
 * prose become its name again, and the remaining images are renumbered from `renum` (old → new). */
export function retirerReference(sections: SectionsTexte, ref: RefTexte, renum: Map<number, number> = new Map()): SectionsTexte {
  const labelLigne = ref.type === "picture" ? "Subject" : NOM_LABEL[ref.type];
  const ligneDeLaRef = new RegExp(`^\\s*<\\s*${labelLigne}\\s*${ref.slot}\\s*>`, "i");
  const motif = /<\s*(Subject|Picture|Video)\s*(\d+)\s*>/gi;
  const sortie: SectionsTexte = {};
  for (const [nom, contenu] of Object.entries(sections)) {
    const lignes = SECTIONS_DE_LISTE.includes(nom) ? contenu.split("\n").filter((l) => !ligneDeLaRef.test(l)) : contenu.split("\n");
    sortie[nom] = lignes.join("\n").replace(motif, (tout, genre: string, n: string) => {
      const g = genre[0]!.toUpperCase() + genre.slice(1).toLowerCase();
      const num = Number(n);
      const estCelleRetiree = (ref.type === "picture" ? g === "Subject" || g === "Picture" : g === NOM_LABEL[ref.type]) && num === ref.slot;
      if (estCelleRetiree) return ref.nom;
      if ((g === "Subject" || g === "Picture") && renum.has(num)) return `<${g} ${renum.get(num)}>`;
      return tout;
    });
  }
  return sortie;
}

const finir = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const ajouterLigne = (contenu: string, ligne: string) => (contenu.trim() ? `${contenu.replace(/\s+$/, "")}\n${ligne}` : ligne);

const echapperRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The citations that `retirerReference` replaced with the asset's name come back: in the PROSE (not in the definition and retention lists), each exact
 * occurrence of the name (whole word, same case: that of `nomDepuisCode`, in lowercase, which a hand-written text rarely contains) becomes the label
 * `<Subject N>` (image) or `<Video N>`. A name of fewer than 3 letters is never replaced (too many false positives). Pure. */
export function retablirCitations(sections: SectionsTexte, ref: RefTexte): { sections: SectionsTexte; shots: string[] } {
  const nom = ref.nom.trim();
  if (nom.length < 3) return { sections, shots: [] };
  const label = ref.type === "picture" ? `<Subject ${ref.slot}>` : `<${NOM_LABEL[ref.type]} ${ref.slot}>`;
  const motif = new RegExp(`(?<![\\p{L}\\p{N}_])${echapperRegex(nom)}(?![\\p{L}\\p{N}_])`, "gu");
  const sortie: SectionsTexte = {};
  for (const [section, contenu] of Object.entries(sections)) sortie[section] = SECTIONS_DE_LISTE.includes(section) ? contenu : contenu.replace(motif, label);
  // The shots that cite it now (for the retention line, as at assembly: « appears in [Shot 1], [Shot 3] »).
  const description = sortie.detailed_description ?? "";
  const shots: string[] = [];
  const decoupe = description.split(/(\[Shot \d+\])/);
  for (let i = 1; i < decoupe.length; i += 2) {
    const corps = decoupe[i + 1] ?? "";
    const cite = ref.type === "picture" ? new RegExp(`<\\s*(Subject|Picture)\\s*${ref.slot}\\s*>`, "i").test(corps) : corps.includes(label);
    if (cite && !shots.includes(decoupe[i]!)) shots.push(decoupe[i]!);
  }
  return { sections: sortie, shots };
}

/** The role of a reference placed by hand (column `plan_refs.role`, read by the agents): « Décor, couloir bleu » (type then name),
 * like those the compilation writes. Pure. */
export function roleParDefaut(type: TypeRef, asset: { typeAsset: string | null; libelleType: string | null; libelle: string }): { role: string; retention: string | null } {
  return { role: `${asset.libelleType ?? "Référence"}, ${asset.libelle}`, retention: null };
}

/** Adds a reference to the sections: a definition line and a retention line (by default, as
 * assembly does: image « fully_preserved »). With `retablir` (manual addition, name taken from the code),
 * the citations of the name left by a removal come back into the prose (`retablirCitations`); otherwise nothing is
 * added to the prose: as long as no shot cites it, the consistency check flags it « non citée ». */
export function ajouterReference(sections: SectionsTexte, ref: RefTexte, options: { retablir?: boolean } = {}): SectionsTexte {
  const { sections: retablies, shots } = options.retablir ? retablirCitations(sections, ref) : { sections, shots: [] as string[] };
  const sortie = { ...retablies };
  const ou = shots.length ? `appears in ${shots.join(", ")}` : "not cited in a shot";
  if (ref.type === "picture") {
    sortie.subject_definitions = ajouterLigne(sections.subject_definitions ?? "", finir(`<Subject ${ref.slot}> is ${ref.nom} from <Picture ${ref.slot}>`));
    sortie.retention_analysis = ajouterLigne(
      sections.retention_analysis ?? "",
      ref.vfx
        ? `<Subject ${ref.slot}> (${ou}): weak_reference - ${finir(`only the colour, texture and motion of ${ref.nom} are kept; it never appears as a standalone image`)}`
        : `<Subject ${ref.slot}> (${ou}): fully_preserved - ${finir(`the appearance of ${ref.nom} is retained`)}`,
    );
  }
  return sortie;
}
