import { and, eq } from "drizzle-orm";
import { assets, planPromptSections, planRefs } from "../db/schema";
import type { Db } from "./agents/applicateurs/commun";
import { ajouterReference, compacterImages, nomDepuisCode, retirerReference, type SectionsTexte, type TypeRef } from "./references";

/** Retrait / ajout d'une référence sur un plan DÉJÀ ÉCRIT, avec le prompt tenu à jour (règles pures dans
 * lib/references.ts). À appeler dans une transaction : slots, sections et lien tombent ensemble. */

async function lireSections(db: Db, planId: number): Promise<SectionsTexte> {
  const lignes = await db.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, planId));
  return Object.fromEntries(lignes.map((l) => [l.section, l.contenu]));
}

/** N'écrit que les sections dont le texte a changé, et seulement celles qui existent déjà (un brouillon sans fiche n'a pas de sections). */
async function ecrireSections(db: Db, planId: number, avant: SectionsTexte, apres: SectionsTexte): Promise<void> {
  for (const [section, contenu] of Object.entries(apres)) {
    if (!(section in avant) || contenu === avant[section]) continue;
    await db.update(planPromptSections).set({ contenu }).where(and(eq(planPromptSections.planId, planId), eq(planPromptSections.section, section)));
  }
}

/** Retire une référence : le lien, ses lignes dans `subject_definitions` / `retention_analysis`, ses mentions en
 * prose (elles reprennent le nom de l'asset), et les images restantes sont renumérotées 1..n. */
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

/** Une référence vient d'être posée sur `slot` : ses lignes de définition et de rétention rejoignent le prompt. */
export async function declarerRefDansLePrompt(db: Db, planId: number, type: TypeRef, slot: number, assetId: number): Promise<void> {
  const [a] = await db.select({ code: assets.code }).from(assets).where(eq(assets.id, assetId));
  const avant = await lireSections(db, planId);
  const apres = ajouterReference(avant, { type, slot, nom: nomDepuisCode(a?.code ?? "référence") });
  await ecrireSections(db, planId, avant, apres);
}
