import { construireCode, libelleAsset, TYPES_ASSET } from "../assets/assetCode";
import { LIMITE_IMAGES_PLAN, type CandidatReference, type Doute, type ReferenceChoisie } from "../h3ir/references-clip";
import { correspondances } from "./similar-codes";
import { suffixeDeCode } from "./conversion";
import { ressemblant } from "./inventory";

/** The small `references-plan` skill (agents/skills/references-plan/): called ONLY when the code's rule (lib/h3ir/references-clip.ts) has a doubt,
 * it completes or corrects a clip's reference list and flags at most two missing assets. It never rewrites the intent. Wired by the
 * clip's preparation (lib/h3ir/preparation.ts): its output writes the `plan_refs` and creates the missing assets (worker/agents/postProcessing.ts). Here: the shape
 * of the input, the correction of mis-copied codes and the checks that send the model back (lib/llm/checks.ts). Pure, tested. */

export const SKILL_REFERENCES_PLAN = "references-plan";
/** Classify and cite: little randomness (same setting as notes-entretien and traduction-intent), passed at call time by worker/llm.ts. */
export const TEMPERATURE_REFERENCES_PLAN = 0.1;
export const MAX_MANQUANTS_PLAN = 2;
/** A candidate's description in the input, cut: the skill must recognise the asset, not redraw it. */
export const MAX_DESCRIPTION_CANDIDAT = 160;
/** Types a missing asset may have: no voice (a character field), nor effect (a guessed effect stays prose, decision of 2026-11-02). */
export const TYPES_MANQUANT_PLAN = ["personnage", "decor", "prop", "keyframe", "oth"] as const;

export type EntreeSkillReferencesPlan = {
  plan: { intention: string; repliques: { nom: string }[]; dureeSecondes: number };
  scene: { titre: string; ambiance: string | null } | null;
  dejaChoisis: { code: string; pourquoi: string }[];
  /** What prevents the code from deciding alone: the reason for the call. */
  doutes: Doute[];
  decorPrecedent: string | null;
  candidats: { code: string; type: string; nom: string; description: string; parent: string | null; aUneImage: boolean }[];
  assetsProposesParLeLot: { code: string; type: string }[];
  limiteImages: number;
};

export type SortieReferencesPlan = {
  references: { code: string; pourquoi: string }[];
  manquants: { code: string; type: string; parent: string | null; description: string; raison: string }[];
  notes: string;
};

const couper = (t: string, max: number): string => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};

/** The skill input built from what the code read and chose. */
export function construireEntreeReferencesPlan(d: {
  narration: string;
  locuteurs: string[];
  dureeSecondes: number;
  scene: { titre: string; ambiance: string | null } | null;
  references: ReferenceChoisie[];
  doutes: Doute[];
  decorPrecedent: string | null;
  candidats: CandidatReference[];
  assetsProposesParLeLot?: { code: string; type: string }[];
}): EntreeSkillReferencesPlan {
  return {
    plan: { intention: d.narration, repliques: d.locuteurs.map((nom) => ({ nom })), dureeSecondes: d.dureeSecondes },
    scene: d.scene,
    dejaChoisis: d.references.map((r) => ({ code: r.code, pourquoi: r.pourquoi })),
    doutes: d.doutes,
    decorPrecedent: d.decorPrecedent,
    candidats: d.candidats
      .map((c) => ({ code: c.code, type: c.type, nom: libelleAsset(c), description: couper(c.description ?? "", MAX_DESCRIPTION_CANDIDAT), parent: c.parent ?? null, aUneImage: !!c.aUneImage })),
    assetsProposesParLeLot: d.assetsProposesParLeLot ?? [],
    limiteImages: LIMITE_IMAGES_PLAN,
  };
}

/** Mis-copied codes (one linking word too many or too few) matched to the only known code that corresponds to them: references and parents of the missing assets. */
export function corrigerCodesReferencesPlan(sortie: SortieReferencesPlan, connus: string[]): { sortie: SortieReferencesPlan; corrections: { de: string; vers: string }[] } {
  const cites = [...(sortie.references ?? []).map((r) => r.code), ...(sortie.manquants ?? []).flatMap((m) => (m.parent ? [m.parent] : []))];
  const map = correspondances(cites, connus);
  if (map.size === 0) return { sortie, corrections: [] };
  return {
    sortie: {
      ...sortie,
      references: (sortie.references ?? []).map((r) => (map.has(r.code) ? { ...r, code: map.get(r.code)! } : r)),
      manquants: (sortie.manquants ?? []).map((m) => (m.parent && map.has(m.parent) ? { ...m, parent: map.get(m.parent)! } : m)),
    },
    corrections: [...map].map(([de, vers]) => ({ de, vers })),
  };
}

/** The output's defects (in English: they are sent back to the model). A correct output returns []. */
export function problemesReferencesPlan(sortie: SortieReferencesPlan, entree: EntreeSkillReferencesPlan): string[] {
  const p: string[] = [];
  const connus = new Map<string, { type: string; parent: string | null }>([
    ...entree.candidats.map((c) => [c.code, { type: c.type, parent: c.parent }] as [string, { type: string; parent: string | null }]),
    ...entree.assetsProposesParLeLot.map((a) => [a.code, { type: a.type, parent: null }] as [string, { type: string; parent: string | null }]),
  ]);
  const refs = sortie.references ?? [];
  const manquants = sortie.manquants ?? [];
  const limite = entree.limiteImages || LIMITE_IMAGES_PLAN;

  const vus = new Set<string>();
  const visages = new Map<string, string>();
  for (const r of refs) {
    const c = connus.get(r.code);
    if (!c) {
      p.push(`references: ${r.code} is not a candidate code; copy a code from \`candidats\` or \`assetsProposesParLeLot\` exactly, or declare a missing asset in \`manquants\`.`);
      continue;
    }
    if (vus.has(r.code)) p.push(`references: ${r.code} appears twice; list each asset once.`);
    vus.add(r.code);
    if (c.type === "personnage") {
      const famille = c.parent ?? r.code;
      const deja = visages.get(famille);
      if (deja) p.push(`references: ${deja} and ${r.code} are the same character; keep only ONE face reference per character.`);
      else visages.set(famille, r.code);
    }
  }
  if (refs.length > limite) p.push(`references: ${refs.length} images, ${limite} at most; drop what the text can describe alone.`);
  if (manquants.length > MAX_MANQUANTS_PLAN) p.push(`manquants: ${manquants.length} missing assets, ${MAX_MANQUANTS_PLAN} at most; keep the two the plan cannot do without.`);
  if (refs.length + manquants.length > limite) p.push(`references + manquants: ${refs.length + manquants.length} images, ${limite} at most (each missing asset will take an image slot).`);

  const registre = [...connus].map(([code, v]) => ({ code, type: v.type }));
  const codesManquants = new Set<string>();
  for (const m of manquants) {
    if (!(TYPES_MANQUANT_PLAN as readonly string[]).includes(m.type)) {
      p.push(`manquants: ${m.code} has type « ${m.type} »; a missing asset is one of ${TYPES_MANQUANT_PLAN.join(", ")} (never a sound, a voice or an effect).`);
      continue;
    }
    const suffixe = suffixeDeCode(m.code);
    const attendu = (TYPES_ASSET as readonly string[]).includes(m.type) && suffixe ? construireCode(m.type, suffixe) : null;
    if (!attendu || attendu !== m.code) p.push(`manquants: the code of a ${m.type} is written ${attendu ?? "PREFIX_name"} (prefix of its type, then lowercase words joined by _), not ${m.code}.`);
    if (connus.has(m.code)) {
      p.push(`manquants: ${m.code} already exists; put it in \`references\` instead.`);
      continue;
    }
    if (codesManquants.has(m.code)) p.push(`manquants: ${m.code} appears twice.`);
    codesManquants.add(m.code);
    const proche = ressemblant(m.type, suffixe, registre);
    if (proche) p.push(`manquants: ${m.code} looks like ${proche}, which exists; use ${proche} in \`references\` unless the image must really differ (then give it another, distinct name).`);
    if (m.parent) {
      const parent = connus.get(m.parent);
      if (!parent) p.push(`manquants: the parent ${m.parent} of ${m.code} is not a candidate code; use an existing code or null.`);
      else if (parent.type !== m.type) p.push(`manquants: the parent ${m.parent} of ${m.code} is a ${parent.type}; a state has the same type as its base subject (or parent null).`);
    }
    if (!m.description?.trim()) p.push(`manquants: ${m.code} has no description.`);
  }
  return p;
}
