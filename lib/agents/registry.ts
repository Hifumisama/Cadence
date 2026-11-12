import { construireCode, slugifyCode } from "../assets/assetCode";
import { ressemblant } from "./inventory";
import type { BriefContenu } from "./types";

/** Step 2 of the pipeline: the asset REGISTRY from the brief. Pure (no reads): from the brief's
 * characters and places to the "candidates" to create or complete, one per asset. Voices
 * do not go through here (they are created in the voice casting), nor props/effects/sounds (they are
 * derived from the clips, step 3). "L'histoire d'abord": the screenplay declares no asset, the
 * brief alone provides the masters. */

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
  /** The batch subtask's key: "asset:CHAR_maya". */
  cle: string;
  code: string;
  type: TypeMaster;
  /** Code suffix (without type prefix), as the applier rebuilds it. */
  suffixe: string;
  nom: string;
  /** Canonical description in French, from the brief. */
  description: string;
  /** The asset already exists in the registry. */
  existantId: number | null;
  /** It already has a generation prompt. */
  aPrompt: boolean;
  /** It already has a canonical description (otherwise the brief's one completes it). */
  aDescription: boolean;
  /** Label of the selection line and of the subtask. */
  libelle: string;
  /** Ticked outright: create what is missing, write the absent prompts; does not touch what is already written. */
  aTraiter: boolean;
};

const LIBELLE_TYPE: Record<TypeMaster, string> = { personnage: "Personnage", decor: "Décor" };

/** A character's canonical description: what is SEEN (age, look, recognisable trait), never their role
 * nor their voice (an image asset described by a voice gives a random image). A brief written before these fields
 * falls back to "rôle : trait". */
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

/** The brief's costume (enriched interview, 2026-11-08) as one canonical description sentence; "" without a costume. The evolution (continuity) is not
 * in it: the character's sheet shows its reference costume. */
function descriptionTenue(t: BriefContenu["personnages"][number]["tenue"]): string {
  if (!t) return "";
  const corps = [net(t.coupe), net(t.couleurs), net(t.matieres)].filter(Boolean).join(", ");
  const parties = [corps ? `Tenue : ${corps}` : "", net(t.accessoires) ? `accessoires : ${net(t.accessoires)}` : "", net(t.signeDistinctif) ? `signe distinctif : ${net(t.signeDistinctif)}` : ""];
  return parties.filter(Boolean).join(" ; ");
}

/** A place's canonical description: its description, then its look (light, materials, palette, ambiance) when the interview noted it. */
function descriptionLieu(l: BriefContenu["lieux"][number]): string {
  const a = l.aspect;
  const aspect = a ? [net(a.lumiere), net(a.matieres), net(a.palette), net(a.ambiance)].filter(Boolean).join(", ") : "";
  if (!aspect) return l.description ?? "";
  return [net(l.description), aspect].filter(Boolean).join(". ");
}

/** The brief entry an asset is derived from, as is (with its `tenue`, `aspect` sub-fields and their `statut`), for `prompt-asset`:
 * the canonical description copies the costume and the look, but loses their status ("incertain", "déduit"); the skill reads it here. A character
 * or a place: same code as the one the registry builds from its name (a state, `CHAR_x_agee`, is not its subject: nothing). A prop or
 * a VFX: the brief element of the same nature whose name covers the code ("La lanterne de cuivre" ↔ `PROP_lanterne`), the code coming from
 * the inventory. Null without a match. Pure. */
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

/** The "contexte utilisé" label of the brief entry read by `prompt-asset` (with the detail's status when it is still to be confirmed). */
export function libelleDetailsDuBrief(d: DetailsDuBrief): string {
  const nom = d.entree.nom?.trim() || "?";
  const [quoi, statut] =
    d.section === "personnages" ? ["tenue", d.entree.tenue?.statut] : d.section === "lieux" ? ["aspect", d.entree.aspect?.statut] : ["élément", d.entree.statut];
  const douteux = statut === "incertain" || statut === "deduit" ? ` (${statut === "incertain" ? "incertain" : "déduit"})` : "";
  return `Brief · ${nom} : ${quoi}${douteux}`;
}

/** The registry candidates for a brief, in brief order (characters then places). A name
 * that would give a code already taken by a previous candidate is ignored (no duplicate). */
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
