import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../clips/clip-checks";
import { MAX_REFS, verifierCoherenceRefs, type RefLabel } from "../clips/clip-checks";
import { ORDRE_SECTIONS, type NomSection } from "../clips/prompt";
import type { Avertissement } from "./types";
import { estCreativite, estMiseEnScene, STYLE_AUCUN } from "../h3ir/settings";

/** Step 3 of the pipeline: a clip's SHEET (H3 prompt in six sections, picture references, generation
 * duration). PURE rules (no database or Next), shared by the conversion, the `fiche` applier,
 * the service and the tests. See docs/FRICTIONS.md, "Étape 3 branchée" (2026-10-02).
 *
 * A sheet is written in full (Open H3 IR: the six sections AND the references, "régénérer = tout
 * régénérer") or in part (iteration-plan, lib/agents/iteration-clip.ts: only the corrected sections,
 * without touching the others or the references). */

// --- batch subtasks ---------------------------------------------------------

const PREFIXE_CLE_PLAN = "plan:";
export const cleSousTachePlan = (uuid: string): string => `${PREFIXE_CLE_PLAN}${uuid}`;
export function planUuidDeCle(cle: string | null | undefined): string | null {
  if (!cle || !cle.startsWith(PREFIXE_CLE_PLAN)) return null;
  const uuid = cle.slice(PREFIXE_CLE_PLAN.length);
  return /^[0-9a-f-]{36}$/i.test(uuid) ? uuid : null;
}

/** Symbolic key (within a proposal) of the creation of a missing asset: a derivative whose parent is
 * itself created by the proposal attaches to it through this key (`deriveDeCle`). Unique within the proposal: a
 * same code is proposed for creation only once, even by several clips of a batch. */
export const cleNouvelAsset = (code: string): string => `nouvel-asset-${code}`;

// --- content of a `fiche` change ----------------------------------------------

export const SECTIONS_FICHE = ORDRE_SECTIONS;
type SectionsFiche = Partial<Record<NomSection, string>>;

/** A clip's image reference (a `plan_refs` row). `asset` = registry code. */
export type RefFiche = { type: "picture"; slot: number; asset: string; role?: string | null; retention?: string | null };

/** A passage replaced by a correction after viewing (iteration-plan): DISPLAY only (the review
 * shows "before → after" instead of the whole section). The applier only reads `sections`. */
type PassageFiche = { section: string; avant: string; apres: string };

/** `apres` of a `fiche` change. Absent field = not touched (partial write). `refs` present =
 * the clip's picture references are REPLACED by this list (videos stay).
 * `passages` (iteration-plan): the replacements that produced `sections`, for the review; never written. */
export type ApresFiche = {
  sections?: SectionsFiche;
  refs?: RefFiche[];
  dureeGenerationSecondes?: number;
  passages?: PassageFiche[];
  /** The NEW description (intent) of the clip, complete: written with the sheet when the correction changes what happens in the clip
   * ("Itérer": lib/agents/iteration-clip.ts). The old one stays in the previous attempt
   * (`jobs.description_utilisee`), like the prompt. */
  description?: string;
  /** Keys (`cleNouvelAsset`) of the assets that the SAME proposal creates and that `refs` cites: the sheet applies after them (their image does not
   * exist yet, the sheet cites them anyway: the page's check says "pas encore d'image"). */
  dependDeCles?: string[];
  /** The sheet comes from the Open H3 IR compiler (lib/h3ir/conversion.ts): the applier then keeps the replaced prompt in the prompt's history
   * (source "avant") and records the new one there (source "compilation"). */
  moteur?: "h3ir";
  /** Open H3 IR settings of the CLIP decided by "Itérer" (2026-11-09): the value REPLACES `plans.creativite` / `plans.style_camera` (`"aucun"` = no
   * style). Absent = not touched. Written with the compiled sheet that used them. */
  reglages?: { creativite?: string; styleCamera?: string };
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
  // An old proposal may still carry audio references (voices, removed): only the images are kept.
  if (Array.isArray(a.refs)) sortie.refs = (a.refs as RefFiche[]).filter((r) => r.type === "picture");
  if (a.dureeGenerationSecondes !== undefined) sortie.dureeGenerationSecondes = a.dureeGenerationSecondes as number;
  if (typeof a.description === "string" && a.description.trim()) sortie.description = a.description.trim();
  if (a.moteur === "h3ir") sortie.moteur = "h3ir";
  if (a.reglages && typeof a.reglages === "object") {
    const r = a.reglages as Record<string, unknown>;
    const reglages = { ...(typeof r.creativite === "string" ? { creativite: r.creativite } : {}), ...(typeof r.styleCamera === "string" ? { styleCamera: r.styleCamera } : {}) };
    if (Object.keys(reglages).length) sortie.reglages = reglages;
  }
  if (Array.isArray(a.dependDeCles)) sortie.dependDeCles = a.dependDeCles.filter((c): c is string => typeof c === "string");
  if (Array.isArray(a.passages)) {
    sortie.passages = (a.passages as unknown[]).filter(
      (p): p is PassageFiche => !!p && typeof p === "object" && typeof (p as PassageFiche).section === "string" && typeof (p as PassageFiche).avant === "string" && typeof (p as PassageFiche).apres === "string",
    );
  }
  return sortie;
}

/** A clip's current state, as the applier reads it (and as the tests build it). */
export type EtatPlanFiche = {
  titre: string;
  /** Current content per section (absent = no line). */
  sections: Partial<Record<string, string>>;
  /** Current references (picture, video), with the asset's code and type. */
  refs: { type: "picture" | "video"; slot: number; asset: string | null }[];
  /** The project's registry codes → type. */
  registre: Map<string, string>;
  aUnRendu: boolean;
  /** A video generation of the clip is waiting or running. */
  generationEnCours?: boolean;
  dureeGenerationSecondes: number;
};

const DUREE_MIN = DUREE_GENERATION_MIN;
const DUREE_MAX = DUREE_GENERATION_MAX;

/** Reason for REFUSING to write this sheet on this clip, or null. Checks the content (known sections,
 * whole duration 4–10, slots 1–6 images, unique, assets
 * existing and of the right kind) AND the final state: no write may leave a `<Picture N>` label
 * without the reference it cites. */
export function verifierFiche(apres: ApresFiche, etat: EtatPlanFiche): string | null {
  const sections = apres.sections ?? {};
  const cles = Object.keys(sections);
  if (cles.length === 0 && apres.refs === undefined && apres.dureeGenerationSecondes === undefined && apres.description === undefined && apres.reglages === undefined) return "Rien à écrire dans la fiche.";
  const rg = apres.reglages;
  if (rg?.creativite !== undefined && !estCreativite(rg.creativite)) return `Créativité inconnue : « ${rg.creativite} ».`;
  if (rg?.styleCamera !== undefined && !estMiseEnScene(rg.styleCamera) && rg.styleCamera !== STYLE_AUCUN) return `Style de mise en scène inconnu : « ${rg.styleCamera} ».`;
  const inconnue = cles.find((k) => !estSectionFiche(k));
  if (inconnue) return `Section de prompt inconnue : « ${inconnue} ».`;
  const d = apres.dureeGenerationSecondes;
  if (d !== undefined && (typeof d !== "number" || !Number.isInteger(d) || d < DUREE_MIN || d > DUREE_MAX)) {
    return `Durée de génération invalide (${String(d)}) : un plan dure ${DUREE_MIN} à ${DUREE_MAX} s entières.`;
  }

  if (apres.refs) {
    const images = apres.refs.filter((r) => r.type === "picture");
    if (apres.refs.some((r) => r.type !== "picture")) return "Une fiche n'écrit que des références d'image.";
    if (images.length > MAX_REFS.picture) return `${images.length} images de référence : ${MAX_REFS.picture} au plus.`;
    const vus = new Set<string>();
    for (const r of apres.refs) {
      if (!Number.isInteger(r.slot) || r.slot < 1 || r.slot > MAX_REFS.picture) return `Slot ${String(r.slot)} invalide pour une référence d'image (1 à ${MAX_REFS.picture}).`;
      const cle = `${r.type}:${r.slot}`;
      if (vus.has(cle)) return `Deux références sur le même slot (Picture ${r.slot}).`;
      vus.add(cle);
      const type = etat.registre.get(r.asset);
      if (type == null) return `L'asset ${r.asset} n'existe pas dans ce projet.`;
      if (r.type === "picture" && type === "voix") return `${r.asset} (${type}) n'a pas d'image : il ne peut pas être une référence d'image.`;
    }
  }

  // Final state: sections written over those that remain; new or current references.
  const finales = SECTIONS_FICHE.map((section) => ({ section, contenu: sections[section] ?? etat.sections[section] ?? "" }));
  const refsFinales: RefLabel[] = [
    ...(apres.refs ? [...apres.refs.map((r) => ({ type: r.type, slot: r.slot })), ...etat.refs.filter((r) => r.type === "video")] : etat.refs.map((r) => ({ type: r.type, slot: r.slot }))),
  ];
  // Only the orphan labels THIS write introduces are refused: an inconsistency already there (a line of dialogue unlinked from the clip whose voice lines
  // `<Audio 1>` stayed in the prompt) must not block an unrelated correction; it is flagged separately (`labelsOrphelinsActuels`).
  const { labelsOrphelins } = verifierCoherenceRefs(finales, refsFinales);
  const dejaLa = new Set(labelsOrphelinsActuels(etat));
  const nouveaux = labelsOrphelins.filter((x) => !dejaLa.has(x));
  if (nouveaux.length > 0) {
    const l = nouveaux.map((x) => `<${x.replace(":", " ")}>`).join(", ");
    return `L'écriture laisserait ${nouveaux.length > 1 ? "des labels" : "un label"} sans référence (${l}) : la fiche ne serait plus cohérente.`;
  }
  return null;
}

/** The labels the CURRENT prompt cites without a reference (before any write): a clip inconsistent in advance. */
export function labelsOrphelinsActuels(etat: EtatPlanFiche): string[] {
  const sections = SECTIONS_FICHE.map((section) => ({ section, contenu: etat.sections[section] ?? "" }));
  const refs: RefLabel[] = etat.refs.map((r) => ({ type: r.type, slot: r.slot }));
  return verifierCoherenceRefs(sections, refs).labelsOrphelins;
}

const nonVide = (s: string | undefined) => (s ?? "").trim().length > 0;

/** What the write would replace on this clip: `avant` (for the review), the overwrite text (null if nothing
 * is lost: empty clip = creation) and the warnings. Rules (user, 2026-10-02):
 * - a written section that already has text, or references already set that get replaced: overwrite
 *   (unticked by default, the ticked box IS the clip's "reset");
 * - a clip that already has a video render: overwrite too, with one more warning;
 * - an empty clip (no filled section, no reference): nothing is lost, ticked outright. */
export function evaluerEcrasementFiche(apres: ApresFiche, etat: EtatPlanFiche): { avant: ApresFiche; ecrase: string | null; avertissements: Avertissement[] } {
  const ecrites = Object.keys(apres.sections ?? {}).filter(estSectionFiche);
  const remplies = ecrites.filter((s) => nonVide(etat.sections[s]));
  // A "replaced" reference is a current reference that disappears or changes: those the new list
  // keeps identically (same type, slot and asset) are not lost (useful for the iteration, which changes only one).
  const refsRemplacees = apres.refs
    ? etat.refs.filter((r) => r.type !== "video" && !apres.refs!.some((n) => n.type === r.type && n.slot === r.slot && n.asset === r.asset))
    : [];
  const avant: ApresFiche = {};
  if (ecrites.length) avant.sections = Object.fromEntries(ecrites.map((s) => [s, etat.sections[s] ?? ""])) as SectionsFiche;
  if (apres.refs) avant.refs = refsRemplacees.map((r) => ({ type: r.type as "picture", slot: r.slot, asset: r.asset ?? "?" }));
  if (apres.dureeGenerationSecondes !== undefined) avant.dureeGenerationSecondes = etat.dureeGenerationSecondes;

  const perdu: string[] = [];
  if (remplies.length) {
    perdu.push(remplies.length === SECTIONS_FICHE.length ? "les six sections du prompt actuel" : `${remplies.length} section${remplies.length > 1 ? "s" : ""} du prompt (${remplies.join(", ")})`);
  }
  if (refsRemplacees.length) perdu.push(`${refsRemplacees.length} référence${refsRemplacees.length > 1 ? "s" : ""} d'image ou de son`);
  const avertissements: Avertissement[] = [];
  if (etat.aUnRendu) avertissements.push({ type: "ecrase_valide", texte: `« ${etat.titre} » a déjà un rendu vidéo : il ne correspondra plus à la fiche.` });
  const orphelins = labelsOrphelinsActuels(etat);
  if (orphelins.length > 0) {
    avertissements.push({ type: "info", texte: `Ce plan citait déjà ${orphelins.map((x) => `<${x.replace(":", " ")}>`).join(", ")} sans référence (une réplique déliée du plan ?) : cette écriture ne l'a pas aggravé, mais la fiche est à nettoyer.` });
  }
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
