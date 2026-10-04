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
export type RefTexte = { type: TypeRef; slot: number; nom: string };

/** « CHAR_iris_phare » → « iris phare » : le nom lisible d'un asset dont on n'a que le code. */
export function nomDepuisCode(code: string): string {
  const [, ...reste] = code.split("_");
  return (reste.length ? reste : [code]).join(" ").trim();
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

/** Ajoute une référence aux sections : une ligne de définition et une ligne de rétention (par défaut, comme
 * l'assemblage : image « fully_preserved », son « reference »). Rien n'est ajouté à la prose : tant qu'aucun
 * shot ne la cite, le contrôle de cohérence la signale « non citée », à l'auteur de la placer. */
export function ajouterReference(sections: SectionsTexte, ref: RefTexte): SectionsTexte {
  const sortie = { ...sections };
  if (ref.type === "picture") {
    sortie.subject_definitions = ajouterLigne(sections.subject_definitions ?? "", finir(`<Subject ${ref.slot}> is ${ref.nom} from <Picture ${ref.slot}>`));
    sortie.retention_analysis = ajouterLigne(
      sections.retention_analysis ?? "",
      `<Subject ${ref.slot}> (not cited in a shot): fully_preserved - ${finir(`the appearance of ${ref.nom} is retained`)}`,
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
