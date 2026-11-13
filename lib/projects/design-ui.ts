import {
  DUREE_MAX_SECONDES,
  DUREE_MIN_SECONDES,
  DUREE_PAR_DEFAUT_SECONDES,
  GENRES,
  GENRES_MAX,
  LANGUES_DIALOGUES,
  LANGUE_PAR_DEFAUT,
  RYTHME_PAR_DEFAUT,
  SANS_DIALOGUE,
} from "./design";
import type { RythmeBrief } from "../agents/types";
import type { ProfilPersoId } from "../h3ir/character-profiles";
import { miseEnSceneRecommandee } from "../styles/recommended-staging";
import { CREATIVITE_PAR_DEFAUT, STYLE_AUCUN, creativiteOuNull, resumeMiseEnScene, styleCameraOuNull, type Creativite } from "../h3ir/settings";

/** The state of the design assistant (`/nouveau` page) on the browser side: starting values, moving from one step to the next, summary of
 * each step, session save, and payload sent to the server (which re-validates it: lib/projects/design.ts). Pure and without React,
 * so that the rules can be tested. */

export type StyleChoisi =
  | { source: "bibliotheque"; styleId: string }
  | { source: "libre"; nom: string; promptImage: string; clause: string; image?: string };

export type EtatAssistant = {
  genres: string[];
  duree: number;
  rythme: RythmeBrief;
  dureeChoisie: boolean;
  langue: string;
  langueChoisie: boolean;
  style: StyleChoisi | null;
  /** Staging (Open H3 IR, lib/h3ir/settings.ts): the creativity, and the staging style (one of the 7 profiles, or « aucun »). Starting values ticked on screen. */
  creativite: Creativite;
  styleCamera: string;
  /** True as soon as the user has chosen the staging style himself. As long as it is false, `styleCamera` FOLLOWS the recommendation of the project's style (`suivreRecommandation`);
   * when true, a style change never overwrites it. Saved in session, not sent to the server. */
  miseEnSceneChoisie: boolean;
};

export const ETAPES_ASSISTANT = ["Accueil", "Genre", "Durée", "Langue", "Style", "Mise en scène"] as const;
export const DERNIERE_ETAPE = ETAPES_ASSISTANT.length - 1;
/** The whole film strip, visible from the start page: the six choices, then what follows the project's creation. */
export const ETAPES_CONCEPTION = [...ETAPES_ASSISTANT, "Scénario", "Clap", "Avancée"] as const;
export const CLE_SESSION = "cadence.conception.v1";

export function etatInitial(): EtatAssistant {
  return {
    genres: [],
    duree: DUREE_PAR_DEFAUT_SECONDES,
    rythme: RYTHME_PAR_DEFAUT,
    dureeChoisie: false,
    langue: LANGUE_PAR_DEFAUT,
    langueChoisie: false,
    style: null,
    creativite: CREATIVITE_PAR_DEFAUT,
    styleCamera: STYLE_AUCUN,
    miseEnSceneChoisie: false,
  };
}

/** The staging profile recommended by the chosen style (library), or null (free style, or no recommendation). */
export function miseEnSceneDuStyle(style: StyleChoisi | null): ProfilPersoId | null {
  return style?.source === "bibliotheque" ? miseEnSceneRecommandee(style.styleId) : null;
}

/** As long as the user has not chosen the staging by hand, it follows the style's recommendation (otherwise « aucun style »); once chosen, it is never touched.
 * To apply after each state change (`ConceptionAssistant`) and when the session is read back. */
export function suivreRecommandation(etat: EtatAssistant): EtatAssistant {
  if (etat.miseEnSceneChoisie) return etat;
  const voulu = miseEnSceneDuStyle(etat.style) ?? STYLE_AUCUN;
  return voulu === etat.styleCamera ? etat : { ...etat, styleCamera: voulu };
}

/** A MANUAL staging choice (card clicked, « aucun » included): it is kept and no longer follows the recommendation. */
export const choisirMiseEnScene = (etat: EtatAssistant, styleCamera: string): EtatAssistant => ({ ...etat, styleCamera, miseEnSceneChoisie: true });

/** Ticks or unticks a genre; beyond `GENRES_MAX`, the oldest is replaced. */
export function basculerGenre(etat: EtatAssistant, nom: string): EtatAssistant {
  const present = etat.genres.includes(nom);
  const genres = present ? etat.genres.filter((g) => g !== nom) : [...etat.genres, nom].slice(-GENRES_MAX);
  return { ...etat, genres };
}

/** A free style is complete with its two prompts (the name and the image are optional). */
export function styleComplet(style: StyleChoisi | null, styleUtilisable: (id: string) => boolean): boolean {
  if (!style) return false;
  if (style.source === "bibliotheque") return styleUtilisable(style.styleId);
  return style.promptImage.trim() !== "" && style.clause.trim() !== "";
}

/** We can leave step `i` for the next one. */
export function etapeValide(i: number, etat: EtatAssistant, styleUtilisable: (id: string) => boolean): boolean {
  if (i === 1) return etat.genres.length >= 1;
  if (i === 4) return styleComplet(etat.style, styleUtilisable);
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
    case 0:
      return "Film IA";
    case 1:
      return etat.genres.join("/");
    case 2:
      return minutesSecondes(etat.duree);
    case 3:
      // The language is preselected on screen: the ribbon shows it too (otherwise « — » next to a visibly ticked choice).
      return etat.langue;
    case 4:
      if (!etat.style) return "";
      return etat.style.source === "libre" ? etat.style.nom.trim() || "Style libre" : (nomStyle(etat.style.styleId) ?? "");
    case 5:
      // The starting values are ticked on screen: the ribbon shows them too.
      return resumeMiseEnScene(etat.creativite, etat.styleCamera);
    default:
      return "";
  }
}

/** The tint of the ambient light: average of the genres' tints (gold by default). */
export function teinteAmbiance(genres: readonly string[]): number {
  const t = genres.map((g) => GENRES.find((x) => x.nom === g)?.teinte).filter((x): x is number => typeof x === "number");
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 42;
}

/** The payload sent to `creerProjetConcu` (the server re-validates it entirely). */
export function versCharge(etat: EtatAssistant): Record<string, unknown> {
  return {
    genres: etat.genres,
    dureeSecondes: etat.duree,
    rythme: etat.rythme,
    dureeChoisie: etat.dureeChoisie,
    langue: etat.langue,
    langueChoisie: etat.langueChoisie,
    style: etat.style ?? undefined,
    creativite: etat.creativite,
    styleCamera: etat.styleCamera,
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
  const nomsGenres = GENRES.map((g) => g.nom);
  const genres = (Array.isArray(o.genres) ? o.genres : []).filter((g): g is string => typeof g === "string" && nomsGenres.includes(g)).slice(0, GENRES_MAX);
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
  const styleCamera = styleCameraOuNull(o.styleCamera) ?? depart.styleCamera;
  return suivreRecommandation({
    genres,
    duree: entier(o.duree, DUREE_MIN_SECONDES, DUREE_MAX_SECONDES, depart.duree),
    // The rhythm is no longer a choice: a saved session from before keeps the starting value.
    rythme: depart.rythme,
    dureeChoisie: o.dureeChoisie === true,
    langue,
    langueChoisie: o.langueChoisie === true,
    style,
    // An older session does not have these fields: starting values.
    creativite: creativiteOuNull(o.creativite) ?? depart.creativite,
    styleCamera,
    // A session from before this field: a style other than « aucun » can only come from a manual choice, we keep it.
    miseEnSceneChoisie: typeof o.miseEnSceneChoisie === "boolean" ? o.miseEnSceneChoisie : styleCamera !== STYLE_AUCUN,
  });
}
