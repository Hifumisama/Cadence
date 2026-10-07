import type { Fiche } from "./agents/fiche";
import { RYTHMES_BRIEF, type RythmeBrief } from "./agents/types";
import type { StyleBibliotheque } from "./styles/bibliotheque";

/** La conception d'un projet : ce que l'utilisateur choisit AVANT l'entretien avec le scénariste (format, genre, ton,
 * durée, rythme, langue, style). Tout est quasi déterministe : l'agent n'a plus à le demander. Pur : validation,
 * valeurs dérivées (texte du ton, nombre de plans, style résolu) et préremplissage de la fiche de l'entretien.
 * Stockée telle quelle dans `conceptions.contenu` ; le brief reçoit les valeurs dérivées (voir `ficheDepuisConception`). */

export const FORMATS = ["film", "serie"] as const;
export type FormatProjet = (typeof FORMATS)[number];

/** Les dix langues que le modèle vidéo (H3) sait parler, et « sans dialogue ». */
export const LANGUES_DIALOGUES = ["Français", "English", "日本語", "한국어", "中文", "Deutsch", "Русский", "Português", "Español", "Italiano"] as const;
export const SANS_DIALOGUE = "Sans dialogue";
export const LANGUE_PAR_DEFAUT = "Français";

export const DUREE_MIN_SECONDES = 30;
export const DUREE_MAX_SECONDES = 600;
export const DUREE_PAR_DEFAUT_SECONDES = 120;
export const RYTHME_PAR_DEFAUT: RythmeBrief = "mesure";
export const TON_PAR_DEFAUT = 50;
export const GENRES_MAX = 2;
export const EPISODES_MIN = 2;
export const EPISODES_MAX = 40;

/** Genres proposés, avec le ton de départ (0 = lumineux, 100 = sombre) que le curseur prend quand l'utilisateur ne l'a
 * pas ajusté. `teinte` et `poids` ne servent qu'à l'affichage. */
export const GENRES: readonly { nom: string; ton: number; /** Teinte HSL de la lumière d'ambiance (jamais de rouge plein). */ teinte: number; /** Taille relative de la bulle à l'écran. */ poids: number }[] = [
  { nom: "Action", ton: 55, teinte: 38, poids: 3.4 },
  { nom: "Aventure", ton: 40, teinte: 150, poids: 2.6 },
  { nom: "Épique", ton: 60, teinte: 40, poids: 3.8 },
  { nom: "Horreur", ton: 92, teinte: 270, poids: 2.8 },
  { nom: "Science-fiction", ton: 60, teinte: 200, poids: 3.2 },
  { nom: "Fantasy", ton: 45, teinte: 160, poids: 3.4 },
  { nom: "Drame", ton: 80, teinte: 215, poids: 2.4 },
  { nom: "Comédie", ton: 15, teinte: 48, poids: 2.2 },
  { nom: "Thriller", ton: 82, teinte: 230, poids: 3 },
  { nom: "Romance", ton: 35, teinte: 335, poids: 2.6 },
  { nom: "Policier", ton: 70, teinte: 205, poids: 2.6 },
  { nom: "Conte", ton: 25, teinte: 55, poids: 3 },
  { nom: "Documentaire", ton: 50, teinte: 190, poids: 2.2 },
  { nom: "Western", ton: 55, teinte: 32, poids: 2.6 },
  { nom: "Guerre", ton: 85, teinte: 100, poids: 2.4 },
  { nom: "Slice of life", ton: 28, teinte: 80, poids: 2.2 },
];

/** Durée d'un plan selon le rythme (secondes) : les mêmes plages que le skill `scenario-episode`. */
export const PLAGES_RYTHME: Record<RythmeBrief, { min: number; max: number }> = {
  lent: { min: 10, max: 15 },
  mesure: { min: 8, max: 12 },
  soutenu: { min: 8, max: 12 },
  rapide: { min: 5, max: 8 },
  variable: { min: 5, max: 15 },
};

/** Le style choisi : une entrée de la bibliothèque (par identifiant), ou un style libre avec ses deux prompts et, si
 * l'utilisateur l'a déposée, une image de présentation (nom de fichier, 2:3). */
export type StyleConception =
  | { source: "bibliotheque"; styleId: string }
  | { source: "libre"; nom: string; promptImage: string; clause: string; image?: string };

export type Conception = {
  format: FormatProjet;
  /** Série seulement : nombre d'épisodes prévus. Une INFORMATION pour l'agent : le projet ne crée pas N épisodes. */
  episodesPrevus?: number;
  genres: string[];
  /** 0 = lumineux, 100 = sombre. */
  ton: number;
  /** Vrai quand l'utilisateur a bougé le curseur (sinon le ton vient des genres). */
  tonAjuste: boolean;
  dureeSecondes: number;
  rythme: RythmeBrief;
  /** Vrai quand l'utilisateur a regardé la durée et le rythme (sinon ce sont les valeurs par défaut, signalées comme telles). */
  dureeChoisie: boolean;
  /** Une des `LANGUES_DIALOGUES`, ou `SANS_DIALOGUE`. */
  langue: string;
  langueChoisie: boolean;
  style: StyleConception;
};

/** Le style tel que le projet l'emploie : le nom et la clause courte (vidéo, brief), le prompt long (images). */
export type StyleResolu = { nom: string; clause: string; promptImage: string; image?: string };

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texte = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function tonDepuisGenres(genres: readonly string[]): number {
  const tons = genres.map((g) => GENRES.find((x) => x.nom === g)?.ton).filter((t): t is number => typeof t === "number");
  return tons.length ? Math.round(tons.reduce((a, b) => a + b, 0) / tons.length) : TON_PAR_DEFAUT;
}

export function motDuTon(ton: number): string {
  return ton <= 18 ? "lumineux" : ton <= 38 ? "léger" : ton <= 62 ? "nuancé" : ton <= 82 ? "grave" : "sombre";
}

/** « Drame + Thriller, ton grave (82/100) » : la valeur de `genreTon` dans le brief. */
export function genreTonTexte(c: Pick<Conception, "genres" | "ton">): string {
  return `${c.genres.join(" + ")}, ton ${motDuTon(c.ton)} (${c.ton}/100)`;
}

/** Nombre de plans pour une durée et un rythme : bornes (plans les plus longs → les plus courts) et valeur moyenne. */
export function plansEstimes(dureeSecondes: number, rythme: RythmeBrief): { min: number; max: number; moyen: number } {
  const { min, max } = PLAGES_RYTHME[rythme];
  return {
    min: Math.max(1, Math.round(dureeSecondes / max)),
    max: Math.max(1, Math.round(dureeSecondes / min)),
    moyen: Math.max(1, Math.round(dureeSecondes / ((min + max) / 2))),
  };
}

export type ResultatConception = { ok: true; valeur: Conception } | { ok: false; erreurs: string[] };

/** Valide une conception venue du client (ou de la base). Les valeurs hors liste sont refusées, jamais corrigées en silence ;
 * seuls les champs facultatifs absents reçoivent leur valeur par défaut. `bibliotheque` sert à vérifier l'identifiant d'un style. */
export function validerConception(brut: unknown, bibliotheque: readonly Pick<StyleBibliotheque, "id">[]): ResultatConception {
  const o = objet(brut);
  const erreurs: string[] = [];

  const format = o.format;
  if (!(FORMATS as readonly unknown[]).includes(format)) erreurs.push("Format : « film » ou « serie ».");

  let episodesPrevus: number | undefined;
  if (format === "serie" && o.episodesPrevus != null) {
    const n = o.episodesPrevus;
    if (typeof n !== "number" || !Number.isInteger(n) || n < EPISODES_MIN || n > EPISODES_MAX) erreurs.push(`Épisodes prévus : un entier entre ${EPISODES_MIN} et ${EPISODES_MAX}.`);
    else episodesPrevus = n;
  }

  const genres = Array.isArray(o.genres) ? o.genres : [];
  const nomsGenres = GENRES.map((g) => g.nom);
  if (genres.length < 1 || genres.length > GENRES_MAX || genres.some((g) => typeof g !== "string" || !nomsGenres.includes(g)) || new Set(genres).size !== genres.length) {
    erreurs.push(`Genres : de 1 à ${GENRES_MAX} genres de la liste, sans doublon.`);
  }

  const tonAjuste = o.tonAjuste === true;
  let ton = o.ton;
  if (ton == null) ton = tonDepuisGenres(genres as string[]);
  if (typeof ton !== "number" || !Number.isInteger(ton) || ton < 0 || ton > 100) erreurs.push("Ton : un entier de 0 à 100.");

  const dureeSecondes = o.dureeSecondes ?? DUREE_PAR_DEFAUT_SECONDES;
  if (typeof dureeSecondes !== "number" || !Number.isInteger(dureeSecondes) || dureeSecondes < DUREE_MIN_SECONDES || dureeSecondes > DUREE_MAX_SECONDES) {
    erreurs.push(`Durée : de ${DUREE_MIN_SECONDES} à ${DUREE_MAX_SECONDES} secondes.`);
  }
  const rythme = o.rythme ?? RYTHME_PAR_DEFAUT;
  if (!(RYTHMES_BRIEF as readonly unknown[]).includes(rythme)) erreurs.push(`Rythme : ${RYTHMES_BRIEF.join(", ")}.`);

  const langue = o.langue ?? LANGUE_PAR_DEFAUT;
  if (langue !== SANS_DIALOGUE && !(LANGUES_DIALOGUES as readonly unknown[]).includes(langue)) erreurs.push("Langue : une des dix langues proposées, ou « Sans dialogue ».");

  const s = objet(o.style);
  let style: StyleConception | null = null;
  if (s.source === "bibliotheque") {
    const styleId = texte(s.styleId);
    if (!styleId || !bibliotheque.some((b) => b.id === styleId)) erreurs.push("Style : ce style n'est pas dans la bibliothèque.");
    else style = { source: "bibliotheque", styleId };
  } else if (s.source === "libre") {
    const nom = texte(s.nom) || "Style libre";
    const promptImage = texte(s.promptImage);
    const clause = texte(s.clause);
    if (!promptImage) erreurs.push("Style libre : le prompt image est obligatoire.");
    if (!clause) erreurs.push("Style libre : la clause courte est obligatoire.");
    if (nom.length > 120) erreurs.push("Style libre : nom trop long (120 caractères).");
    const image = texte(s.image);
    if (promptImage && clause && nom.length <= 120) style = { source: "libre", nom, promptImage, clause, ...(image ? { image } : {}) };
  } else erreurs.push("Style : choisis un style de la bibliothèque ou un style libre.");

  if (erreurs.length || !style) return { ok: false, erreurs };
  return {
    ok: true,
    valeur: {
      format: format as FormatProjet,
      ...(episodesPrevus != null ? { episodesPrevus } : {}),
      genres: genres as string[],
      ton: ton as number,
      tonAjuste,
      dureeSecondes: dureeSecondes as number,
      rythme: rythme as RythmeBrief,
      dureeChoisie: o.dureeChoisie === true,
      langue: langue as string,
      langueChoisie: o.langueChoisie === true,
      style,
    },
  };
}

/** Le style que le projet emploiera. Un style de la bibliothèque sans clause courte n'est pas utilisable (la vidéo n'aurait
 * rien à recevoir) : erreur franche plutôt qu'une clause inventée. Le prompt long d'une entrée de la bibliothèque est son descripteur. */
export function resoudreStyle(c: Pick<Conception, "style">, bibliotheque: readonly StyleBibliotheque[]): { ok: true; style: StyleResolu } | { ok: false; erreur: string } {
  if (c.style.source === "libre") {
    const { nom, clause, promptImage, image } = c.style;
    return { ok: true, style: { nom, clause, promptImage, ...(image ? { image } : {}) } };
  }
  const id = c.style.styleId;
  const s = bibliotheque.find((b) => b.id === id);
  if (!s) return { ok: false, erreur: `Style « ${id} » introuvable dans la bibliothèque.` };
  if (!s.clause?.trim()) return { ok: false, erreur: `Le style « ${s.nom} » n'a pas encore de clause courte pour la vidéo.` };
  return { ok: true, style: { nom: s.nom, clause: s.clause.trim(), promptImage: s.descriptor } };
}

/** La fiche de l'entretien préremplie par la conception : tout est « fourni » (l'utilisateur l'a choisi, ou a validé la valeur par
 * défaut en passant l'écran). Résultat : `aTrancher` se réduit à l'arc, la fin et le héros, sans toucher à la logique de l'entretien.
 * La fiche ne contient QUE le nom et la clause du style : le prompt long et l'image restent hors de la vue du modèle. */
export function ficheDepuisConception(c: Conception, style: StyleResolu): Fiche {
  const contenu: Record<string, unknown> = {
    genreTon: genreTonTexte(c),
    style: { nom: style.nom, clause: style.clause },
    langueDialogues: c.langue,
    dureeEpisodeSecondes: c.dureeSecondes,
    rythme: c.rythme,
  };
  const statuts = Object.fromEntries(Object.keys(contenu).map((k) => [k, "fourni" as const]));
  return { contenu, statuts };
}

/** Ce que l'écran de clap montre en « par défaut » (le ton, la durée et le rythme, la langue non touchés). */
export function valeursParDefaut(c: Conception): { ton: boolean; duree: boolean; langue: boolean } {
  return { ton: !c.tonAjuste, duree: !c.dureeChoisie, langue: !c.langueChoisie };
}

/** Ce que l'agent de conversation sait en plus du brief : le format et le nombre d'épisodes prévus (pas des sections du brief). */
export function informationsFormat(c: Pick<Conception, "format" | "episodesPrevus">): string {
  if (c.format === "film") return "Format : un film (un seul bloc, une seule histoire).";
  return c.episodesPrevus ? `Format : une série, ${c.episodesPrevus} épisodes prévus.` : "Format : une série (nombre d'épisodes à définir).";
}

/** Le style que reçoivent les générations d'IMAGES d'un projet : le prompt long du style quand le projet en a un (il vient de la
 * conception), sinon la clause courte (projets créés avant la conception, ou dont le style a été retouché à la main). La vidéo,
 * elle, reçoit toujours la clause courte. */
export function styleDesImages(projet: { clauseStyle: string; stylePromptImage: string } | null | undefined): string {
  return projet?.stylePromptImage?.trim() || projet?.clauseStyle || "";
}

/** Noms d'auteurs, de studios ou d'œuvres qu'un style libre ne devrait pas contenir (liste volontairement courte, à étoffer) : un
 * avertissement, jamais un refus. */
export const REFERENCES_NOMMEES = ["pixar", "disney", "ghibli", "miyazaki", "marvel", "dreamworks", "wes anderson", "tim burton", "laika", "akira", "van gogh", "picasso", "tarantino", "kubrick"];

export function referencesNommees(texte: string): string[] {
  const t = texte.toLowerCase();
  return REFERENCES_NOMMEES.filter((r) => t.includes(r));
}
