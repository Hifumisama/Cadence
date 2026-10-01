import { construireCode, slugifyCode } from "../assetCode";
import type { BriefContenu } from "./types";

/** Étape 2 du pipeline : le REGISTRE d'assets à partir du brief. Pur (aucune lecture) : des
 * personnages et des lieux du brief aux « candidats » à créer ou à compléter, un par asset. Les voix
 * ne passent pas ici (elles se créent au casting vocal), ni les accessoires/effets/sons (ils se
 * déduisent des plans, étape 3). « L'histoire d'abord » : le scénario ne déclare aucun asset, le
 * brief seul fournit les masters. */

export const PREFIXE_CLE_ASSET = "asset:";
export const cleSousTacheAsset = (code: string): string => `${PREFIXE_CLE_ASSET}${code}`;
export function codeDeCleAsset(cle: string | null | undefined): string | null {
  return cle && cle.startsWith(PREFIXE_CLE_ASSET) && cle.length > PREFIXE_CLE_ASSET.length ? cle.slice(PREFIXE_CLE_ASSET.length) : null;
}
/** Groupe de revue d'un asset (le lot de scénarios en a un par épisode ; ici tous les assets
 * restent dans le groupe commun « Assets », une ligne cochable chacun). */
export const GROUPE_ASSETS = "assets";

export type TypeMaster = "personnage" | "decor";

export type AssetExistant = {
  id: number;
  code: string;
  type: string;
  description: string | null;
  promptGeneration: string | null;
  statut: string;
};

export type CandidatRegistre = {
  /** Clé de la sous-tâche du lot : « asset:CHAR_maya ». */
  cle: string;
  code: string;
  type: TypeMaster;
  /** Suffixe du code (sans préfixe de type), tel que l'applicateur le reconstruit. */
  suffixe: string;
  nom: string;
  /** Description canonique en français, issue du brief. */
  description: string;
  /** L'asset existe déjà dans le registre. */
  existantId: number | null;
  /** Il a déjà un prompt de génération. */
  aPrompt: boolean;
  /** Il a déjà une description canonique (sinon celle du brief la complète). */
  aDescription: boolean;
  /** Libellé de la ligne de sélection et de la sous-tâche. */
  libelle: string;
  /** Coché d'office : créer ce qui manque, écrire les prompts absents ; ne touche pas à ce qui est déjà écrit. */
  aTraiter: boolean;
};

const LIBELLE_TYPE: Record<TypeMaster, string> = { personnage: "Personnage", decor: "Décor" };

function descriptionPersonnage(p: BriefContenu["personnages"][number]): string {
  const role = (p.role ?? "").trim();
  const trait = (p.reconnaissable ?? "").trim();
  return [role, trait].filter(Boolean).join(" : ");
}

/** Les candidats du registre pour un brief, dans l'ordre du brief (personnages puis lieux). Un nom
 * qui donnerait un code déjà pris par un candidat précédent est ignoré (pas de doublon). */
export function candidatsRegistre(brief: Pick<BriefContenu, "personnages" | "lieux">, existants: AssetExistant[]): CandidatRegistre[] {
  const parCode = new Map(existants.map((a) => [a.code, a]));
  const vus = new Set<string>();
  const sortie: CandidatRegistre[] = [];
  const ajouter = (type: TypeMaster, nom: string, description: string) => {
    const suffixe = slugifyCode(nom);
    if (!suffixe) return;
    const code = construireCode(type, suffixe);
    if (vus.has(code)) return;
    vus.add(code);
    const existant = parCode.get(code) ?? null;
    const aPrompt = !!existant?.promptGeneration?.trim();
    sortie.push({
      cle: cleSousTacheAsset(code),
      code,
      type,
      suffixe,
      nom: nom.trim(),
      description: description.trim(),
      existantId: existant?.id ?? null,
      aPrompt,
      aDescription: !!existant?.description?.trim(),
      libelle: `${LIBELLE_TYPE[type]} · ${nom.trim()}`,
      aTraiter: !existant || !aPrompt,
    });
  };
  for (const p of brief.personnages ?? []) ajouter("personnage", p.nom ?? "", descriptionPersonnage(p));
  for (const l of brief.lieux ?? []) ajouter("decor", l.nom ?? "", l.description ?? "");
  return sortie;
}

/** Résumé d'une sélection, pour l'interface et les messages. */
export function resumeCandidats(candidats: CandidatRegistre[], choisis: Set<string>): { total: number; choisis: number; nouveaux: number; existants: number; ecrases: number } {
  const c = candidats.filter((x) => choisis.has(x.code));
  return {
    total: candidats.length,
    choisis: c.length,
    nouveaux: c.filter((x) => x.existantId == null).length,
    existants: c.filter((x) => x.existantId != null).length,
    ecrases: c.filter((x) => x.existantId != null && x.aPrompt).length,
  };
}
