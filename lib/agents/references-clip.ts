import { construireCode, libelleAsset, TYPES_ASSET } from "../assets/assetCode";
import { LIMITE_IMAGES_PLAN, type CandidatReference, type Doute, type ReferenceChoisie } from "../h3ir/references-clip";
import { correspondances } from "./similar-codes";
import { suffixeDeCode } from "./conversion";
import { ressemblant } from "./inventory";

/** Le petit skill `references-plan` (agents/skills/references-plan/) : appelé SEULEMENT quand la règle du code (lib/h3ir/references-clip.ts) a un doute,
 * il complète ou corrige la liste des références d'un plan et signale au plus deux assets manquants. Il ne réécrit jamais l'intent. Câblé par la
 * préparation d'un plan (lib/h3ir/preparation.ts) : sa sortie écrit les `plan_refs` et crée les manquants (worker/agents/postTraitement.ts). Ici : la forme
 * de l'entrée, la correction des codes mal recopiés et les contrôles qui renvoient le modèle (lib/llm/checks.ts). Pur, testé. */

export const SKILL_REFERENCES_PLAN = "references-plan";
/** Classer et citer : peu d'aléa (même réglage que notes-entretien et traduction-intent), passé à l'appel par worker/llm.ts. */
export const TEMPERATURE_REFERENCES_PLAN = 0.1;
export const MAX_MANQUANTS_PLAN = 2;
/** La description d'un candidat dans l'entrée, coupée : le skill doit reconnaître l'asset, pas le redessiner. */
export const MAX_DESCRIPTION_CANDIDAT = 160;
/** Types qu'un manquant peut avoir : pas de voix (champ du personnage), ni effet (un effet deviné reste de la prose, décision du 2026-11-02). */
export const TYPES_MANQUANT_PLAN = ["personnage", "decor", "prop", "keyframe", "oth"] as const;

export type EntreeSkillReferencesPlan = {
  plan: { intention: string; repliques: { nom: string }[]; dureeSecondes: number };
  scene: { titre: string; ambiance: string | null } | null;
  dejaChoisis: { code: string; pourquoi: string }[];
  /** Ce qui empêche le code de trancher seul : la raison de l'appel. */
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

/** L'entrée du skill à partir de ce que le code a lu et choisi. */
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

/** Les codes mal recopiés (un mot de liaison en trop ou en moins) rapprochés du seul code connu qui leur correspond : références et parents des manquants. */
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

/** Les défauts de la sortie (en anglais : ils sont renvoyés au modèle). Une sortie juste rend []. */
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
