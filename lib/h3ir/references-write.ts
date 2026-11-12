import { and, asc, eq, inArray } from "drizzle-orm";
import { assets, planRefs, plans } from "../../db/schema";
import type { Db } from "../agents/appliers/common";
import { declarerRefDansLePrompt, retirerRefDuPlan, roleDeLaRef } from "../clips/clip-references";
import { MAX_REFS } from "../clips/clip-checks";

/** Writes a clip's reference IMAGES (`plan_refs`, type `picture`, slots 1..n in the given order), chosen before the sheet (asset inventory,
 * 2026-11-09) or later (small `references-plan` skill). This is NOT the writing of a sheet (lib/agents/appliers/sheet.ts):
 * - the clip's status does not move (a draft stays a draft: the sheet, for its part, moves it to « en attente »); the `plans` table is never written;
 * - the references already set (by hand, or by a sheet) are never overwritten: nothing is written if the clip already has a reference image,
 *   unless `remplacer: true` (the old ones are then cleanly removed, prompt included); the clip's sounds and videos are not touched;
 * - role and retention by default, like a reference set by hand (`roleDeLaRef`: « Type, Nom »); an effect (VFX) is at weak retention
 *   (`weak_reference`: its matter and movement, never shown as is; role `style` on the Open H3 IR side);
 * - if the clip already has a sheet, each reference is declared there (`subject_definitions`, `retention_analysis`), like a manual addition.
 * Unknown codes of the project, duplicates and whatever exceeds 6 images are ignored, and returned in `ignores`.
 * To be called in a transaction (everything falls together). The decision is pure (`planifierReferences`, tested). */

export type ReferenceAEcrire = string | { code: string; role?: string | null };
type RaisonSansEcriture = "plan-introuvable" | "deja-des-references" | "aucune-reference";
export type ResultatEcritureReferences = { ok: true; ecrites: number; ignores: string[] } | { ok: false; raison: RaisonSansEcriture; ignores: string[] };

/** The asset types that can be a reference image. */
const TYPES_IMAGE = new Set(["personnage", "decor", "prop", "vfx", "keyframe", "oth"]);
export const RETENTION_VFX = "weak_reference";

type LigneReference = { assetId: number; slot: number; role: string | null; retention: string | null };
export type PlanReferences =
  | { ok: true; lignes: LigneReference[]; ignores: string[]; retirerExistantes: boolean }
  | { ok: false; raison: RaisonSansEcriture; ignores: string[] };

/** What must be written: the wanted references (in order), the project's assets by code, the number of images already set on the clip. Pure. */
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
  // From last to first: each removal renumbers the following ones and updates the prompt.
  if (p.retirerExistantes) for (const e of [...existantes].reverse()) await retirerRefDuPlan(db, e.id);
  for (const l of p.lignes) {
    const defaut = await roleDeLaRef(db, "picture", l.assetId);
    await db.insert(planRefs).values({ planId, type: "picture", slot: l.slot, assetId: l.assetId, role: l.role ?? defaut.role, retention: l.retention ?? defaut.retention });
    await declarerRefDansLePrompt(db, planId, "picture", l.slot, l.assetId);
  }
  return { ok: true, ecrites: p.lignes.length, ignores: p.ignores };
}
