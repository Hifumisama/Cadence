import { MAX_REFS, verifierCoherenceRefs, type RefLabel } from "../plan-checks";
import { ORDRE_SECTIONS, type NomSection } from "../prompt";
import type { Avertissement } from "./types";

/** Étape 3 du pipeline : la FICHE d'un plan (prompt H3 en six sections, références picture/audio, durée
 * de génération). Règles PURES (sans base ni Next), partagées par la conversion, l'applicateur `fiche`,
 * le service et les tests. Voir docs/FRICTIONS.md, « Étape 3 branchée » (2026-10-02).
 *
 * Une fiche s'écrit en entier (plan-h3 : les six sections ET les références, « régénérer = tout
 * régénérer ») ou en partie (iteration-plan, lib/agents/iteration-plan.ts : seulement les sections corrigées,
 * sans toucher aux autres ni aux références). Les voix ne sont JAMAIS des lignes de `plan_refs` : leurs slots `<Audio N>`
 * viennent de `plan_dialogues` et restent ceux de la base. */

// --- sous-tâches d'un lot ---------------------------------------------------------

export const PREFIXE_CLE_PLAN = "plan:";
export const cleSousTachePlan = (uuid: string): string => `${PREFIXE_CLE_PLAN}${uuid}`;
export function planUuidDeCle(cle: string | null | undefined): string | null {
  if (!cle || !cle.startsWith(PREFIXE_CLE_PLAN)) return null;
  const uuid = cle.slice(PREFIXE_CLE_PLAN.length);
  return /^[0-9a-f-]{36}$/i.test(uuid) ? uuid : null;
}

/** Clé symbolique (dans une proposition) de la création d'un asset manquant : un dérivé dont le parent est
 * lui-même créé par la proposition s'y rattache par elle (`deriveDeCle`). Unique dans la proposition : un
 * même code n'est proposé à la création qu'une fois, même par plusieurs plans d'un lot. */
export const cleNouvelAsset = (code: string): string => `nouvel-asset-${code}`;

// --- contenu d'un changement `fiche` ----------------------------------------------

export const SECTIONS_FICHE = ORDRE_SECTIONS;
export type SectionsFiche = Partial<Record<NomSection, string>>;

/** Une référence d'image ou de son du plan (une ligne de `plan_refs`). `asset` = code du registre. */
export type RefFiche = { type: "picture" | "audio"; slot: number; asset: string; role?: string | null; retention?: string | null };

/** Un passage remplacé par une correction après visionnage (iteration-plan) : AFFICHAGE seulement (la revue
 * montre « avant → après » au lieu de la section entière). L'applicateur ne lit que `sections`. */
export type PassageFiche = { section: string; avant: string; apres: string };

/** `apres` d'un changement `fiche`. Champ absent = on n'y touche pas (écriture partielle). `refs` présent =
 * les références picture/audio du plan sont REMPLACÉES par cette liste (les vidéos et les voix restent).
 * `passages` (iteration-plan) : les remplacements qui ont produit `sections`, pour la revue ; jamais écrits. */
export type ApresFiche = {
  sections?: SectionsFiche;
  refs?: RefFiche[];
  dureeGenerationSecondes?: number;
  passages?: PassageFiche[];
};

export function estSectionFiche(s: string): s is NomSection {
  return (SECTIONS_FICHE as readonly string[]).includes(s);
}

export function lireApresFiche(apres: unknown): ApresFiche {
  if (!apres || typeof apres !== "object") return {};
  const a = apres as Record<string, unknown>;
  const sortie: ApresFiche = {};
  if (a.sections && typeof a.sections === "object") {
    const s: SectionsFiche = {};
    for (const [k, v] of Object.entries(a.sections as Record<string, unknown>)) if (typeof v === "string") (s as Record<string, string>)[k] = v;
    sortie.sections = s;
  }
  if (Array.isArray(a.refs)) sortie.refs = a.refs as RefFiche[];
  if (a.dureeGenerationSecondes !== undefined) sortie.dureeGenerationSecondes = a.dureeGenerationSecondes as number;
  if (Array.isArray(a.passages)) {
    sortie.passages = (a.passages as unknown[]).filter(
      (p): p is PassageFiche => !!p && typeof p === "object" && typeof (p as PassageFiche).section === "string" && typeof (p as PassageFiche).avant === "string" && typeof (p as PassageFiche).apres === "string",
    );
  }
  return sortie;
}

/** L'état courant d'un plan, tel que l'applicateur le lit (et que les tests le fabriquent). */
export type EtatPlanFiche = {
  titre: string;
  /** Contenu actuel par section (absente = pas de ligne). */
  sections: Partial<Record<string, string>>;
  /** Références actuelles (picture, audio, video), avec le code et le type de l'asset. */
  refs: { type: "picture" | "audio" | "video"; slot: number; asset: string | null }[];
  /** Slots `<Audio N>` des répliques liées (plan_dialogues), qu'elles aient une prise ou non. */
  slotsDialogues: number[];
  /** Codes du registre du projet → type. */
  registre: Map<string, string>;
  aUnRendu: boolean;
  /** Une génération vidéo du plan attend ou tourne. */
  generationEnCours?: boolean;
  dureeGenerationSecondes: number;
};

const DUREE_MIN = 5;
const DUREE_MAX = 15;

/** Raison d'un REFUS d'écrire cette fiche sur ce plan, ou null. Vérifie le contenu (sections connues,
 * durée entière 5–15, slots 1–6 images et 1–3 audio, uniques, sans prendre ceux des voix, assets
 * existants et de la bonne nature) ET l'état final : aucune écriture ne doit laisser un label
 * `<Picture N>` / `<Audio N>` sans la référence qu'il cite. */
export function verifierFiche(apres: ApresFiche, etat: EtatPlanFiche): string | null {
  const sections = apres.sections ?? {};
  const cles = Object.keys(sections);
  if (cles.length === 0 && apres.refs === undefined && apres.dureeGenerationSecondes === undefined) return "Rien à écrire dans la fiche.";
  const inconnue = cles.find((k) => !estSectionFiche(k));
  if (inconnue) return `Section de prompt inconnue : « ${inconnue} ».`;
  const d = apres.dureeGenerationSecondes;
  if (d !== undefined && (typeof d !== "number" || !Number.isInteger(d) || d < DUREE_MIN || d > DUREE_MAX)) {
    return `Durée de génération invalide (${String(d)}) : un plan dure ${DUREE_MIN} à ${DUREE_MAX} s entières.`;
  }

  if (apres.refs) {
    const images = apres.refs.filter((r) => r.type === "picture");
    const sons = apres.refs.filter((r) => r.type === "audio");
    if (apres.refs.some((r) => r.type !== "picture" && r.type !== "audio")) return "Une fiche n'écrit que des références d'image ou de son.";
    if (images.length > MAX_REFS.picture) return `${images.length} images de référence : ${MAX_REFS.picture} au plus.`;
    if (sons.length + etat.slotsDialogues.length > MAX_REFS.audio) {
      return `${sons.length} son${sons.length > 1 ? "s" : ""} et ${etat.slotsDialogues.length} voix : ${MAX_REFS.audio} références audio au plus (la voix prime).`;
    }
    const vus = new Set<string>();
    for (const r of apres.refs) {
      const max = r.type === "picture" ? MAX_REFS.picture : MAX_REFS.audio;
      if (!Number.isInteger(r.slot) || r.slot < 1 || r.slot > max) return `Slot ${String(r.slot)} invalide pour une référence ${r.type === "picture" ? "d'image (1 à 6)" : "audio (1 à 3)"}.`;
      const cle = `${r.type}:${r.slot}`;
      if (vus.has(cle)) return `Deux références sur le même slot (${r.type === "picture" ? "Picture" : "Audio"} ${r.slot}).`;
      vus.add(cle);
      if (r.type === "audio" && etat.slotsDialogues.includes(r.slot)) return `Le slot Audio ${r.slot} est pris par une réplique liée : la voix prime.`;
      const type = etat.registre.get(r.asset);
      if (type == null) return `L'asset ${r.asset} n'existe pas dans ce projet.`;
      if (r.type === "picture" && (type === "voix" || type === "sfx")) return `${r.asset} (${type}) n'a pas d'image : il ne peut pas être une référence d'image.`;
      if (r.type === "audio" && type !== "sfx") return `${r.asset} (${type}) n'est pas un bruitage : seule une référence sfx est un son de la fiche.`;
    }
  }

  // État final : sections écrites par-dessus celles qui restent ; références nouvelles ou actuelles.
  const finales = SECTIONS_FICHE.map((section) => ({ section, contenu: sections[section] ?? etat.sections[section] ?? "" }));
  const refsFinales: RefLabel[] = [
    ...(apres.refs ? [...apres.refs.map((r) => ({ type: r.type, slot: r.slot })), ...etat.refs.filter((r) => r.type === "video")] : etat.refs.map((r) => ({ type: r.type, slot: r.slot }))),
    ...etat.slotsDialogues.map((slot) => ({ type: "audio" as const, slot })),
  ];
  const { labelsOrphelins } = verifierCoherenceRefs(finales, refsFinales);
  if (labelsOrphelins.length > 0) {
    const l = labelsOrphelins.map((x) => `<${x.replace(":", " ")}>`).join(", ");
    return `L'écriture laisserait ${labelsOrphelins.length > 1 ? "des labels" : "un label"} sans référence (${l}) : la fiche ne serait plus cohérente.`;
  }
  return null;
}

const nonVide = (s: string | undefined) => (s ?? "").trim().length > 0;

/** Ce que l'écriture remplacerait sur ce plan : `avant` (pour la revue), le texte d'écrasement (null si rien
 * n'est perdu : plan vide = création) et les avertissements. Règles (utilisateur, 2026-10-02) :
 * - une section écrite qui a déjà du texte, ou des références déjà posées qu'on remplace : écrasement
 *   (décoché par défaut, la case cochée EST le « reset » du plan) ;
 * - un plan qui a déjà un rendu vidéo : écrasement aussi, avec un avertissement de plus ;
 * - un plan vide (aucune section remplie, aucune référence) : rien n'est perdu, coché d'office. */
export function evaluerEcrasementFiche(apres: ApresFiche, etat: EtatPlanFiche): { avant: ApresFiche; ecrase: string | null; avertissements: Avertissement[] } {
  const ecrites = Object.keys(apres.sections ?? {}).filter(estSectionFiche);
  const remplies = ecrites.filter((s) => nonVide(etat.sections[s]));
  // Une référence « remplacée » est une référence actuelle qui disparaît ou change : celles que la nouvelle liste
  // garde à l'identique (même type, slot et asset) ne sont pas perdues (utile à l'itération, qui n'en change qu'une).
  const refsRemplacees = apres.refs
    ? etat.refs.filter((r) => r.type !== "video" && !apres.refs!.some((n) => n.type === r.type && n.slot === r.slot && n.asset === r.asset))
    : [];
  const avant: ApresFiche = {};
  if (ecrites.length) avant.sections = Object.fromEntries(ecrites.map((s) => [s, etat.sections[s] ?? ""])) as SectionsFiche;
  if (apres.refs) avant.refs = refsRemplacees.map((r) => ({ type: r.type as "picture" | "audio", slot: r.slot, asset: r.asset ?? "?" }));
  if (apres.dureeGenerationSecondes !== undefined) avant.dureeGenerationSecondes = etat.dureeGenerationSecondes;

  const perdu: string[] = [];
  if (remplies.length) {
    perdu.push(remplies.length === SECTIONS_FICHE.length ? "les six sections du prompt actuel" : `${remplies.length} section${remplies.length > 1 ? "s" : ""} du prompt (${remplies.join(", ")})`);
  }
  if (refsRemplacees.length) perdu.push(`${refsRemplacees.length} référence${refsRemplacees.length > 1 ? "s" : ""} d'image ou de son`);
  const avertissements: Avertissement[] = [];
  if (etat.aUnRendu) avertissements.push({ type: "ecrase_valide", texte: `« ${etat.titre} » a déjà un rendu vidéo : il ne correspondra plus à la fiche.` });
  if (etat.generationEnCours) avertissements.push({ type: "info", texte: "Une génération vidéo de ce plan est en file ou en cours : si elle a déjà commencé, elle utilise l'ancienne fiche." });
  let ecrase: string | null = null;
  if (perdu.length || etat.aUnRendu) {
    ecrase = [
      perdu.length ? `Seront remplacées : ${perdu.join(" et ")}.` : null,
      etat.aUnRendu ? "Le plan a déjà un rendu vidéo, qui ne correspondra plus à sa fiche." : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return { avant, ecrase, avertissements };
}
