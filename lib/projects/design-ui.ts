import {
  DUREE_MAX_SECONDES,
  genresReconnus,
  luminositeAmbiance,
  type Conception,
  DUREE_MIN_SECONDES,
  DUREE_PAR_DEFAUT_SECONDES,
  GENRES,
  INTENTIONS_MUSIQUE,
  INTENTION_MUSIQUE_PAR_DEFAUT,
  LANGUES_DIALOGUES,
  LIBELLES_INTENTION_MUSIQUE,
  REFERENCE_MUSIQUE_MAX,
  type IntentionMusique,
  LANGUE_PAR_DEFAUT,
  RYTHME_PAR_DEFAUT,
  SANS_DIALOGUE,
} from "./design";
import type { RythmeBrief } from "../agents/types";

/** The state of the design assistant (`/nouveau` page) on the browser side: starting values, moving from one step to the next, summary of
 * each step, session save, and payload sent to the server (which re-validates it: lib/projects/design.ts). Pure and without React,
 * so that the rules can be tested. */

export type StyleChoisi =
  | { source: "bibliotheque"; styleId: string }
  | { source: "libre"; nom: string; promptImage: string; clause: string; image?: string };

export type EtatAssistant = {
  duree: number;
  rythme: RythmeBrief;
  dureeChoisie: boolean;
  langue: string;
  langueChoisie: boolean;
  style: StyleChoisi | null;
  /** The music intention (preselected « discrète ») and its optional reference (« un peu comme… »). */
  musique: IntentionMusique;
  referenceMusique: string;
};

/** The form holds the FRAME only (2026-11-18): the genre and the story are decided in the interview. */
export const ETAPES_ASSISTANT = ["Accueil", "Durée", "Langue", "Style", "Musique"] as const;
/** Index of each step, so that screens never hard-code a number. */
export const ETAPE = { accueil: 0, duree: 1, langue: 2, style: 3, musique: 4 } as const;
export const DERNIERE_ETAPE = ETAPES_ASSISTANT.length - 1;
/** The whole film strip, visible from the start page: the five choices, then what follows the project's creation. */
export const ETAPES_CONCEPTION = [...ETAPES_ASSISTANT, "Scénario", "Clap", "Avancée"] as const;
export const CLE_SESSION = "cadence.conception.v1";

export function etatInitial(): EtatAssistant {
  return {
    duree: DUREE_PAR_DEFAUT_SECONDES,
    rythme: RYTHME_PAR_DEFAUT,
    dureeChoisie: false,
    langue: LANGUE_PAR_DEFAUT,
    langueChoisie: false,
    style: null,
    musique: INTENTION_MUSIQUE_PAR_DEFAUT,
    referenceMusique: "",
  };
}

/** A free style is complete with its two prompts (the name and the image are optional). */
export function styleComplet(style: StyleChoisi | null, styleUtilisable: (id: string) => boolean): boolean {
  if (!style) return false;
  if (style.source === "bibliotheque") return styleUtilisable(style.styleId);
  return style.promptImage.trim() !== "" && style.clause.trim() !== "";
}

/** We can leave step `i` for the next one. */
export function etapeValide(i: number, etat: EtatAssistant, styleUtilisable: (id: string) => boolean): boolean {
  if (i === ETAPE.style) return styleComplet(etat.style, styleUtilisable);
  return true;
}

/** The furthest reachable step: the first whose conditions are not met (otherwise the last). */
export function etapeMax(etat: EtatAssistant, styleUtilisable: (id: string) => boolean): number {
  for (let i = 0; i <= DERNIERE_ETAPE; i++) if (!etapeValide(i, etat, styleUtilisable)) return i;
  return DERNIERE_ETAPE;
}

export function minutesSecondes(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} min${r ? ` ${r < 10 ? "0" : ""}${r}` : ""}` : `${r} s`;
}

/** The summary under the step's name, in the ribbon (empty as long as nothing is chosen). `nomStyle`: name of the library style. */
export function resumeEtape(i: number, etat: EtatAssistant, nomStyle: (id: string) => string | null): string {
  switch (i) {
    case ETAPE.accueil:
      return "Film IA";
    case ETAPE.duree:
      return minutesSecondes(etat.duree);
    case ETAPE.langue:
      // The language is preselected on screen: the ribbon shows it too (otherwise « — » next to a visibly ticked choice).
      return etat.langue;
    case ETAPE.style:
      if (!etat.style) return "";
      return etat.style.source === "libre" ? etat.style.nom.trim() || "Style libre" : (nomStyle(etat.style.styleId) ?? "");
    case ETAPE.musique:
      return LIBELLES_INTENTION_MUSIQUE[etat.musique];
    default:
      return "";
  }
}

/** The tint of the ambient light: average of the genres' tints (gold by default). */
export function teinteAmbiance(genres: readonly string[]): number {
  const t = genres.map((g) => GENRES.find((x) => x.nom === g)?.teinte).filter((x): x is number => typeof x === "number");
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 42;
}

/** The ambient light of a created project's screens, from the film's genre (free text: `genreDuFilm`): gold while it is not decided. */
export function ambianceDuGenre(genre: string): { "--cn-hue": number; "--cn-lum": string } {
  const g = genresReconnus(genre);
  return { "--cn-hue": teinteAmbiance(g), "--cn-lum": luminositeAmbiance(g) };
}

/** The ribbon's summaries of a CREATED project, one per `ETAPES_ASSISTANT` step (the choices are made: shown, not replayed). A project designed
 * before the music step shows « — » there. */
export function resumesCadre(c: Conception, nomStyle: string): string[] {
  return ["Film", minutesSecondes(c.dureeSecondes), c.langue, nomStyle, c.musique ? LIBELLES_INTENTION_MUSIQUE[c.musique.intention] : "—"];
}

/** The payload sent to `creerProjetConcu` (the server re-validates it entirely). */
export function versCharge(etat: EtatAssistant): Record<string, unknown> {
  const reference = etat.referenceMusique.trim();
  return {
    genres: [],
    dureeSecondes: etat.duree,
    rythme: etat.rythme,
    dureeChoisie: etat.dureeChoisie,
    langue: etat.langue,
    langueChoisie: etat.langueChoisie,
    style: etat.style ?? undefined,
    musique: { intention: etat.musique, ...(reference && etat.musique !== "aucune" ? { reference } : {}) },
  };
}

const entier = (v: unknown, min: number, max: number, defaut: number): number => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : defaut);

/** Reads the state saved in session. An unexpected value falls back to its starting value (never an error: the session may come from
 * an older version of the page). */
export function lireEtatSauvegarde(brut: string | null): EtatAssistant | null {
  if (!brut) return null;
  let o: Record<string, unknown>;
  try {
    const v = JSON.parse(brut) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    o = v as Record<string, unknown>;
  } catch {
    return null;
  }
  const depart = etatInitial();
  const s = o.style as Record<string, unknown> | null | undefined;
  let style: StyleChoisi | null = null;
  if (s && s.source === "bibliotheque" && typeof s.styleId === "string") style = { source: "bibliotheque", styleId: s.styleId };
  else if (s && s.source === "libre") {
    style = {
      source: "libre",
      nom: typeof s.nom === "string" ? s.nom : "",
      promptImage: typeof s.promptImage === "string" ? s.promptImage : "",
      clause: typeof s.clause === "string" ? s.clause : "",
      ...(typeof s.image === "string" && s.image ? { image: s.image } : {}),
    };
  }
  const langue = typeof o.langue === "string" && (o.langue === SANS_DIALOGUE || (LANGUES_DIALOGUES as readonly string[]).includes(o.langue)) ? o.langue : depart.langue;
  return {
    duree: entier(o.duree, DUREE_MIN_SECONDES, DUREE_MAX_SECONDES, depart.duree),
    // The rhythm is no longer a choice: a saved session from before keeps the starting value.
    rythme: depart.rythme,
    dureeChoisie: o.dureeChoisie === true,
    langue,
    langueChoisie: o.langueChoisie === true,
    style,
    musique: (INTENTIONS_MUSIQUE as readonly unknown[]).includes(o.musique) ? (o.musique as IntentionMusique) : depart.musique,
    referenceMusique: typeof o.referenceMusique === "string" ? o.referenceMusique.slice(0, REFERENCE_MUSIQUE_MAX) : "",
  };
}
