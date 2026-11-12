import type { Fiche } from "../agents/sheet";
import { RYTHMES_BRIEF, type RythmeBrief } from "../agents/types";
import type { StyleBibliotheque } from "../styles/library";

/** A project's design: what the user chooses BEFORE the interview with the screenwriter (genre, tone,
 * duration, rhythm, language, style). Everything is almost deterministic: the agent no longer has to ask for it. Pure: validation,
 * derived values (tone text, number of clips, resolved style) and pre-filling of the interview sheet.
 * Stored as is in `conceptions.contenu`; the brief receives the derived values (see `ficheDepuisConception`). */

/** The ten languages the video model (H3) can speak, and « sans dialogue ». */
export const LANGUES_DIALOGUES = ["Français", "English", "日本語", "한국어", "中文", "Deutsch", "Русский", "Português", "Español", "Italiano"] as const;
export const SANS_DIALOGUE = "Sans dialogue";
export const LANGUE_PAR_DEFAUT = "Français";

export const DUREE_MIN_SECONDES = 30;
export const DUREE_MAX_SECONDES = 5400; // 90 min: a feature film. Beyond 10 min it is experimental (the screenplay of an episode struggles with hundreds of clips).
/** Beyond this duration, the screen warns that it is experimental. */
export const DUREE_EXPERIMENTALE_SECONDES = 600;

/** The duration slider is scaled to the time lived, not to real time: each segment of the track (0 to 1000) covers a range of
 * durations, increasingly wide (30 s → 3 min → 10 min → 30 min → 90 min). Without this, the precision useful for short films would be lost. */
export const REPERES_DUREE = [
  { position: 0, secondes: DUREE_MIN_SECONDES },
  { position: 250, secondes: 180 },
  { position: 500, secondes: 600 },
  { position: 750, secondes: 1800 },
  { position: 1000, secondes: 5400 },
] as const;
export const POSITION_DUREE_MAX = 1000;

/** The duration step according to its size: 15 s up to 10 min, 1 min up to 30 min, 5 min beyond. */
export function pasDuree(secondes: number): number {
  return secondes <= 600 ? 15 : secondes <= 1800 ? 60 : 300;
}

function arrondirDuree(secondes: number): number {
  const pas = pasDuree(secondes);
  return Math.min(DUREE_MAX_SECONDES, Math.max(DUREE_MIN_SECONDES, Math.round(secondes / pas) * pas));
}

/** Slider position (0 to 1000) → duration in seconds, rounded to the step of its range. */
export function dureeDepuisPosition(position: number): number {
  const p = Math.min(POSITION_DUREE_MAX, Math.max(0, position));
  for (let i = 1; i < REPERES_DUREE.length; i++) {
    const a = REPERES_DUREE[i - 1]!;
    const b = REPERES_DUREE[i]!;
    if (p <= b.position) return arrondirDuree(a.secondes + ((p - a.position) / (b.position - a.position)) * (b.secondes - a.secondes));
  }
  return DUREE_MAX_SECONDES;
}

/** Duration in seconds → slider position (reciprocal of `dureeDepuisPosition`). */
export function positionDepuisDuree(secondes: number): number {
  const d = Math.min(DUREE_MAX_SECONDES, Math.max(DUREE_MIN_SECONDES, secondes));
  for (let i = 1; i < REPERES_DUREE.length; i++) {
    const a = REPERES_DUREE[i - 1]!;
    const b = REPERES_DUREE[i]!;
    if (d <= b.secondes) return a.position + ((d - a.secondes) / (b.secondes - a.secondes)) * (b.position - a.position);
  }
  return POSITION_DUREE_MAX;
}
export const DUREE_PAR_DEFAUT_SECONDES = 120;
export const RYTHME_PAR_DEFAUT: RythmeBrief = "mesure";
export const TON_PAR_DEFAUT = 50;
export const GENRES_MAX = 2;

/** Proposed genres, with the starting tone (0 = light, 100 = dark) that the slider takes when the user has not
 * adjusted it. `teinte` and `poids` are only used for display. */
export const GENRES: readonly { nom: string; ton: number; /** HSL tint of the ambient light (never full red). */ teinte: number; /** Relative size of the bubble on screen. */ poids: number }[] = [
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

/** Duration of a clip according to the rhythm (seconds): the same ranges as the `scenario-episode` and `scenario-scene` skills (hard cap of 10 s). */
export const PLAGES_RYTHME: Record<RythmeBrief, { min: number; max: number }> = {
  lent: { min: 8, max: 10 },
  mesure: { min: 6, max: 9 },
  soutenu: { min: 6, max: 9 },
  rapide: { min: 5, max: 7 },
  variable: { min: 5, max: 10 },
};

/** The chosen style: a library entry (by identifier), or a free style with its two prompts and, if
 * the user uploaded one, a presentation image (file name, 2:3). */
type StyleConception =
  | { source: "bibliotheque"; styleId: string }
  | { source: "libre"; nom: string; promptImage: string; clause: string; image?: string };

export type Conception = {
  genres: string[];
  /** 0 = light, 100 = dark. */
  ton: number;
  /** True when the user has moved the slider (otherwise the tone comes from the genres). */
  tonAjuste: boolean;
  dureeSecondes: number;
  rythme: RythmeBrief;
  /** True when the user has looked at the duration and rhythm (otherwise these are the default values, flagged as such). */
  dureeChoisie: boolean;
  /** One of the `LANGUES_DIALOGUES`, or `SANS_DIALOGUE`. */
  langue: string;
  langueChoisie: boolean;
  style: StyleConception;
};

/** The style as the project uses it: the name and the short clause (video, brief), the long prompt (images). */
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

/** « Drame + Thriller, ton grave (82/100) »: the value of `genreTon` in the brief. */
export function genreTonTexte(c: Pick<Conception, "genres" | "ton">): string {
  return `${c.genres.join(" + ")}, ton ${motDuTon(c.ton)} (${c.ton}/100)`;
}

/** Number of clips for a duration and a rhythm: bounds (longest clips → shortest) and average value. */
export function plansEstimes(dureeSecondes: number, rythme: RythmeBrief): { min: number; max: number; moyen: number } {
  const { min, max } = PLAGES_RYTHME[rythme];
  return {
    min: Math.max(1, Math.round(dureeSecondes / max)),
    max: Math.max(1, Math.round(dureeSecondes / min)),
    moyen: Math.max(1, Math.round(dureeSecondes / ((min + max) / 2))),
  };
}

export type ResultatConception = { ok: true; valeur: Conception } | { ok: false; erreurs: string[] };

/** Validates a design coming from the client (or from the database). Values outside the list are refused, never silently corrected;
 * only absent optional fields receive their default value. `bibliotheque` serves to check a style's identifier. */
export function validerConception(brut: unknown, bibliotheque: readonly Pick<StyleBibliotheque, "id">[]): ResultatConception {
  const o = objet(brut);
  const erreurs: string[] = [];

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

/** The style the project will use. A library style without a short clause is not usable (the video would have nothing to receive):
 * a clear error rather than an invented clause. The long prompt of a library entry is its descriptor. */
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

/** The interview sheet pre-filled by the design: everything is « fourni » (the user chose it, or validated the default value by
 * going through the screen). Result: `aTrancher` is reduced to the arc, the ending and the hero, without touching the interview logic.
 * The sheet contains ONLY the style's name and clause: the long prompt and the image stay out of the model's view. */
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

/** What the clap screen shows as « par défaut » (the tone, the duration and the rhythm, the language left untouched). */
export function valeursParDefaut(c: Conception): { ton: boolean; duree: boolean; langue: boolean } {
  return { ton: !c.tonAjuste, duree: !c.dureeChoisie, langue: !c.langueChoisie };
}

/** What the conversation agent knows in addition to the brief: a project is a film (not a section of the brief). */
export function informationsFormat(): string {
  return "Format : un film (un seul bloc, une seule histoire).";
}

/** The style that IMAGE generations of a project receive: the long prompt of the style when the project has one (it comes from the
 * design), otherwise the short clause (projects created before the design, or whose style was retouched by hand). The video,
 * for its part, always receives the short clause. */
export function styleDesImages(projet: { clauseStyle: string; stylePromptImage: string } | null | undefined): string {
  return projet?.stylePromptImage?.trim() || projet?.clauseStyle || "";
}

/** The style reminded to IMAGE EDITS (Qwen): the SHORT clause, never the long prompt. The worker adds it as the last line of the
 * instructions (worker/comfyui/imageMapping.ts): one more instruction line, not a description that would drown out the
 * requested changes. Without it, a retouch (or an image attached from another style) came out of the project's style. */
export function styleDesEditions(projet: { clauseStyle: string } | null | undefined): string {
  return projet?.clauseStyle?.trim() || "";
}

/** Names of authors, studios or works that a free style should not contain (deliberately short list, to be extended): a
 * warning, never a refusal. */
export const REFERENCES_NOMMEES = ["pixar", "disney", "ghibli", "miyazaki", "marvel", "dreamworks", "wes anderson", "tim burton", "laika", "akira", "van gogh", "picasso", "tarantino", "kubrick"];

export function referencesNommees(texte: string): string[] {
  const t = texte.toLowerCase();
  return REFERENCES_NOMMEES.filter((r) => t.includes(r));
}
