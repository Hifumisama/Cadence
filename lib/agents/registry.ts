import { construireCode, slugifyCode } from "../assets/assetCode";
import { ressemblant } from "./inventory";
import type { BriefContenu } from "./types";

/** Étape 2 du pipeline : le REGISTRE d'assets à partir du brief. Pur (aucune lecture) : des
 * personnages et des lieux du brief aux « candidats » à créer ou à compléter, un par asset. Les voix
 * ne passent pas ici (elles se créent au casting vocal), ni les accessoires/effets/sons (ils se
 * déduisent des plans, étape 3). « L'histoire d'abord » : le scénario ne déclare aucun asset, le
 * brief seul fournit les masters. */

const PREFIXE_CLE_ASSET = "asset:";
export const cleSousTacheAsset = (code: string): string => `${PREFIXE_CLE_ASSET}${code}`;
export function codeDeCleAsset(cle: string | null | undefined): string | null {
  return cle && cle.startsWith(PREFIXE_CLE_ASSET) && cle.length > PREFIXE_CLE_ASSET.length ? cle.slice(PREFIXE_CLE_ASSET.length) : null;
}

type TypeMaster = "personnage" | "decor";

export type AssetExistant = {
  id: number;
  code: string;
  type: string;
  description: string | null;
  promptGeneration: string | null;
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

/** La description canonique d'un personnage : ce qu'on VOIT (âge, apparence, trait reconnaissable), jamais son rôle
 * ni sa voix (un asset d'image décrit par une voix donne une image au hasard). Un brief écrit avant ces champs
 * retombe sur « rôle : trait ». */
export function descriptionPersonnage(p: BriefContenu["personnages"][number]): string {
  const age = (p.age ?? "").trim();
  const apparence = (p.apparence ?? "").trim();
  const trait = (p.reconnaissable ?? "").trim();
  const tenue = descriptionTenue(p.tenue);
  if (apparence) {
    const tete = [age, apparence].filter(Boolean).map((s) => s.replace(/[.\s]+$/, "")).join(". ");
    return [trait ? `${tete}. ${trait}` : tete, tenue].filter(Boolean).join(". ");
  }
  const role = (p.role ?? "").trim();
  return [age, [role, trait].filter(Boolean).join(" : "), tenue].filter(Boolean).join(". ");
}

const net = (s: string | undefined): string => (s ?? "").trim().replace(/[.\s]+$/, "");

/** La tenue du brief (entretien enrichi, 2026-11-08) en une phrase de description canonique ; "" sans tenue. L'évolution (raccords) n'y est
 * pas : la fiche du personnage montre sa tenue de référence. */
function descriptionTenue(t: BriefContenu["personnages"][number]["tenue"]): string {
  if (!t) return "";
  const corps = [net(t.coupe), net(t.couleurs), net(t.matieres)].filter(Boolean).join(", ");
  const parties = [corps ? `Tenue : ${corps}` : "", net(t.accessoires) ? `accessoires : ${net(t.accessoires)}` : "", net(t.signeDistinctif) ? `signe distinctif : ${net(t.signeDistinctif)}` : ""];
  return parties.filter(Boolean).join(" ; ");
}

/** La description canonique d'un lieu : sa description, puis son aspect (lumière, matières, palette, ambiance) quand l'entretien l'a noté. */
function descriptionLieu(l: BriefContenu["lieux"][number]): string {
  const a = l.aspect;
  const aspect = a ? [net(a.lumiere), net(a.matieres), net(a.palette), net(a.ambiance)].filter(Boolean).join(", ") : "";
  if (!aspect) return l.description ?? "";
  return [net(l.description), aspect].filter(Boolean).join(". ");
}

/** L'entrée du brief dont un asset est tiré, telle quelle (avec ses sous-champs `tenue`, `aspect` et leur `statut`), pour `prompt-asset` :
 * la description canonique recopie la tenue et l'aspect, mais perd leur statut (« incertain », « déduit ») ; le skill le lit ici. Un personnage
 * ou un lieu : même code que celui que le registre construit depuis son nom (un état, `CHAR_x_agee`, n'est pas son sujet : rien). Un prop ou
 * un VFX : l'élément du brief de même nature dont le nom recouvre le code (« La lanterne de cuivre » ↔ `PROP_lanterne`), le code venant de
 * l'inventaire. Null sans correspondance. Pur. */
export type DetailsDuBrief =
  | { section: "personnages"; entree: BriefContenu["personnages"][number] }
  | { section: "lieux"; entree: BriefContenu["lieux"][number] }
  | { section: "elements"; entree: NonNullable<BriefContenu["elements"]>[number] };

export function detailsDuBrief(brief: Pick<BriefContenu, "personnages" | "lieux" | "elements"> | null | undefined, asset: { code: string; type: string }): DetailsDuBrief | null {
  if (!brief) return null;
  const memeCode = (type: string, nom: string | undefined) => !!slugifyCode(nom ?? "") && construireCode(type, nom ?? "") === asset.code;
  if (asset.type === "personnage") {
    const p = (brief.personnages ?? []).find((x) => memeCode("personnage", x.nom));
    return p ? { section: "personnages", entree: p } : null;
  }
  if (asset.type === "decor") {
    const l = (brief.lieux ?? []).find((x) => memeCode("decor", x.nom));
    return l ? { section: "lieux", entree: l } : null;
  }
  if (asset.type === "prop" || asset.type === "vfx") {
    const elements = (brief.elements ?? []).filter((e) => e.nature === asset.type && slugifyCode(e.nom ?? ""));
    const exact = elements.find((e) => memeCode(asset.type, e.nom));
    if (exact) return { section: "elements", entree: exact };
    const suffixe = asset.code.includes("_") ? asset.code.slice(asset.code.indexOf("_") + 1) : asset.code;
    const codes = elements.map((e) => ({ code: construireCode(asset.type, e.nom), type: asset.type, e }));
    const proche = ressemblant(asset.type, suffixe, codes);
    const e = proche ? codes.find((c) => c.code === proche)?.e : undefined;
    return e ? { section: "elements", entree: e } : null;
  }
  return null;
}

/** Le libellé « contexte utilisé » de l'entrée du brief lue par `prompt-asset` (avec le statut du détail quand il est encore à confirmer). */
export function libelleDetailsDuBrief(d: DetailsDuBrief): string {
  const nom = d.entree.nom?.trim() || "?";
  const [quoi, statut] =
    d.section === "personnages" ? ["tenue", d.entree.tenue?.statut] : d.section === "lieux" ? ["aspect", d.entree.aspect?.statut] : ["élément", d.entree.statut];
  const douteux = statut === "incertain" || statut === "deduit" ? ` (${statut === "incertain" ? "incertain" : "déduit"})` : "";
  return `Brief · ${nom} : ${quoi}${douteux}`;
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
  for (const l of brief.lieux ?? []) ajouter("decor", l.nom ?? "", descriptionLieu(l));
  return sortie;
}
