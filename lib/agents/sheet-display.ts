import { REQUIS, valeurVide, type Fiche, type StatutFiche } from "./sheet";

/** The interview's notes sheet, formatted for the screen (scene "Scénario"): one line per subject, with what the agent kept
 * as readable text. The interview subjects (arc, end, hero) come first, then the additional notes already taken; what the
 * design set (genre and tone, style, rhythm, duration, language) is not part of it: the user chose it, it is not discussed here.
 * Pure. */

export type NoteAffichee = {
  cle: string;
  libelle: string;
  /** The kept text, or "" if nothing is noted yet. */
  texte: string;
  /** Who settled it; `absent`: not yet covered. */
  statut: StatutFiche | "absent";
  /** A subject the user must have settled for the sheet to be complete. */
  requis: boolean;
};

const LIBELLES: Record<string, string> = {
  arc: "L’idée et l’arc",
  fin: "La fin",
  personnages: "Le héros et les personnages",
  univers: "L’univers",
  lieux: "Les lieux",
  elements: "Effets visuels et objets",
  episodes: "Épisodes",
  titre: "Titre",
};

/** What the design has already settled: never displayed as an interview note. */
const CHOISI_A_LA_CONCEPTION = new Set(["genreTon", "style", "rythme", "dureeEpisodeSecondes", "langueDialogues"]);
const SANS_AFFICHAGE = new Set(["inventions", "questionsOuvertes", "notes", "source"]);

const chaine = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const objet = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The readable text of a brief section. */
export function resumerSection(cle: string, valeur: unknown): string {
  if (valeurVide(valeur)) return "";
  if (typeof valeur === "string") return valeur.trim();
  if (!Array.isArray(valeur)) return "";
  const lignes = valeur.map((x) => {
    if (typeof x === "string") return x.trim();
    const o = objet(x);
    switch (cle) {
      case "personnages": {
        const detail = [chaine(o.role), chaine(o.age), chaine(o.apparence)].filter(Boolean).join(", ");
        const t = objet(o.tenue);
        const tenue = [chaine(t.coupe), chaine(t.couleurs), chaine(t.matieres)].filter(Boolean).join(", ");
        return `${chaine(o.nom) || "Sans nom"}${detail ? ` : ${detail}` : ""}${tenue ? ` · tenue : ${tenue}` : ""}`;
      }
      case "lieux": {
        const a = objet(o.aspect);
        const aspect = [chaine(a.lumiere), chaine(a.matieres), chaine(a.palette)].filter(Boolean).join(", ");
        return `${chaine(o.nom)}${chaine(o.description) ? ` : ${chaine(o.description)}` : ""}${aspect ? ` · ${aspect}` : ""}`;
      }
      case "elements": {
        const detail = [chaine(o.description), chaine(o.couleur), chaine(o.ampleur)].filter(Boolean).join(", ");
        return `${chaine(o.nom)}${detail ? ` : ${detail}` : ""}`;
      }
      case "episodes":
        return `${chaine(o.titre)}${chaine(o.resume) ? ` : ${chaine(o.resume)}` : ""}`;
      default:
        return "";
    }
  });
  return lignes.filter(Boolean).join("\n");
}

export function notesPourAffichage(fiche: Fiche): NoteAffichee[] {
  const requis = new Set(["arc", "fin", "personnages"]);
  const sujets = REQUIS.filter((r) => requis.has(r.cle)).map((r) => r.cle as string);
  const notes: NoteAffichee[] = sujets.map((cle) => {
    const statut = fiche.statuts[cle] ?? "absent";
    // The ending is not a brief section: it lives in the arc; we only show the fact that it is said.
    const texte = cle === "fin" ? (statut === "fourni" ? "Dite par toi, notée dans l’arc." : statut === "delegue" ? "Laissée au scénariste." : "") : resumerSection(cle, fiche.contenu[cle]);
    return { cle, libelle: LIBELLES[cle] ?? cle, texte, statut, requis: true };
  });
  for (const [cle, valeur] of Object.entries(fiche.contenu)) {
    if (sujets.includes(cle) || CHOISI_A_LA_CONCEPTION.has(cle) || SANS_AFFICHAGE.has(cle)) continue;
    const texte = resumerSection(cle, valeur);
    if (texte) notes.push({ cle, libelle: LIBELLES[cle] ?? cle, texte, statut: fiche.statuts[cle] ?? "deduit", requis: false });
  }
  return notes;
}
