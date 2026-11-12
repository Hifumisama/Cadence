import { and, asc, eq, inArray } from "drizzle-orm";
import { assets, planRefs, plans } from "../../db/schema";
import type { Db } from "../agents/applicateurs/commun";
import { declarerRefDansLePrompt, retirerRefDuPlan, roleDeLaRef } from "../plan-references";
import { MAX_REFS } from "../plan-checks";

/** Écrit les IMAGES de référence d'un plan (`plan_refs`, type `picture`, emplacements 1..n dans l'ordre donné), choisies avant la fiche (inventaire
 * des assets, 2026-11-09) ou plus tard (petit skill `references-plan`). Ce n'est PAS l'écriture d'une fiche (lib/agents/applicateurs/fiche.ts) :
 * - le statut du plan ne bouge pas (un brouillon reste brouillon : la fiche, elle, le passe « en attente ») ; la table `plans` n'est jamais écrite ;
 * - les références déjà posées (à la main, ou par une fiche) ne sont jamais écrasées : rien n'est écrit si le plan a déjà une image de référence,
 *   sauf `remplacer: true` (les anciennes sont alors retirées proprement, prompt compris) ; les sons et vidéos du plan ne sont pas touchés ;
 * - rôle et rétention par défaut, comme une référence posée à la main (`roleDeLaRef` : « Type, Nom ») ; un effet (VFX) est en rétention faible
 *   (`weak_reference` : sa matière et son mouvement, jamais montré tel quel ; rôle `style` côté Open H3 IR) ;
 * - si le plan a déjà une fiche, chaque référence y est déclarée (`subject_definitions`, `retention_analysis`), comme un ajout à la main.
 * Les codes inconnus du projet, les doublons et ce qui dépasse 6 images sont ignorés, et rendus dans `ignores`.
 * À appeler dans une transaction (tout tombe ensemble). La décision est pure (`planifierReferences`, testée). */

export type ReferenceAEcrire = string | { code: string; role?: string | null };
type RaisonSansEcriture = "plan-introuvable" | "deja-des-references" | "aucune-reference";
export type ResultatEcritureReferences = { ok: true; ecrites: number; ignores: string[] } | { ok: false; raison: RaisonSansEcriture; ignores: string[] };

/** Les types d'asset qui peuvent être une image de référence. */
const TYPES_IMAGE = new Set(["personnage", "decor", "prop", "vfx", "keyframe", "oth"]);
export const RETENTION_VFX = "weak_reference";

type LigneReference = { assetId: number; slot: number; role: string | null; retention: string | null };
export type PlanReferences =
  | { ok: true; lignes: LigneReference[]; ignores: string[]; retirerExistantes: boolean }
  | { ok: false; raison: RaisonSansEcriture; ignores: string[] };

/** Ce qu'il faut écrire : les références voulues (dans l'ordre), les assets du projet par code, le nombre d'images déjà posées sur le plan. Pur. */
export function planifierReferences(
  voulues: ReferenceAEcrire[],
  assetsParCode: Map<string, { id: number; type: string }>,
  nbImagesExistantes: number,
  options: { remplacer?: boolean } = {},
): PlanReferences {
  const liste = voulues.map((r) => (typeof r === "string" ? { code: r.trim(), role: null } : { code: (r.code ?? "").trim(), role: r.role?.trim() || null })).filter((r) => r.code);
  const ignores: string[] = [];
  const lignes: LigneReference[] = [];
  for (const r of liste) {
    const a = assetsParCode.get(r.code);
    if (!a || !TYPES_IMAGE.has(a.type) || lignes.some((x) => x.assetId === a.id) || lignes.length >= MAX_REFS.picture) {
      ignores.push(r.code);
      continue;
    }
    lignes.push({ assetId: a.id, slot: lignes.length + 1, role: r.role, retention: a.type === "vfx" ? RETENTION_VFX : null });
  }
  if (lignes.length === 0) return { ok: false, raison: "aucune-reference", ignores };
  if (nbImagesExistantes > 0 && !options.remplacer) return { ok: false, raison: "deja-des-references", ignores };
  return { ok: true, lignes, ignores, retirerExistantes: nbImagesExistantes > 0 };
}

export async function ecrireReferencesPlan(db: Db, planId: number, references: ReferenceAEcrire[], options: { remplacer?: boolean } = {}): Promise<ResultatEcritureReferences> {
  const [plan] = await db.select({ id: plans.id, projectId: plans.projectId }).from(plans).where(eq(plans.id, planId));
  if (!plan) return { ok: false, raison: "plan-introuvable", ignores: [] };
  const codes = [...new Set(references.map((r) => (typeof r === "string" ? r : r.code)?.trim()).filter((c): c is string => !!c))];
  const lus = codes.length
    ? await db.select({ id: assets.id, code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, plan.projectId), inArray(assets.code, codes)))
    : [];
  const existantes = await db.select({ id: planRefs.id }).from(planRefs).where(and(eq(planRefs.planId, planId), eq(planRefs.type, "picture"))).orderBy(asc(planRefs.slot));
  const p = planifierReferences(references, new Map(lus.map((a) => [a.code, a])), existantes.length, options);
  if (!p.ok) return p;
  // Du dernier au premier : chaque retrait renumérote les suivantes et met le prompt à jour.
  if (p.retirerExistantes) for (const e of [...existantes].reverse()) await retirerRefDuPlan(db, e.id);
  for (const l of p.lignes) {
    const defaut = await roleDeLaRef(db, "picture", l.assetId);
    await db.insert(planRefs).values({ planId, type: "picture", slot: l.slot, assetId: l.assetId, role: l.role ?? defaut.role, retention: l.retention ?? defaut.retention });
    await declarerRefDansLePrompt(db, planId, "picture", l.slot, l.assetId);
  }
  return { ok: true, ecrites: p.lignes.length, ignores: p.ignores };
}
