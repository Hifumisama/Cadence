import { REQUIS, valeurVide, type Fiche, type StatutFiche } from "./fiche";

/** La fiche de notes de l'entretien, mise en forme pour l'écran (scène « Scénario ») : une ligne par sujet, avec ce que l'agent a retenu
 * en texte lisible. Les sujets de l'entretien (arc, fin, héros) viennent d'abord, puis les notes complémentaires déjà prises ; ce que la
 * conception a posé (genre et ton, style, rythme, durée, langue) n'en fait pas partie : l'utilisateur l'a choisi, il ne se discute pas ici.
 * Pur. */

export type NoteAffichee = {
  cle: string;
  libelle: string;
  /** Le texte retenu, ou "" si rien n'est encore noté. */
  texte: string;
  /** Qui l'a tranché ; `absent` : pas encore abordé. */
  statut: StatutFiche | "absent";
  /** Sujet que l'utilisateur doit avoir tranché pour que la fiche soit complète. */
  requis: boolean;
};

const LIBELLES: Record<string, string> = {
  arc: "L’idée et l’arc",
  fin: "La fin",
  personnages: "Le héros et les personnages",
  univers: "L’univers",
  lieux: "Les lieux",
  continuite: "Règles de continuité",
  rimes: "Rimes",
  progressions: "Progressions",
  pieges: "Pièges à éviter",
  episodes: "Épisodes",
  titre: "Titre",
};

/** Ce que la conception a déjà tranché : jamais affiché comme une note de l'entretien. */
const CHOISI_A_LA_CONCEPTION = new Set(["genreTon", "style", "rythme", "dureeEpisodeSecondes", "langueDialogues"]);
const SANS_AFFICHAGE = new Set(["inventions", "questionsOuvertes", "notes", "source"]);

const chaine = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const objet = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Le texte lisible d'une section du brief. */
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
        return `${chaine(o.nom) || "Sans nom"}${detail ? ` : ${detail}` : ""}`;
      }
      case "lieux":
        return `${chaine(o.nom)}${chaine(o.description) ? ` : ${chaine(o.description)}` : ""}`;
      case "rimes":
        return chaine(o.description);
      case "progressions":
        return `${chaine(o.quoi)}${chaine(o.evolution) ? ` : ${chaine(o.evolution)}` : ""}`;
      case "pieges":
        return chaine(o.cliche);
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
    // La fin n'est pas une section du brief : elle vit dans l'arc ; on ne montre que le fait qu'elle est dite.
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
