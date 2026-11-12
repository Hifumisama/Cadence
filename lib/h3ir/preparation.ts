import { construireCode } from "../assets/assetCode";
import type { ChangementBrut } from "../agents/changes";
import { suffixeDeCode } from "../agents/conversion";
import { correspondances } from "../agents/similar-codes";
import { cleNouvelAsset } from "../agents/sheets";
import { MAX_MANQUANTS_PLAN, TYPES_MANQUANT_PLAN } from "../agents/references-clip";
import { LIMITE_IMAGES_PLAN } from "./references-clip";

/** PRÉPARER UN PLAN PUIS LE COMPILER (étape 5 d'Open H3 IR câblée, vague 4a, 2026-11-09). Open H3 IR est le seul producteur des prompts vidéo, y compris
 * pour un plan neuf : avant la compilation, chaque plan passe par
 *   1. RÉFÉRENCES : un plan qui a déjà des images de référence (inventaire, à la main) les garde (sauf `rechoisir`) ; sinon le CODE les choisit
 *      (lib/h3ir/references-clip.ts) et les écrit quand il n'a aucun doute ; en cas de doute SEULEMENT, une tâche LLM `references-plan` (une par plan)
 *      complète la liste et signale au plus deux assets manquants. Dans l'ordre du scénario : un plan attend que le plan d'avant ait fini cette étape
 *      (la reprise du décor lit ses références) ;
 *   2. ASSETS : les manquants (2 au plus) sont créés d'office, avec un code et un parent valides ;
 *   3. PROMPTS : les références sans image et sans prompt reçoivent leur prompt (`prompt-asset`, tâches LLM) ;
 *   4. IMAGES : leurs images partent dans la file (GPU), adoptées toutes seules ; la demande reste « en attente d'images » tant qu'une référence n'a pas
 *      de fichier. Une image en échec arrête la demande en nommant l'asset ;
 *   5. COMPILATION : traduction de l'intent puis compilateur Open H3 IR (tâche LLM `plan-h3ir`), fiche enregistrée sans relecture.
 * Chemin rapide : des références qui ont toutes leur image → compilation directe, sans appel de choix.
 * Aucun nouvel état de plan : « en attente d'images » se calcule depuis les références sans fichier ; un brouillon ne passe « en attente » qu'avec la fiche.
 *
 * Ici : les règles PURES (testées, preparation.test.ts). Les lectures et écritures : lib/h3ir/preparation-db.ts ; le pilote : lib/tasks/requests-db.ts. */

/** La proposition qui crée les assets manquants décidés par « Itérer » (lib/agents/service.ts, `creerAssetsManquants`). */
export const SKILL_ASSETS_MANQUANTS = "assets-manquants";

// --- 1. références -----------------------------------------------------------------------------------------------------------------------------

export type ObservationReferences = {
  /** Le nombre d'images de référence déjà posées sur le plan. */
  existantes: number;
  /** Rechoisir même si le plan a déjà des références (demande explicite). */
  rechoisir: boolean;
  /** Un plan PLUS TÔT dans l'ordre du scénario a une demande de fiche en cours qui n'a pas fini ses références. */
  precedentEnAttente: boolean;
  /** Le choix du code (null : pas encore calculé ou plan introuvable). */
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

/** Un plan attend-il un plan plus tôt dans le scénario ? `ordre` : celui du plan ; `autres` : les demandes de fiche EN COURS du même épisode. */
export function precedentEnAttente(ordre: number, autres: { ordre: number; referencesFinies: boolean }[]): boolean {
  return autres.some((a) => a.ordre < ordre && !a.referencesFinies);
}

// --- 2. assets manquants -----------------------------------------------------------------------------------------------------------------------

export type ManquantPropose = { code: string; type: string; parent?: string | null; description?: string; raison?: string };
export type ManquantRetenu = { code: string; type: string; parent: string | null; description: string; raison: string };

/** Les manquants qu'on crée vraiment : type permis (ni son, ni voix, ni effet), code reconstruit selon la convention du registre, pas déjà au registre (il
 * est alors rendu dans `existants` : c'est une référence, pas une création), sans doublon, `max` au plus ; le parent n'est gardé que s'il existe et a le
 * même type. `place` : les images encore libres sur le plan (6 au plus, références comprises). Pur. */
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

/** Ce qu'on fait de la sortie du skill `references-plan` : ses références (codes mal recopiés rapprochés, seulement des images du registre, sans doublon),
 * puis ses manquants retenus (`retenirManquants`, dans la place qui reste). Rejouée APRÈS la création des manquants, la même sortie rend leurs codes
 * comme des références (`existants`) : c'est ainsi que l'application écrit la liste complète. Pur. */
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

/** Les types d'asset qui peuvent être une image de référence (les mêmes que lib/h3ir/references-write.ts). */
const TYPES_IMAGE_REFERENCE = new Set(["personnage", "decor", "prop", "vfx", "keyframe", "oth"]);

/** Les créations d'assets d'une proposition (sans prompt : il s'écrit à l'étape suivante). Cochées d'office, appliquées sans relecture. */
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

// --- 3-4. prompts et images ----------------------------------------------------------------------------------------------------------------------

/** L'état d'un asset dont l'image est attendue par le plan. */
export type EtatImageAsset = {
  code: string;
  /** Nom affichable (libellé, sinon code). */
  nom: string;
  aFichier: boolean;
  aPrompt: boolean;
  /** Une génération de cet asset attend ou tourne dans la file. */
  enFile: boolean;
  /** L'erreur de sa dernière génération en échec DEPUIS le début de la demande (null : aucune). */
  echec: string | null;
};

export type DecisionImages =
  | { action: "pret"; total: number }
  | { action: "echec"; erreur: string }
  | { action: "prompts"; codes: string[] }
  | { action: "attendre"; faites: number; total: number; aLancer: string[] };

/** La suite des étapes prompts / images. Pur.
 * - tout a son fichier → prêt (compilation) ;
 * - une génération en échec depuis le début de la demande → échec, en nommant l'asset ;
 * - des assets sans fichier ni prompt (et sans génération en file) → leurs prompts d'abord ;
 * - sinon on attend, en lançant ceux qui ont un prompt et pas encore de génération en file. */
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

// --- libellés des étapes --------------------------------------------------------------------------------------------------------------------------

export const libelleAssets = (n: number) => (n > 0 ? `Création d'assets (${n})` : "Création d'assets");
export const libellePrompts = (n: number) => (n > 0 ? `Prompts d'assets (${n})` : "Prompts d'assets");
export const libelleImages = (faites: number, total: number) => (total > 0 ? `Images (${faites}/${total})` : "Images");
