import { and, eq } from "drizzle-orm";
import { assets } from "../../../db/schema";
import { TYPES_ASSET, construireCode, estMethodeAsset, methodeApplicable, slugifyCode } from "../../assetCode";
import type { ChangementBrut } from "../changements";
import { apres, entierRef, REFUS_SUPPRESSION, texte, type Applicateur, type Db } from "./commun";

/** Cible `asset` : créer (code construit depuis le type et un suffixe, jamais saisi en entier,
 * unique dans le projet, jamais une voix : elle se crée au casting) ou modifier la description,
 * le prompt de génération, la méthode, la durée d'un son.
 * `apres` (création) = { type, suffixe, description?, promptGeneration?, methodeGeneration?,
 * deriveDeCode?, dureeSecondes?, critique? } ; (modification) = les seuls champs changés. */

const CHAMPS_MODIFIABLES = ["description", "promptGeneration", "methodeGeneration", "dureeSecondes"] as const;

async function parCode(db: Db, projectId: number, code: string) {
  const [a] = await db.select().from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  return a ?? null;
}

/** Contrôles d'une création ; renvoie la raison d'un refus, ou le code retenu. */
async function verifierCreation(db: Db, projectId: number, a: Record<string, unknown>): Promise<{ erreur: string } | { code: string; deriveDeId: number | null }> {
  const type = texte(a.type);
  if (!type || !(TYPES_ASSET as readonly string[]).includes(type)) return { erreur: `Type d'asset inconnu : « ${type ?? ""} ».` };
  if (type === "voix") return { erreur: "Une voix se crée au casting vocal, pas par une proposition." };
  const suffixe = slugifyCode(texte(a.suffixe) ?? "");
  if (!suffixe) return { erreur: "Nom d'asset manquant." };
  const code = construireCode(type, suffixe);
  if (await parCode(db, projectId, code)) return { erreur: `Le code ${code} existe déjà dans ce projet.` };
  let deriveDeId: number | null = null;
  const parent = texte(a.deriveDeCode);
  if (parent) {
    const p = await parCode(db, projectId, parent);
    if (!p) return { erreur: `Le parent ${parent} n'existe pas dans ce projet.` };
    deriveDeId = p.id;
  }
  const methode = texte(a.methodeGeneration);
  if (methode) {
    if (!estMethodeAsset(methode)) return { erreur: `Méthode inconnue : « ${methode} ».` };
    if (methode === "edition" && deriveDeId == null) return { erreur: "Une édition exige un parent." };
  }
  if (type === "sfx" && a.dureeSecondes != null && !(typeof a.dureeSecondes === "number" && a.dureeSecondes >= 1 && a.dureeSecondes <= 60)) {
    return { erreur: "Durée du son hors limites (1 à 60 s)." };
  }
  return { code, deriveDeId };
}

export const applicateurAsset: Applicateur = {
  cibleType: "asset",

  async cible(db, ctx, ch) {
    if (ch.operation === "creer") return { type: "asset", operation: "creer" };
    const id = entierRef(ch.cibleRef);
    if (id == null) return "Asset introuvable.";
    const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, id), eq(assets.projectId, ctx.projectId)));
    return a ? { type: "asset", operation: ch.operation, assetId: a.id } : "Asset introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    const a = apres(ch);
    if (ch.operation === "creer") {
      const v = await verifierCreation(db, ctx.projectId, a);
      if ("erreur" in v) return { ...ch, refuseRaison: v.erreur };
      return { ...ch, libelle: ch.libelle || `Asset · ${v.code}`, apres: { ...a, code: v.code } };
    }
    const id = entierRef(ch.cibleRef);
    const [courant] = id == null ? [] : await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.projectId, ctx.projectId)));
    if (!courant) return { ...ch, refuseRaison: "Asset introuvable dans ce projet." };
    const sortie: ChangementBrut = { ...ch };
    const avant: Record<string, unknown> = {};
    const garde: Record<string, unknown> = {};
    for (const champ of CHAMPS_MODIFIABLES) {
      if (a[champ] === undefined) continue;
      if (champ === "methodeGeneration" && !methodeApplicable(courant.type)) continue;
      avant[champ] = courant[champ] ?? null;
      garde[champ] = a[champ];
    }
    sortie.avant = avant;
    sortie.apres = garde;
    if (courant.statut === "valide") {
      sortie.ecrase = `${courant.code} est validé : son texte sera remplacé${courant.fichier ? " (l'image existante ne sera pas régénérée)" : ""}.`;
      sortie.avertissements = [...(ch.avertissements ?? []), { type: "ecrase_valide", texte: "Remplace le texte d'un asset validé." }];
    }
    return sortie;
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation === "supprimer") return REFUS_SUPPRESSION;
    if (ch.operation === "creer") {
      const v = await verifierCreation(tx, ctx.projectId, apres(ch));
      return "erreur" in v ? v.erreur : null;
    }
    const id = entierRef(ch.cibleRef);
    const [courant] = id == null ? [] : await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.id, id), eq(assets.projectId, ctx.projectId)));
    return courant ? null : "Asset introuvable dans ce projet.";
  },

  async appliquer(tx, ctx, ch) {
    const a = apres(ch);
    if (ch.operation === "creer") {
      const v = await verifierCreation(tx, ctx.projectId, a);
      if ("erreur" in v) throw new Error(v.erreur);
      const type = texte(a.type)!;
      const methode = texte(a.methodeGeneration);
      await tx.insert(assets).values({
        projectId: ctx.projectId,
        code: v.code,
        type,
        description: texte(a.description) ?? null,
        promptGeneration: texte(a.promptGeneration) ?? null,
        methodeGeneration: methodeApplicable(type) ? (methode ?? (v.deriveDeId ? null : "generation")) : null,
        dureeSecondes: type === "sfx" && typeof a.dureeSecondes === "number" ? a.dureeSecondes : null,
        critique: a.critique === true,
        deriveDeId: v.deriveDeId,
      });
      return;
    }
    const id = entierRef(ch.cibleRef)!;
    const valeurs: Partial<typeof assets.$inferInsert> = {};
    if (texte(a.description) !== undefined) valeurs.description = texte(a.description);
    if (texte(a.promptGeneration) !== undefined) valeurs.promptGeneration = texte(a.promptGeneration);
    if (typeof a.dureeSecondes === "number") valeurs.dureeSecondes = a.dureeSecondes;
    const methode = texte(a.methodeGeneration);
    if (methode && estMethodeAsset(methode)) {
      const [courant] = await tx.select().from(assets).where(eq(assets.id, id));
      if (courant && methodeApplicable(courant.type) && (methode !== "edition" || courant.deriveDeId != null)) valeurs.methodeGeneration = methode;
    }
    if (Object.keys(valeurs).length) await tx.update(assets).set(valeurs).where(eq(assets.id, id));
  },
};
