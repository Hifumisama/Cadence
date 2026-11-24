import { DUREE_MAX_SECONDES, DUREE_MIN_SECONDES, LANGUES_DIALOGUES, SANS_DIALOGUE, type Conception } from "../projects/design";
import { DEPENDANCES_CHANGEMENT, demandesSurLeCadre, sectionsCitees, valeurVide, type ChangementFiche, type Fiche, type StatutFiche } from "./sheet";
import { SECTIONS_BRIEF } from "./types";

/** The « changement de direction » card (2026-11-18, mock-up C1): when the user changes something already settled (the story: genre, heart,
 * characters, places; or the FRAME of a designed project: duration, language), the screenwriter's message carries a card with the before, the
 * after, what must be revised, and three choices. It is the only way the interview changes the frame: the notes never write it
 * (`verrousDeConception`), the card's « Prendre le nouveau » does, in the design itself, so the steps ribbon follows. Pure. */

export type ChoixChangement = "garder" | "nouveau" | "melange";
export const CHOIX_CHANGEMENT: readonly ChoixChangement[] = ["garder", "nouveau", "melange"];

export type PointChangement = {
  cle: string;
  /** What exactly changes (« Mia (personnage) · tenue », « moment 3 »), or the section's name. */
  libelle: string;
  /** The section it belongs to (« personnages »), for the card's title; absent on older cards (then `libelle`). */
  sujet?: string;
  avant: string;
  apres: string;
  /** A frame section (design form), not the story. */
  cadre: boolean;
};

export type CarteChangement = {
  points: PointChangement[];
  /** What must be revised if the new direction is taken (labels). */
  aRevoir: string[];
  /** The frame values « Prendre le nouveau » applies (checked values). */
  cadre?: { dureeEpisodeSecondes?: number; langueDialogues?: string };
  /** The story sections as they were before this message (content, status; null = absent), put back by « Garder l'ancien ». */
  restaurer?: { contenu: Record<string, unknown>; statuts: Record<string, StatutFiche | null> };
  /** Set once the user has chosen: the card is then read only. */
  choix?: ChoixChangement;
};

/** The frame sections the card can change. The style is not one of them: it is changed from the Brief (its long image prompt comes with it). */
export const CADRE_MODIFIABLE = ["dureeEpisodeSecondes", "langueDialogues"] as const;

const LANGUES_EN_FRANCAIS: Record<string, string> = {
  francais: "Français",
  anglais: "English",
  japonais: "日本語",
  coreen: "한국어",
  chinois: "中文",
  allemand: "Deutsch",
  russe: "Русский",
  portugais: "Português",
  espagnol: "Español",
  italien: "Italiano",
};
const sansAccents = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** A frame value as the design accepts it, or null (out of bounds, unknown language). */
export function valeurCadre(cle: string, v: unknown): number | string | null {
  if (cle === "dureeEpisodeSecondes") {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
    return Number.isFinite(n) && n >= DUREE_MIN_SECONDES && n <= DUREE_MAX_SECONDES ? Math.round(n) : null;
  }
  if (cle === "langueDialogues" && typeof v === "string") {
    const t = v.trim();
    const connue = [...LANGUES_DIALOGUES, SANS_DIALOGUE].find((l) => sansAccents(l) === sansAccents(t));
    return connue ?? LANGUES_EN_FRANCAIS[sansAccents(t)] ?? (/sans dialogue|muet/.test(sansAccents(t)) ? SANS_DIALOGUE : null);
  }
  return null;
}

/** A project is a film: the brief's « Durée d'un épisode » reads « durée du film » on the card. */
const LIBELLES_CARTE: Record<string, string> = { dureeEpisodeSecondes: "durée du film" };
const libelleSection = (cle: string): string => LIBELLES_CARTE[cle] ?? (SECTIONS_BRIEF.find((x) => x.cle === cle)?.libelle ?? cle).replace(/ \(.*\)$/, "").toLowerCase();

const duree = (s: number): string => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${String(s % 60).padStart(2, "0")}` : ""}`);
// Long enough to read a whole sentence (test feedback 2026-11-23: « on n'avait aucune idée de ce que ça bougeait »).
const court = (t: string, n = 360): string => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** A section's value in a few words, for the card. */
export function apercu(cle: string, v: unknown): string {
  if (v == null || valeurVide(v)) return "—";
  if (cle === "dureeEpisodeSecondes" && typeof v === "number") return duree(v);
  if (typeof v === "string") return court(v.replace(/\s+/g, " ").trim());
  if (Array.isArray(v)) {
    const noms = v.map((x) => (x && typeof x === "object" ? (x as { nom?: unknown }).nom : x)).filter((x): x is string => typeof x === "string" && x.trim() !== "");
    return noms.length ? court(noms.join(", ")) : `${v.length} élément${v.length > 1 ? "s" : ""}`;
  }
  if (typeof v === "object") {
    const nom = (v as { nom?: unknown }).nom;
    if (typeof nom === "string" && nom.trim()) return court(nom.trim());
    // A sub-object (an outfit, a place's look): its texts, in order.
    const textes = Object.entries(v as Record<string, unknown>).filter(([k, x]) => k !== "statut" && typeof x === "string" && x.trim()).map(([, x]) => (x as string).trim());
    if (textes.length) return court(textes.join(" · "));
  }
  return court(JSON.stringify(v));
}

const SINGULIER: Record<string, string> = { personnages: "personnage", lieux: "lieu", elements: "élément" };
const CHAMPS: Record<string, string> = {
  age: "âge",
  apparence: "apparence",
  tenue: "tenue",
  gestuelle: "gestuelle",
  voix: "voix",
  reconnaissable: "signe distinctif",
  description: "description",
  aspect: "aspect",
  role: "rôle",
};
/** Beyond this many detailed differences, the card says the section changed as a whole (a list of ten lines is no longer a card). */
const MAX_POINTS_DETAILLES = 5;
const norm = (t: unknown): string => (typeof t === "string" ? sansAccents(t).replace(/\s+/g, " ") : "");
const meme = (a: unknown, b: unknown): boolean => JSON.stringify(sansStatut(a)) === JSON.stringify(sansStatut(b));
function sansStatut(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sansStatut);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== "statut").map(([k, x]) => [k, sansStatut(x)]));
  return v;
}
const texteMoment = (m: unknown): string => (typeof m === "string" ? m : m && typeof m === "object" ? String((m as { texte?: unknown; text?: unknown }).texte ?? (m as { text?: unknown }).text ?? "") : "");

/** What exactly changed inside a list section (2026-11-18, project 264: a changed outfit showed « La jeune femme → La jeune femme »). Characters,
 * places and elements are matched by name and compared field by field; the moments, rank by rank. Null when the difference cannot be told
 * in a few points (the section is then shown as a whole). */
export function pointsDetailles(cle: string, avant: unknown, apres: unknown): Omit<PointChangement, "cadre">[] | null {
  if (!Array.isArray(avant) || !Array.isArray(apres)) return null;
  const sujet = libelleSection(cle);
  const points: Omit<PointChangement, "cadre">[] = [];
  if (cle === "moments") {
    const a = avant.map(texteMoment);
    const b = apres.map(texteMoment);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (norm(a[i]) === norm(b[i])) continue;
      points.push({ cle, sujet, libelle: `moment ${i + 1}${i >= a.length ? " (nouveau)" : ""}`, avant: i < a.length ? apercu(cle, a[i]) : "—", apres: i < b.length ? apercu(cle, b[i]) : "retiré" });
    }
  } else if (SINGULIER[cle]) {
    const nom = (x: unknown) => (x && typeof x === "object" ? String((x as { nom?: unknown }).nom ?? "") : "");
    const parNom = (l: unknown[]) => new Map(l.map((x) => [norm(nom(x)), x as Record<string, unknown>]));
    const ma = parNom(avant);
    const mb = parNom(apres);
    for (const [k, b] of mb) {
      const a = ma.get(k);
      const etiquette = `${nom(b)} (${SINGULIER[cle]})`;
      if (!a) {
        points.push({ cle, sujet, libelle: etiquette, avant: "—", apres: `ajouté : ${apercu(cle, b.description ?? b.apparence ?? "")}` });
        continue;
      }
      for (const champ of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (champ === "nom" || champ === "statut" || meme(a[champ], b[champ])) continue;
        points.push({ cle, sujet, libelle: `${etiquette} · ${CHAMPS[champ] ?? champ}`, avant: apercu(champ, a[champ]), apres: apercu(champ, b[champ]) });
      }
    }
    for (const [k, a] of ma) if (!mb.has(k)) points.push({ cle, sujet, libelle: `${nom(a)} (${SINGULIER[cle]})`, avant: apercu(cle, a.description ?? a.apparence ?? ""), apres: "retiré" });
  } else return null;
  return points.length && points.length <= MAX_POINTS_DETAILLES ? points : null;
}

/** The frame changes the user asked for in their last message: a locked section the notes wanted to write, quoted (`dit`) in that message,
 * with a value the design accepts and that differs from the current one. */
export function pointsCadre(fiche: Fiche, sortie: unknown, verrous: readonly string[], messagesUtilisateur: string[]): { cle: string; valeur: number | string }[] {
  const citees = sectionsCitees(sortie, messagesUtilisateur);
  return demandesSurLeCadre(fiche, sortie, verrous)
    .filter((d) => (CADRE_MODIFIABLE as readonly string[]).includes(d.cle) && citees.has(d.cle))
    .map((d) => ({ cle: d.cle, valeur: valeurCadre(d.cle, d.valeur) }))
    .filter((d): d is { cle: string; valeur: number | string } => d.valeur !== null && d.valeur !== fiche.contenu[d.cle]);
}

/** What a dependent section becomes if the new idea is taken. */
const CONSEQUENCES: Record<string, string> = {
  moments: "les moments du film seront réécrits pour suivre",
  musique: "la musique sera revue pour suivre le nouveau ton",
  lieux: "l'aspect des lieux sera revu pour suivre le nouveau ton",
};

/** The card for this turn, or null when nothing settled changed. `changements`: story changes (`changementsDeFiche`); `cadre`: `pointsCadre`. */
export function carteChangement(avant: Fiche, changements: ChangementFiche[], cadre: { cle: string; valeur: number | string }[]): CarteChangement | null {
  if (!changements.length && !cadre.length) return null;
  const points: PointChangement[] = [
    ...cadre.map((c) => ({ cle: c.cle, libelle: libelleSection(c.cle), sujet: libelleSection(c.cle), avant: apercu(c.cle, avant.contenu[c.cle]), apres: apercu(c.cle, c.valeur), cadre: true })),
    ...changements.flatMap((c) => {
      const apres = safeParse(c.apres);
      const detail = pointsDetailles(c.cle, avant.contenu[c.cle], apres);
      if (detail) return detail.map((d) => ({ ...d, cadre: false }));
      return [{ cle: c.cle, libelle: libelleSection(c.cle), sujet: libelleSection(c.cle), avant: apercu(c.cle, avant.contenu[c.cle]), apres: apercu(c.cle, apres), cadre: false }];
    }),
  ];
  const changees = new Set(points.map((p) => p.cle));
  const dependantes = [...new Set(changements.flatMap((c) => DEPENDANCES_CHANGEMENT[c.cle] ?? []))].filter((k) => !changees.has(k));
  // What taking the new idea does, in plain sentences (test feedback 2026-11-23).
  const aRevoir = [
    ...dependantes.map((k) => CONSEQUENCES[k] ?? `${libelleSection(k)} sera revu pour suivre`),
    // A new duration changes how many moments are needed (unless the moments are already to be revised).
    ...(cadre.some((c) => c.cle === "dureeEpisodeSecondes") && !dependantes.includes("moments") ? ["le nombre de moments suivra la nouvelle durée (un toutes les dix secondes environ)"] : []),
    ...(cadre.some((c) => c.cle === "langueDialogues") ? ["les répliques seront écrites dans la nouvelle langue"] : []),
  ];
  const carte: CarteChangement = { points, aRevoir };
  if (cadre.length) carte.cadre = Object.fromEntries(cadre.map((c) => [c.cle, c.valeur])) as CarteChangement["cadre"];
  if (changements.length) {
    const cles = [...changements.map((c) => c.cle), ...dependantes];
    carte.restaurer = {
      contenu: Object.fromEntries(cles.map((k) => [k, avant.contenu[k] ?? null])),
      statuts: Object.fromEntries(cles.map((k) => [k, avant.statuts[k] ?? null])),
    };
  }
  return carte;
}

/** `changementsDeFiche` gives the new value as text (JSON for structures): back to a value for the preview. */
function safeParse(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** The sheet once the user has chosen. « Garder l'ancien »: the story sections come back as they were (dependants included); « Prendre le
 * nouveau »: the frame values are written, settled (the story's new version is already in the sheet); « Un mélange »: nothing yet, the user writes it. */
export function ficheApresDecision(fiche: Fiche, carte: CarteChangement, choix: ChoixChangement): Fiche {
  const contenu = { ...fiche.contenu };
  const statuts = { ...fiche.statuts };
  if (choix === "garder" && carte.restaurer) {
    for (const [k, v] of Object.entries(carte.restaurer.contenu)) {
      if (v === null) delete contenu[k];
      else contenu[k] = v;
    }
    for (const [k, s] of Object.entries(carte.restaurer.statuts)) {
      if (s === null) delete statuts[k];
      else statuts[k] = s;
    }
  }
  if (choix === "nouveau" && carte.cadre) {
    for (const [k, v] of Object.entries(carte.cadre)) {
      if (v === undefined) continue;
      contenu[k] = v;
      statuts[k] = "fourni";
    }
  }
  return { ...fiche, contenu, statuts };
}

/** The design once the user has taken the new frame (same effect as going back to that step of the form); null when it does not change. */
export function conceptionApresDecision(c: Conception, carte: CarteChangement, choix: ChoixChangement): Conception | null {
  if (choix !== "nouveau" || !carte.cadre) return null;
  const { dureeEpisodeSecondes: d, langueDialogues: l } = carte.cadre;
  if (d === undefined && l === undefined) return null;
  return { ...c, ...(d !== undefined ? { dureeSecondes: d, dureeChoisie: true } : {}), ...(l !== undefined ? { langue: l, langueChoisie: true } : {}) };
}

const resumePoints = (carte: CarteChangement, cote: "avant" | "apres"): string => carte.points.map((p) => `${p.libelle} : ${p[cote].replace(/[.!…\s]+$/, "")}`).join(" ; ");

/** The message the choice sends (the notes and the screenwriter read it as the user's answer). « Un mélange » is a draft to complete. */
export function messageDecision(carte: CarteChangement, choix: ChoixChangement): string {
  if (choix === "garder") return `Je garde l'ancienne version (${resumePoints(carte, "avant")}).`;
  if (choix === "nouveau") return `Je prends la nouvelle direction (${resumePoints(carte, "apres")}).${carte.aRevoir.length ? ` Revois ce qui en dépend : ${carte.aRevoir.join(", ")}.` : ""}`;
  return `Un mélange : de l'ancienne version je garde … ; de la nouvelle je prends …`;
}

const chaine = (v: unknown): v is string => typeof v === "string";

/** The card as stored on a message (or carried by the turn's task), checked; null when absent or malformed. */
export function normaliserCarteChangement(v: unknown): CarteChangement | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.points)) return null;
  const points = o.points
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .filter((p) => chaine(p.cle) && chaine(p.libelle) && chaine(p.avant) && chaine(p.apres))
    .map((p) => ({
      cle: p.cle as string,
      libelle: p.libelle as string,
      ...(chaine(p.sujet) ? { sujet: p.sujet } : {}),
      avant: p.avant as string,
      apres: p.apres as string,
      cadre: p.cadre === true,
    }));
  if (!points.length) return null;
  const carte: CarteChangement = { points, aRevoir: Array.isArray(o.aRevoir) ? o.aRevoir.filter(chaine) : [] };
  if (o.cadre && typeof o.cadre === "object") {
    const c = o.cadre as Record<string, unknown>;
    const d = valeurCadre("dureeEpisodeSecondes", c.dureeEpisodeSecondes);
    const l = valeurCadre("langueDialogues", c.langueDialogues);
    if (typeof d === "number" || typeof l === "string") carte.cadre = { ...(typeof d === "number" ? { dureeEpisodeSecondes: d } : {}), ...(typeof l === "string" ? { langueDialogues: l } : {}) };
  }
  if (o.restaurer && typeof o.restaurer === "object") {
    const r = o.restaurer as { contenu?: unknown; statuts?: unknown };
    const statuts: Record<string, StatutFiche | null> = {};
    for (const [k, s] of Object.entries((r.statuts as Record<string, unknown>) ?? {})) statuts[k] = s === "fourni" || s === "delegue" || s === "deduit" ? s : null;
    if (r.contenu && typeof r.contenu === "object") carte.restaurer = { contenu: { ...(r.contenu as Record<string, unknown>) }, statuts };
  }
  if ((CHOIX_CHANGEMENT as readonly unknown[]).includes(o.choix)) carte.choix = o.choix as ChoixChangement;
  return carte;
}

/** What the screen shows: the card without what only the server needs (the values to put back). */
export type CarteChangementVue = Omit<CarteChangement, "restaurer" | "cadre">;
export const carteVue = (c: CarteChangement): CarteChangementVue => ({ points: c.points, aRevoir: c.aRevoir, ...(c.choix ? { choix: c.choix } : {}) });
