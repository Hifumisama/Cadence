import { REQUIS, titreManquant, valeurVide, type Fiche, type StatutFiche } from "./sheet";
import { buildSequence, type SequenceView } from "./sequence-display";

/** The interview's notes sheet, formatted for the screen (scene "Scénario"): one line per subject, with what the agent kept
 * as readable text, in a reading order (`ORDRE_NOTES`: title, story, ending, universe, characters, places, effects, moments, episodes).
 * What the design set (genre and tone, style, rhythm, duration, language) is not part of it: the user chose it, it is not discussed here;
 * it comes back in the film's synopsis (`synopsisPourAffichage`), which gathers the whole sheet for the « Synopsis du film » popup.
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
  moments: "Les moments du film",
  personnages: "Le héros et les personnages",
  univers: "L’univers",
  lieux: "Les lieux",
  elements: "Effets visuels et objets",
  episodes: "Épisodes",
  titre: "Titre",
};

/** Reading order of the sheet: what the film is (title, story, ending, universe), who is in it, where, then how it unfolds. A section
 * not listed here comes after, in the order of the sheet. */
export const ORDRE_NOTES = ["titre", "arc", "fin", "univers", "personnages", "lieux", "elements", "moments", "episodes"] as const;

/** What the design has already settled: never displayed as an interview note. */
const CHOISI_A_LA_CONCEPTION = new Set(["genreTon", "style", "rythme", "dureeEpisodeSecondes", "langueDialogues"]);
const SANS_AFFICHAGE = new Set(["inventions", "questionsOuvertes", "notes", "source"]);
const REQUIS_AFFICHES = new Set(["arc", "fin", "personnages", "moments"]);

const chaine = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const objet = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** `detail`: who or what it is, one sentence; `extra`: what gets drawn on top (outfit, look of a place), a second, quieter line. */
export type EntreeSynopsis = { nom: string; detail: string; extra?: string };

/** Fragments written by the notes model (« Une trentaine d'années. », « Homme de taille moyenne ») joined into one readable sentence. */
export function phrase(parties: string[]): string {
  const p = parties.map((x) => x.trim().replace(/[\s.;,]+$/, "")).filter(Boolean);
  if (!p.length) return "";
  const corps = p.map((x, i) => (i > 0 && /^\p{Lu}\p{Ll}/u.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x)).join(", ");
  return `${corps}.`;
}

function entree(cle: string, x: unknown): EntreeSynopsis {
  if (typeof x === "string") return { nom: x.trim(), detail: "" };
  const o = objet(x);
  switch (cle) {
    case "personnages": {
      const t = objet(o.tenue);
      const tenue = phrase([chaine(t.coupe) || chaine(t.couleurs), chaine(t.accessoires), chaine(t.signeDistinctif)]);
      return { nom: chaine(o.nom) || "Sans nom", detail: phrase([chaine(o.role), chaine(o.age), chaine(o.apparence)]), ...(tenue ? { extra: `Tenue : ${tenue.charAt(0).toLowerCase()}${tenue.slice(1)}` } : {}) };
    }
    case "lieux": {
      const a = objet(o.aspect);
      const aspect = phrase([chaine(a.lumiere), chaine(a.ambiance)]);
      return { nom: chaine(o.nom), detail: phrase([chaine(o.description)]), ...(aspect ? { extra: aspect } : {}) };
    }
    case "elements":
      return { nom: chaine(o.nom), detail: phrase([chaine(o.description), chaine(o.couleur), chaine(o.ampleur)]) };
    case "episodes":
      return { nom: chaine(o.titre), detail: chaine(o.resume) };
    default:
      return { nom: "", detail: "" };
  }
}

const entrees = (cle: string, valeur: unknown): EntreeSynopsis[] =>
  Array.isArray(valeur) ? valeur.map((x) => entree(cle, x)).filter((e) => e.nom || e.detail) : [];

/** The readable text of a brief section. */
export function resumerSection(cle: string, valeur: unknown): string {
  if (valeurVide(valeur)) return "";
  if (typeof valeur === "string") return valeur.trim();
  if (!Array.isArray(valeur)) return "";
  return entrees(cle, valeur)
    .map((e) => [e.nom, [e.detail, e.extra].filter(Boolean).join(" · ")].filter(Boolean).join(" : "))
    .join("\n");
}

const rang = (cle: string): number => {
  const i = (ORDRE_NOTES as readonly string[]).indexOf(cle);
  return i === -1 ? ORDRE_NOTES.length : i;
};

/** The ending is not a brief section: it lives in the arc; we only show the fact that it is said. */
const texteFin = (statut: StatutFiche | "absent"): string =>
  statut === "fourni" ? "Dite par toi, notée dans l’arc." : statut === "delegue" ? "Laissée au scénariste." : "";

export function notesPourAffichage(fiche: Fiche): NoteAffichee[] {
  const sujets = REQUIS.filter((r) => REQUIS_AFFICHES.has(r.cle)).map((r) => r.cle as string);
  const notes: NoteAffichee[] = sujets.map((cle) => {
    const statut = fiche.statuts[cle] ?? "absent";
    const texte = cle === "fin" ? texteFin(statut) : resumerSection(cle, fiche.contenu[cle]);
    return { cle, libelle: LIBELLES[cle] ?? cle, texte, statut, requis: true };
  });
  for (const [cle, valeur] of Object.entries(fiche.contenu)) {
    if (sujets.includes(cle) || CHOISI_A_LA_CONCEPTION.has(cle) || SANS_AFFICHAGE.has(cle)) continue;
    const texte = resumerSection(cle, valeur);
    if (texte) notes.push({ cle, libelle: LIBELLES[cle] ?? cle, texte, statut: fiche.statuts[cle] ?? "deduit", requis: false });
  }
  // Stable sort: the sections outside `ORDRE_NOTES` keep the order of the sheet.
  return notes.map((n, i) => ({ n, i })).sort((a, b) => rang(a.n.cle) - rang(b.n.cle) || a.i - b.i).map(({ n }) => n);
}

/** The whole sheet as a film synopsis (« Synopsis du film » popup): the design's choices included, every field "" or empty when not noted. */
export type SynopsisFilm = {
  /** "" while the title is provisional ("Sans titre"…). */
  titre: string;
  arc: string;
  /** The ending as a fact (said, or left to the screenwriter), "" otherwise. */
  fin: string;
  genreTon: string;
  dureeSecondes: number | null;
  style: string;
  langue: string;
  /** Pace (lent, mesuré…) and the film's score, "" when unknown. */
  rythme: string;
  musique: string;
  univers: string;
  personnages: EntreeSynopsis[];
  lieux: EntreeSynopsis[];
  elements: EntreeSynopsis[];
  episodes: EntreeSynopsis[];
  sequence: SequenceView;
};

export function synopsisPourAffichage(fiche: Fiche): SynopsisFilm {
  const c = fiche.contenu;
  const duree = c.dureeEpisodeSecondes;
  return {
    titre: titreManquant(fiche) ? "" : chaine(c.titre),
    arc: chaine(c.arc),
    fin: texteFin(fiche.statuts.fin ?? "absent"),
    genreTon: chaine(c.genreTon),
    dureeSecondes: typeof duree === "number" && Number.isFinite(duree) && duree > 0 ? duree : null,
    style: chaine(objet(c.style).nom) || chaine(c.style),
    langue: chaine(c.langueDialogues),
    rythme: chaine(c.rythme),
    musique: chaine(c.musique),
    univers: chaine(c.univers),
    personnages: entrees("personnages", c.personnages),
    lieux: entrees("lieux", c.lieux),
    elements: entrees("elements", c.elements),
    episodes: entrees("episodes", c.episodes),
    sequence: buildSequence(c, fiche.statuts.moments ?? "absent"),
  };
}
