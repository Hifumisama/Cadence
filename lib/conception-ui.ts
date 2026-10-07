import {
  DUREE_MAX_SECONDES,
  DUREE_MIN_SECONDES,
  DUREE_PAR_DEFAUT_SECONDES,
  EPISODES_MAX,
  EPISODES_MIN,
  GENRES,
  GENRES_MAX,
  LANGUES_DIALOGUES,
  LANGUE_PAR_DEFAUT,
  RYTHME_PAR_DEFAUT,
  SANS_DIALOGUE,
  TON_PAR_DEFAUT,
  motDuTon,
  tonDepuisGenres,
  type FormatProjet,
} from "./conception";
import { RYTHMES_BRIEF, type RythmeBrief } from "./agents/types";

/** L'état de l'assistant de conception (page `/nouveau`) côté navigateur : valeurs de départ, passage d'une étape à l'autre, résumé de
 * chaque étape, sauvegarde en session, et charge utile envoyée au serveur (qui la revalide : lib/conception.ts). Pur et sans React,
 * pour que les règles se testent. */

export type StyleChoisi =
  | { source: "bibliotheque"; styleId: string }
  | { source: "libre"; nom: string; promptImage: string; clause: string; image?: string };

export type EtatAssistant = {
  format: FormatProjet;
  episodes: number;
  genres: string[];
  /** Ton affiché : suit les genres tant que `tonAjuste` est faux. */
  ton: number;
  tonAjuste: boolean;
  duree: number;
  rythme: RythmeBrief;
  dureeChoisie: boolean;
  langue: string;
  langueChoisie: boolean;
  style: StyleChoisi | null;
};

export const ETAPES_ASSISTANT = ["Format", "Genre & ton", "Durée", "Langue", "Style"] as const;
export const DERNIERE_ETAPE = ETAPES_ASSISTANT.length - 1;
/** Les séries sont désactivées pour l'instant (« coming soon ») : la fonctionnalité reste dans le code (format, épisodes prévus, création),
 * seul le choix est grisé à l'écran. Repasser à `true` pour la rouvrir. */
export const SERIES_DISPONIBLES = false;
/** La pellicule entière, visible dès la page de départ : les cinq choix, puis ce qui suit la création du projet. */
export const ETAPES_CONCEPTION = [...ETAPES_ASSISTANT, "Scénario", "Clap", "Avancée"] as const;
export const CLE_SESSION = "cadence.conception.v1";

export function etatInitial(): EtatAssistant {
  return {
    format: "film",
    episodes: 6,
    genres: [],
    ton: TON_PAR_DEFAUT,
    tonAjuste: false,
    duree: DUREE_PAR_DEFAUT_SECONDES,
    rythme: RYTHME_PAR_DEFAUT,
    dureeChoisie: false,
    langue: LANGUE_PAR_DEFAUT,
    langueChoisie: false,
    style: null,
  };
}

/** Coche ou décoche un genre ; au-delà de `GENRES_MAX`, le plus ancien est remplacé. Le ton suit les genres tant qu'il n'a pas été ajusté. */
export function basculerGenre(etat: EtatAssistant, nom: string): EtatAssistant {
  const present = etat.genres.includes(nom);
  const genres = present ? etat.genres.filter((g) => g !== nom) : [...etat.genres, nom].slice(-GENRES_MAX);
  return { ...etat, genres, ton: etat.tonAjuste ? etat.ton : tonDepuisGenres(genres) };
}

export function ajusterTon(etat: EtatAssistant, ton: number): EtatAssistant {
  return { ...etat, ton: Math.max(0, Math.min(100, Math.round(ton))), tonAjuste: true };
}

export function reinitialiserTon(etat: EtatAssistant): EtatAssistant {
  return { ...etat, tonAjuste: false, ton: tonDepuisGenres(etat.genres) };
}

/** Un style libre est complet avec ses deux prompts (le nom et l'image sont facultatifs). */
export function styleComplet(style: StyleChoisi | null, styleUtilisable: (id: string) => boolean): boolean {
  if (!style) return false;
  if (style.source === "bibliotheque") return styleUtilisable(style.styleId);
  return style.promptImage.trim() !== "" && style.clause.trim() !== "";
}

/** On peut quitter l'étape `i` vers la suivante. */
export function etapeValide(i: number, etat: EtatAssistant, styleUtilisable: (id: string) => boolean): boolean {
  if (i === 1) return etat.genres.length >= 1;
  if (i === 4) return styleComplet(etat.style, styleUtilisable);
  return true;
}

/** La plus lointaine étape atteignable : la première dont les conditions ne sont pas remplies (sinon la dernière). */
export function etapeMax(etat: EtatAssistant, styleUtilisable: (id: string) => boolean): number {
  for (let i = 0; i <= DERNIERE_ETAPE; i++) if (!etapeValide(i, etat, styleUtilisable)) return i;
  return DERNIERE_ETAPE;
}

export function minutesSecondes(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} min${r ? ` ${r < 10 ? "0" : ""}${r}` : ""}` : `${r} s`;
}

/** Le résumé sous le nom de l'étape, dans le ruban (vide tant que rien n'est choisi). `nomStyle` : nom du style de la bibliothèque. */
export function resumeEtape(i: number, etat: EtatAssistant, nomStyle: (id: string) => string | null): string {
  switch (i) {
    case 0:
      return etat.format === "serie" ? "Série" : "Film";
    case 1:
      return etat.genres.length ? `${etat.genres.join("/")} · ${motDuTon(etat.ton)}` : "";
    case 2:
      return etat.dureeChoisie ? minutesSecondes(etat.duree) : "";
    case 3:
      return etat.langueChoisie ? etat.langue : "";
    case 4:
      if (!etat.style) return "";
      return etat.style.source === "libre" ? etat.style.nom.trim() || "Style libre" : (nomStyle(etat.style.styleId) ?? "");
    default:
      return "";
  }
}

/** La teinte de la lumière d'ambiance : moyenne des teintes des genres (or par défaut). */
export function teinteAmbiance(genres: readonly string[]): number {
  const t = genres.map((g) => GENRES.find((x) => x.nom === g)?.teinte).filter((x): x is number => typeof x === "number");
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 42;
}

/** La charge utile envoyée à `creerProjetConcu` (le serveur la revalide entièrement). */
export function versCharge(etat: EtatAssistant): Record<string, unknown> {
  return {
    format: etat.format,
    ...(etat.format === "serie" ? { episodesPrevus: etat.episodes } : {}),
    genres: etat.genres,
    ton: etat.ton,
    tonAjuste: etat.tonAjuste,
    dureeSecondes: etat.duree,
    rythme: etat.rythme,
    dureeChoisie: etat.dureeChoisie,
    langue: etat.langue,
    langueChoisie: etat.langueChoisie,
    style: etat.style ?? undefined,
  };
}

const entier = (v: unknown, min: number, max: number, defaut: number): number => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : defaut);

/** Relit l'état sauvegardé en session. Une valeur inattendue retombe sur sa valeur de départ (jamais d'erreur : la session peut venir
 * d'une version plus ancienne de la page). */
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
  const tonAjuste = o.tonAjuste === true;
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
    format: o.format === "serie" ? "serie" : "film",
    episodes: entier(o.episodes, EPISODES_MIN, EPISODES_MAX, depart.episodes),
    genres,
    ton: tonAjuste ? entier(o.ton, 0, 100, depart.ton) : tonDepuisGenres(genres),
    tonAjuste,
    duree: entier(o.duree, DUREE_MIN_SECONDES, DUREE_MAX_SECONDES, depart.duree),
    rythme: (RYTHMES_BRIEF as readonly unknown[]).includes(o.rythme) ? (o.rythme as RythmeBrief) : depart.rythme,
    dureeChoisie: o.dureeChoisie === true,
    langue,
    langueChoisie: o.langueChoisie === true,
    style,
  };
}
