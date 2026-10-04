import { and, eq } from "drizzle-orm";
import { assets, voixFiches } from "../../../db/schema";
import { construireCode, slugifyCode } from "../../assetCode";
import { TEXTE_REFERENCE_DEFAUT } from "../../voix";
import { apres, REFUS_SUPPRESSION, texte, type Applicateur, type Db } from "./commun";

/** Cible `voix` : CRÉER la voix d'un personnage (ou la voix off) à l'étape « casting des voix » : un asset
 * `VOICE_*` et sa fiche de casting, avec l'instruction de timbre écrite par `prompt-voix`. Seule la création
 * est prise en charge ; une voix s'édite au casting vocal, et le son se génère à part (ComfyUI). Un
 * personnage n'a qu'une voix (index unique de `voix_fiches`).
 * `apres` = { suffixe, personnageId (null : voix off), description?, instruction, refText? }. */

const REFUS_AUTRE_QUE_CREATION = "Seule la création d'une voix est prise en charge ici : modifie-la au casting vocal.";

/** Contrôles d'une création ; renvoie la raison d'un refus, ou le code retenu. */
async function verifierCreation(db: Db, projectId: number, a: Record<string, unknown>): Promise<{ erreur: string } | { code: string; personnageId: number | null }> {
  const suffixe = slugifyCode(texte(a.suffixe) ?? "");
  if (!suffixe) return { erreur: "Nom de voix manquant." };
  const code = construireCode("voix", suffixe);
  const [pris] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  if (pris) return { erreur: `Le code ${code} existe déjà dans ce projet.` };
  if (!(texte(a.instruction) ?? "").trim()) return { erreur: "L'instruction de la voix est vide." };

  const personnageId = typeof a.personnageId === "number" ? a.personnageId : null;
  if (personnageId != null) {
    const [perso] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, personnageId), eq(assets.projectId, projectId), eq(assets.type, "personnage")));
    if (!perso) return { erreur: "Le personnage de cette voix n'existe plus dans ce projet." };
    const [autre] = await db.select({ assetId: voixFiches.assetId }).from(voixFiches).where(eq(voixFiches.personnageId, personnageId));
    if (autre) return { erreur: "Ce personnage a déjà une voix : un personnage n'en a qu'une." };
  }
  return { code, personnageId };
}

export const applicateurVoix: Applicateur = {
  cibleType: "voix",

  async cible(_db, _ctx, ch) {
    return ch.operation === "creer" ? { type: "voix", operation: "creer" } : REFUS_AUTRE_QUE_CREATION;
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation !== "creer") return { ...ch, refuseRaison: REFUS_AUTRE_QUE_CREATION };
    const v = await verifierCreation(db, ctx.projectId, apres(ch));
    if ("erreur" in v) return { ...ch, refuseRaison: v.erreur };
    return { ...ch, libelle: ch.libelle || `Voix · ${v.code}`, apres: { ...apres(ch), code: v.code } };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation !== "creer") return REFUS_AUTRE_QUE_CREATION;
    const v = await verifierCreation(tx, ctx.projectId, apres(ch));
    return "erreur" in v ? v.erreur : null;
  },

  async appliquer(tx, ctx, ch) {
    const a = apres(ch);
    const v = await verifierCreation(tx, ctx.projectId, a);
    if ("erreur" in v) throw new Error(v.erreur);
    const [cree] = await tx
      .insert(assets)
      .values({
        projectId: ctx.projectId,
        code: v.code,
        type: "voix",
        description: (texte(a.description) ?? "").trim() || null,
        promptGeneration: (texte(a.instruction) ?? "").trim(),
        critique: false,
      })
      .returning({ id: assets.id });
    // Le texte de référence est celui du projet (le même pour toutes les voix) : la fiche naît prête à générer.
    await tx.insert(voixFiches).values({ assetId: cree!.id, personnageId: v.personnageId, refText: (texte(a.refText) ?? "").trim() || TEXTE_REFERENCE_DEFAUT });
  },
};
