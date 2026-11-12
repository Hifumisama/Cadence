import { construireCode } from "../assets/assetCode";
import type { ChangementBrut } from "../agents/changes";
import { suffixeDeCode } from "../agents/conversion";
import { correspondances } from "../agents/similar-codes";
import { cleNouvelAsset } from "../agents/sheets";
import { MAX_MANQUANTS_PLAN, TYPES_MANQUANT_PLAN } from "../agents/references-clip";
import { LIMITE_IMAGES_PLAN } from "./references-clip";

/** PREPARE A CLIP THEN COMPILE IT (step 5 of Open H3 IR wired in, wave 4a, 2026-11-09). Open H3 IR is the only producer of the video prompts, including
 * for a new clip: before compilation, each clip goes through
 *   1. REFERENCES: a clip that already has reference images (inventory, by hand) keeps them (unless `rechoisir`); otherwise the CODE chooses them
 *      (lib/h3ir/references-clip.ts) and writes them when it has no doubt; only in case of doubt, an LLM task `references-plan` (one per clip)
 *      completes the list and flags at most two missing assets. In screenplay order: a clip waits for the previous clip to have finished this step
 *      (the set continuation reads its references);
 *   2. ASSETS: the missing ones (2 at most) are created by default, with a valid code and parent;
 *   3. PROMPTS: the references without an image and without a prompt receive their prompt (`prompt-asset`, LLM tasks);
 *   4. IMAGES: their images go into the queue (GPU), adopted automatically; the request stays « en attente d'images » as long as a reference has no file.
 *      An image in failure stops the request, naming the asset;
 *   5. COMPILATION: translation of the intent, then the Open H3 IR compiler (LLM task `plan-h3ir`), sheet saved without review.
 * Fast path: references that all have their image → direct compilation, without a choice call.
 * No new clip state: « en attente d'images » is computed from the references without a file; a draft only goes « en attente » with the sheet.
 *
 * Here: the PURE rules (tested, preparation.test.ts). The reads and writes: lib/h3ir/preparation-db.ts; the driver: lib/tasks/requests-db.ts. */

/** The proposal that creates the missing assets decided by « Itérer » (lib/agents/service.ts, `creerAssetsManquants`). */
export const SKILL_ASSETS_MANQUANTS = "assets-manquants";

// --- 1. references -----------------------------------------------------------------------------------------------------------------------------

export type ObservationReferences = {
  /** The number of reference images already set on the clip. */
  existantes: number;
  /** Re-choose even if the clip already has references (explicit request). */
  rechoisir: boolean;
  /** A clip EARLIER in the screenplay order has a sheet request in progress that has not finished its references. */
  precedentEnAttente: boolean;
  /** The code's choice (null: not yet computed or clip not found). */
  choix: { suffit: boolean; references: string[] } | null;
};

export type DecisionReferences =
  | { action: "garder" }
  | { action: "attendre" }
  | { action: "ecrire"; codes: string[] }
  | { action: "skill" }
  | { action: "echec"; erreur: string };

export function deciderReferences(o: ObservationReferences): DecisionReferences {
  if (o.existantes > 0 && !o.rechoisir) return { action: "garder" };
  if (o.precedentEnAttente) return { action: "attendre" };
  if (!o.choix) return { action: "echec", erreur: "Le plan n'existe plus." };
  if (o.choix.suffit && o.choix.references.length > 0) return { action: "ecrire", codes: o.choix.references };
  return { action: "skill" };
}

/** Does a clip wait for an earlier clip in the screenplay? `ordre`: that of the clip; `autres`: the sheet requests IN PROGRESS of the same episode. */
export function precedentEnAttente(ordre: number, autres: { ordre: number; referencesFinies: boolean }[]): boolean {
  return autres.some((a) => a.ordre < ordre && !a.referencesFinies);
}

// --- 2. missing assets -----------------------------------------------------------------------------------------------------------------------

export type ManquantPropose = { code: string; type: string; parent?: string | null; description?: string; raison?: string };
export type ManquantRetenu = { code: string; type: string; parent: string | null; description: string; raison: string };

/** The missing ones we really create: permitted type (neither sound, nor voice, nor effect), code rebuilt according to the registry's convention, not already
 * in the registry (it is then returned in `existants`: it is a reference, not a creation), no duplicates, `max` at most; the parent is only kept if it exists
 * and has the same type. `place`: the images still free on the clip (6 at most, references included). Pure. */
export function retenirManquants(
  proposes: ManquantPropose[],
  registre: { code: string; type: string }[],
  options: { max?: number; place?: number } = {},
): { retenus: ManquantRetenu[]; existants: string[]; ecartes: { code: string; raison: string }[] } {
  const max = Math.min(options.max ?? MAX_MANQUANTS_PLAN, options.place ?? LIMITE_IMAGES_PLAN);
  const typeDe = new Map(registre.map((a) => [a.code, a.type]));
  const retenus: ManquantRetenu[] = [];
  const existants: string[] = [];
  const ecartes: { code: string; raison: string }[] = [];
  for (const m of proposes) {
    const brut = (m.code ?? "").trim();
    if (!(TYPES_MANQUANT_PLAN as readonly string[]).includes(m.type)) {
      ecartes.push({ code: brut, raison: `type « ${m.type} » non créé d'office (ni son, ni voix, ni effet)` });
      continue;
    }
    const suffixe = suffixeDeCode(brut);
    if (!suffixe) {
      ecartes.push({ code: brut, raison: "code illisible" });
      continue;
    }
    const code = construireCode(m.type, suffixe);
    if (typeDe.has(code)) {
      if (!existants.includes(code)) existants.push(code);
      continue;
    }
    if (retenus.some((r) => r.code === code)) continue;
    if (retenus.length >= max) {
      ecartes.push({ code, raison: `au plus ${max} asset${max > 1 ? "s" : ""} créé${max > 1 ? "s" : ""} par plan : à créer à la main si besoin` });
      continue;
    }
    const parent = m.parent?.trim() && typeDe.get(m.parent.trim()) === m.type ? m.parent.trim() : null;
    retenus.push({ code, type: m.type, parent, description: (m.description ?? "").trim(), raison: (m.raison ?? "").trim() });
  }
  return { retenus, existants, ecartes };
}

/** What is done with the output of the `references-plan` skill: its references (miscopied codes matched, only images from the registry, without duplicates),
 * then its missing ones retained (`retenirManquants`, in the room that remains). Replayed AFTER the creation of the missing ones, the same output returns
 * their codes as references (`existants`): this is how the application writes the full list. Pure. */
export function decisionSortieReferencesPlan(
  sortie: { references?: { code: string }[]; manquants?: ManquantPropose[] },
  registre: { code: string; type: string }[],
): { references: string[]; manquants: ManquantRetenu[]; ecartes: { code: string; raison: string }[]; corrections: { de: string; vers: string }[] } {
  const typeDe = new Map(registre.map((a) => [a.code, a.type]));
  const codes = registre.map((a) => a.code);
  const cites = [...(sortie.references ?? []).map((r) => r.code), ...(sortie.manquants ?? []).flatMap((m) => (m.parent ? [m.parent] : []))];
  const proches = correspondances(cites, codes);
  const vers = (c: string) => proches.get(c) ?? c;
  const references: string[] = [];
  for (const r of sortie.references ?? []) {
    const code = vers((r.code ?? "").trim());
    const type = typeDe.get(code);
    if (!type || !TYPES_IMAGE_REFERENCE.has(type) || references.includes(code)) continue;
    references.push(code);
  }
  const m = retenirManquants((sortie.manquants ?? []).map((x) => ({ ...x, parent: x.parent ? vers(x.parent) : null })), registre, { place: Math.max(0, LIMITE_IMAGES_PLAN - references.length) });
  for (const c of m.existants) if (!references.includes(c) && TYPES_IMAGE_REFERENCE.has(typeDe.get(c) ?? "")) references.push(c);
  return { references: references.slice(0, LIMITE_IMAGES_PLAN), manquants: m.retenus, ecartes: m.ecartes, corrections: [...proches].map(([de, v]) => ({ de, vers: v })) };
}

/** The asset types that can be a reference image (the same as lib/h3ir/references-write.ts). */
const TYPES_IMAGE_REFERENCE = new Set(["personnage", "decor", "prop", "vfx", "keyframe", "oth"]);

/** The asset creations of a proposal (without a prompt: it is written at the next step). Ticked by default, applied without review. */
export function brutsManquants(retenus: ManquantRetenu[], options: { sousGroupe?: string | null } = {}): ChangementBrut[] {
  return retenus.map((m) => ({
    groupe: "assets",
    cle: cleNouvelAsset(m.code),
    cibleType: "asset",
    cibleRef: null,
    libelle: `${m.code} · nouvel asset`,
    operation: "creer",
    sousGroupe: options.sousGroupe ?? null,
    apres: { type: m.type, suffixe: suffixeDeCode(m.code), description: m.description || m.raison || m.code, ...(m.parent ? { deriveDeCode: m.parent } : {}) },
    avertissements: m.raison ? [{ type: "info", texte: m.raison }] : [],
  }));
}

// --- 3-4. prompts and images ----------------------------------------------------------------------------------------------------------------------

/** The state of an asset whose image is expected by the clip. */
export type EtatImageAsset = {
  code: string;
  /** Displayable name (label, otherwise code). */
  nom: string;
  aFichier: boolean;
  aPrompt: boolean;
  /** A generation of this asset is waiting or running in the queue. */
  enFile: boolean;
  /** The error of its last failed generation SINCE the start of the request (null: none). */
  echec: string | null;
};

export type DecisionImages =
  | { action: "pret"; total: number }
  | { action: "echec"; erreur: string }
  | { action: "prompts"; codes: string[] }
  | { action: "attendre"; faites: number; total: number; aLancer: string[] };

/** The continuation of the prompts / images steps. Pure.
 * - everything has its file → ready (compilation);
 * - a generation failed since the start of the request → failure, naming the asset;
 * - assets without a file or a prompt (and without a generation in the queue) → their prompts first;
 * - otherwise we wait, launching those that have a prompt and no generation in the queue yet. */
export function deciderImages(etats: EtatImageAsset[]): DecisionImages {
  const total = etats.length;
  const manquent = etats.filter((e) => !e.aFichier);
  if (manquent.length === 0) return { action: "pret", total };
  const echoue = manquent.find((e) => e.echec && !e.enFile);
  if (echoue) return { action: "echec", erreur: `L'image de « ${echoue.nom} » a échoué : ${echoue.echec}. Relance sa génération depuis sa fiche d'asset, puis relance la fiche.` };
  const sansPrompt = manquent.filter((e) => !e.aPrompt && !e.enFile).map((e) => e.code);
  if (sansPrompt.length > 0) return { action: "prompts", codes: sansPrompt };
  return { action: "attendre", faites: total - manquent.length, total, aLancer: manquent.filter((e) => !e.enFile).map((e) => e.code) };
}

// --- step labels --------------------------------------------------------------------------------------------------------------------------

export const libelleAssets = (n: number) => (n > 0 ? `Création d'assets (${n})` : "Création d'assets");
export const libellePrompts = (n: number) => (n > 0 ? `Prompts d'assets (${n})` : "Prompts d'assets");
export const libelleImages = (faites: number, total: number) => (total > 0 ? `Images (${faites}/${total})` : "Images");
