/** Références d'un plan sur un prompt DÉJÀ ASSEMBLÉ (2026-10-03) : retirer ou ajouter une référence garde les
 * labels sans trou (`<Picture 1>`, `<Picture 2>`, `<Picture 3>`…) et les sections `subject_definitions` /
 * `retention_analysis` à jour. C'est le CODE qui numérote, jamais un modèle (comme à l'assemblage, voir
 * lib/agents/plan-h3-assemblage.ts). Pur : les lectures et écritures en base sont dans lib/plan-references.ts.
 *
 * - images : `<Subject N>` et `<Picture N>` partagent le même N ; un retrait compacte tous les slots restants
 *   en 1..n (et rattrape d'anciens trous) ;
 * - sons et vidéos : leur slot ne bouge pas (les emplacements `<Audio N>` sont liés aux voix du plan). */

export type TypeRef = "picture" | "audio" | "video";
export type SectionsTexte = Record<string, string>;
/** `vfx` : l'asset est un effet visuel, repris en `weak_reference` (jamais montré tel quel). */
export type RefTexte = { type: TypeRef; slot: number; nom: string; vfx?: boolean };

/** « CHAR_iris_phare » → « iris phare » : le nom lisible d'un asset dont on n'a que le code. */
export function nomDepuisCode(code: string): string {
  const [, ...reste] = code.split("_");
  return (reste.length ? reste : [code]).join(" ").trim();
}

/** L'emplacement d'une nouvelle référence : celui qu'on a choisi s'il est libre (vidéos et audios seulement : les images restent numérotées 1..n sans trou),
 * sinon le premier libre. Retirer une vidéo ou un audio laisse un trou (leur numéro ne bouge pas, le prompt les cite) : on le rebouche d'abord. null = plein. */
export function emplacementLibre(type: TypeRef, pris: number[], max: number, voulu?: number): number | null {
  const libres = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !pris.includes(n));
  if (type !== "picture" && voulu != null && libres.includes(voulu)) return voulu;
  return libres[0] ?? null;
}

/** Ancien slot → nouveau slot des images qui restent, compactés en 1..n dans l'ordre. */
export function compacterImages(slotsRestants: number[]): Map<number, number> {
  const tries = [...slotsRestants].sort((a, b) => a - b);
  return new Map(tries.map((s, i) => [s, i + 1]));
}

const NOM_LABEL: Record<TypeRef, string> = { picture: "Picture", audio: "Audio", video: "Video" };
const SECTIONS_DE_LISTE = ["subject_definitions", "retention_analysis"];

/** Retire une référence des sections : ses lignes de définition et de rétention disparaissent, ses mentions en
 * prose redeviennent son nom, et les images restantes sont renumérotées d'après `renum` (ancien → nouveau). */
export function retirerReference(sections: SectionsTexte, ref: RefTexte, renum: Map<number, number> = new Map()): SectionsTexte {
  const labelLigne = ref.type === "picture" ? "Subject" : NOM_LABEL[ref.type];
  const ligneDeLaRef = new RegExp(`^\\s*<\\s*${labelLigne}\\s*${ref.slot}\\s*>`, "i");
  const motif = /<\s*(Subject|Picture|Audio|Video)\s*(\d+)\s*>/gi;
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

/** Les citations que `retirerReference` a remplacées par le nom de l'asset reviennent : dans la PROSE (pas dans les listes de définition et de rétention), chaque
 * occurrence exacte du nom (mot entier, même casse : celui de `nomDepuisCode`, en minuscules, qu'un texte écrit à la main contient rarement) redevient le label
 * `<Subject N>` (image), `<Audio N>` ou `<Video N>`. Un nom de moins de 3 lettres n'est jamais remplacé (trop de faux positifs). Pur. */
export function retablirCitations(sections: SectionsTexte, ref: RefTexte): { sections: SectionsTexte; shots: string[] } {
  const nom = ref.nom.trim();
  if (nom.length < 3) return { sections, shots: [] };
  const label = ref.type === "picture" ? `<Subject ${ref.slot}>` : `<${NOM_LABEL[ref.type]} ${ref.slot}>`;
  const motif = new RegExp(`(?<![\\p{L}\\p{N}_])${echapperRegex(nom)}(?![\\p{L}\\p{N}_])`, "gu");
  const sortie: SectionsTexte = {};
  for (const [section, contenu] of Object.entries(sections)) sortie[section] = SECTIONS_DE_LISTE.includes(section) ? contenu : contenu.replace(motif, label);
  // Les shots qui le citent maintenant (pour la ligne de rétention, comme à l'assemblage : « appears in [Shot 1], [Shot 3] »).
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

/** Le rôle d'une référence posée à la main (colonne `plan_refs.role`, lue par les agents) : la voix d'un personnage, sinon « Décor, couloir bleu » (type puis nom),
 * comme ceux qu'écrit plan-h3. `retention` (audio seulement) : « reference », celui de la ligne de rétention ajoutée au prompt. Pur. */
export function roleParDefaut(type: TypeRef, asset: { typeAsset: string | null; libelleType: string | null; libelle: string }): { role: string; retention: string | null } {
  if (type === "audio") return { role: asset.typeAsset === "personnage" ? "Voix du personnage" : `${asset.libelleType ?? "Son"}, ${asset.libelle}`, retention: "reference" };
  return { role: `${asset.libelleType ?? "Référence"}, ${asset.libelle}`, retention: null };
}

/** Ajoute une référence aux sections : une ligne de définition et une ligne de rétention (par défaut, comme
 * l'assemblage : image « fully_preserved », son « reference »). Avec `retablir` (ajout à la main, nom tiré du code),
 * les citations du nom laissées par un retrait reviennent dans la prose (`retablirCitations`) ; sinon rien n'est
 * ajouté à la prose : tant qu'aucun shot ne la cite, le contrôle de cohérence la signale « non citée ». */
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
  } else if (ref.type === "audio") {
    sortie.subject_definitions = ajouterLigne(sections.subject_definitions ?? "", finir(`<Audio ${ref.slot}> is ${ref.nom}`));
    sortie.retention_analysis = ajouterLigne(
      sections.retention_analysis ?? "",
      `<Audio ${ref.slot}>: reference - ${finir(`the character of ${ref.nom} is referenced without copying the signal`)}`,
    );
  }
  return sortie;
}
