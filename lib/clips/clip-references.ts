import { and, eq } from "drizzle-orm";
import { assets, planPromptSections, planRefs } from "../../db/schema";
import type { Db } from "../agents/appliers/common";
import { libelleAsset } from "../assets/assetCode";
import { LIBELLE_TYPE_ASSET } from "../assets/registry-types";
import { ajouterReference, compacterImages, nomDepuisCode, retirerReference, roleParDefaut, type SectionsTexte, type TypeRef } from "./references";

/** Removing / adding a reference on an ALREADY WRITTEN clip, with the prompt kept up to date (pure rules in
 * lib/clips/references.ts). To be called in a transaction: slots, sections and link fall together. */

async function lireSections(db: Db, planId: number): Promise<SectionsTexte> {
  const lignes = await db.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, planId));
  return Object.fromEntries(lignes.map((l) => [l.section, l.contenu]));
}

/** Only writes the sections whose text has changed, and only those that already exist (a draft without a sheet has no sections). */
async function ecrireSections(db: Db, planId: number, avant: SectionsTexte, apres: SectionsTexte): Promise<void> {
  for (const [section, contenu] of Object.entries(apres)) {
    if (!(section in avant) || contenu === avant[section]) continue;
    await db.update(planPromptSections).set({ contenu }).where(and(eq(planPromptSections.planId, planId), eq(planPromptSections.section, section)));
  }
}

/** Removes a reference: the link, its lines in `subject_definitions` / `retention_analysis`, its mentions in
 * prose (they take back the asset's name), and the remaining images are renumbered 1..n. */
export async function retirerRefDuPlan(db: Db, refId: number): Promise<void> {
  const [ref] = await db
    .select({ planId: planRefs.planId, type: planRefs.type, slot: planRefs.slot, code: assets.code })
    .from(planRefs)
    .leftJoin(assets, eq(planRefs.assetId, assets.id))
    .where(eq(planRefs.id, refId));
  if (!ref) return;
  const toutes = await db.select({ id: planRefs.id, type: planRefs.type, slot: planRefs.slot }).from(planRefs).where(eq(planRefs.planId, ref.planId));
  const images = toutes.filter((r) => r.type === "picture" && r.id !== refId);
  const renum = ref.type === "picture" ? compacterImages(images.map((r) => r.slot)) : new Map<number, number>();

  const avant = await lireSections(db, ref.planId);
  const apres = retirerReference(avant, { type: ref.type as TypeRef, slot: ref.slot, nom: nomDepuisCode(ref.code ?? "cette référence") }, renum);

  await db.delete(planRefs).where(eq(planRefs.id, refId));
  for (const r of images) {
    const nouveau = renum.get(r.slot);
    if (nouveau != null && nouveau !== r.slot) await db.update(planRefs).set({ slot: nouveau }).where(eq(planRefs.id, r.id));
  }
  await ecrireSections(db, ref.planId, avant, apres);
}

/** A reference has just been placed on `slot`: its definition and retention lines join the prompt, and the mentions of its name left by
 * a removal become its label again (lib/clips/references.ts, `retablirCitations`). */
export async function declarerRefDansLePrompt(db: Db, planId: number, type: TypeRef, slot: number, assetId: number): Promise<void> {
  const [a] = await db.select({ code: assets.code }).from(assets).where(eq(assets.id, assetId));
  const avant = await lireSections(db, planId);
  const apres = ajouterReference(avant, { type, slot, nom: nomDepuisCode(a?.code ?? "référence"), vfx: a?.code?.startsWith("VFX_") }, { retablir: true });
  await ecrireSections(db, planId, avant, apres);
}

/** The role and retention of a reference placed by hand (`plan_refs.role` / `retention`): those the sheet would have written by default. The precise role from before a
 * removal is not kept (it would need one more column or table): we start again from this default. */
export async function roleDeLaRef(db: Db, type: TypeRef, assetId: number): Promise<{ role: string; retention: string | null }> {
  const [a] = await db.select({ code: assets.code, label: assets.label, type: assets.type }).from(assets).where(eq(assets.id, assetId));
  if (!a) return roleParDefaut(type, { typeAsset: null, libelleType: null, libelle: "référence" });
  return roleParDefaut(type, { typeAsset: a.type, libelleType: LIBELLE_TYPE_ASSET[a.type] ?? null, libelle: libelleAsset(a) });
}
