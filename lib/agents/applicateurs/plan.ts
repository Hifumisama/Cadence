import { and, asc, eq } from "drizzle-orm";
import { episodes, plans, scenes, seasons } from "../../../db/schema";
import { recomposerOrdre } from "../../ordre-plans";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../plan-checks";
import type { ChangementBrut } from "../changements";
import { planifierInsertion } from "../rangs";
import type { Avertissement, Position } from "../types";
import { apres, parentDe, REFUS_SUPPRESSION, texte, type Applicateur, type Db } from "./commun";

/** Cible `plan` : créer (à une POSITION : après tel plan par uuid, début ou fin — jamais un
 * numéro) ou modifier titre, description et durée de génération. `cibleRef` = uuid du plan
 * (modification). `apres` (création) = { titre, description, dureeGenerationSecondes,
 * episodeId | episodeCle, sceneId | sceneCle? }. Les répliques et le prompt H3 (sections) ne
 * s'écrivent pas par ce chemin : ils restent à la fiche de plan. */

export function controleDuree(duree: unknown): Avertissement | null {
  if (typeof duree !== "number" || !Number.isInteger(duree) || duree < DUREE_GENERATION_MIN || duree > DUREE_GENERATION_MAX) {
    return {
      type: "bloque_controle",
      texte: `Durée ${typeof duree === "number" ? `${duree} s` : "invalide"} : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières (contrôle de structure).`,
    };
  }
  return null;
}

async function episodeDuProjet(db: Db, projectId: number, episodeId: number) {
  const [e] = await db
    .select({ id: episodes.id, seasonId: episodes.seasonId })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(and(eq(episodes.id, episodeId), eq(seasons.projectId, projectId)));
  return e ?? null;
}

async function plansDeEpisode(db: Db, episodeId: number) {
  return db
    .select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, sceneId: plans.sceneId })
    .from(plans)
    .where(eq(plans.episodeId, episodeId))
    .orderBy(asc(plans.ordre), asc(plans.id));
}

async function planParUuid(db: Db, projectId: number, uuid: string | null) {
  if (!uuid) return null;
  const [p] = await db
    .select({ id: plans.id, episodeId: plans.episodeId, statut: plans.statut, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes, seasonId: episodes.seasonId })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .where(and(eq(plans.uuid, uuid), eq(plans.projectId, projectId)));
  return p ?? null;
}

export const applicateurPlan: Applicateur = {
  cibleType: "plan",

  async cible(db, ctx, ch) {
    if (ch.operation === "creer") {
      const a = apres(ch);
      const p = parentDe(a, "episodeCle", "episodeId", "cles" in ctx ? ctx.cles : ctx.clesNouvelles);
      if (p.nouveau) return { type: "plan", operation: "creer", episodeId: p.id, parentNouveau: true };
      if (p.id == null) return "Épisode du plan inconnu.";
      const e = await episodeDuProjet(db, ctx.projectId, p.id);
      return e ? { type: "plan", operation: "creer", episodeId: e.id, saisonId: e.seasonId } : "Épisode introuvable dans ce projet.";
    }
    const plan = await planParUuid(db, ctx.projectId, ch.cibleRef);
    return plan ? { type: "plan", operation: ch.operation, planId: plan.id, episodeId: plan.episodeId, saisonId: plan.seasonId } : "Plan introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    const a = apres(ch);
    const avertissements = [...(ch.avertissements ?? [])];
    const sortie: ChangementBrut = { ...ch };

    if (a.dureeGenerationSecondes !== undefined) {
      const w = controleDuree(a.dureeGenerationSecondes);
      if (w) avertissements.push(w);
    }

    if (ch.operation === "creer") {
      // Repère de position : doit exister dans l'épisode (s'il existe déjà).
      const p = parentDe(a, "episodeCle", "episodeId", ctx.clesNouvelles);
      if (!p.nouveau && p.id != null && ch.position && "apresPlanUuid" in ch.position) {
        const existants = await plansDeEpisode(db, p.id);
        if (!planifierInsertion(existants, ch.position)) return { ...sortie, avertissements, refuseRaison: "Le plan de repère n'est pas dans cet épisode." };
      }
      return { ...sortie, avertissements };
    }

    const plan = await planParUuid(db, ctx.projectId, ch.cibleRef);
    if (!plan) return { ...sortie, avertissements, refuseRaison: "Plan introuvable dans ce projet." };
    const avant: Record<string, unknown> = {};
    const garde: Record<string, unknown> = {};
    if (texte(a.titre) !== undefined) { avant.titre = plan.titre; garde.titre = a.titre; }
    if (texte(a.description) !== undefined) { avant.description = plan.description ?? ""; garde.description = a.description; }
    if (a.dureeGenerationSecondes !== undefined) { avant.dureeGenerationSecondes = plan.duree; garde.dureeGenerationSecondes = a.dureeGenerationSecondes; }
    sortie.avant = avant;
    sortie.apres = garde;
    if (plan.statut === "previsualise" || plan.statut === "termine") {
      sortie.ecrase = `« ${plan.titre} » a un rendu réussi : sa fiche ne correspondra plus au rendu.`;
      avertissements.push({ type: "ecrase_valide", texte: "Modifie un plan déjà rendu." });
    }
    return { ...sortie, avertissements };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation === "supprimer") return REFUS_SUPPRESSION;
    const a = apres(ch);
    if (a.dureeGenerationSecondes !== undefined && controleDuree(a.dureeGenerationSecondes)) return "Durée de plan invalide (4 à 15 s entières).";
    if (ch.operation === "creer") {
      if (!texte(a.titre)?.trim()) return "Titre de plan manquant.";
      if (controleDuree(a.dureeGenerationSecondes)) return "Durée de plan invalide (4 à 15 s entières).";
      const episodeId = parentDe(a, "episodeCle", "episodeId", ctx.cles).id;
      if (episodeId == null) return "Épisode du plan inconnu.";
      const sceneId = parentDe(a, "sceneCle", "sceneId", ctx.cles).id;
      if (sceneId != null) {
        const [sc] = await tx.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.episodeId, episodeId)));
        if (!sc) return "La scène n'appartient pas à cet épisode.";
      }
      if (!planifierInsertion(await plansDeEpisode(tx, episodeId), ch.position)) return "Le plan de repère n'est pas dans cet épisode.";
      return null;
    }
    return (await planParUuid(tx, ctx.projectId, ch.cibleRef)) ? null : "Plan introuvable dans ce projet.";
  },

  async appliquer(tx, ctx, ch) {
    const a = apres(ch);
    if (ch.operation === "modifier") {
      const plan = (await planParUuid(tx, ctx.projectId, ch.cibleRef))!;
      const valeurs: Partial<typeof plans.$inferInsert> = { updatedAt: new Date() };
      if (texte(a.titre) !== undefined) valeurs.titre = texte(a.titre)!.trim();
      if (texte(a.description) !== undefined) valeurs.description = texte(a.description)!.trim() || null;
      if (typeof a.dureeGenerationSecondes === "number") valeurs.dureeGenerationSecondes = a.dureeGenerationSecondes;
      await tx.update(plans).set(valeurs).where(eq(plans.id, plan.id));
      return;
    }
    const episodeId = parentDe(a, "episodeCle", "episodeId", ctx.cles).id!;
    const sceneId = parentDe(a, "sceneCle", "sceneId", ctx.cles).id ?? null;
    const existants = await plansDeEpisode(tx, episodeId);
    const insertion = planifierInsertion(existants, (ch.position as Position | null) ?? { fin: true })!;
    const duree = a.dureeGenerationSecondes as number;
    const [cree] = await tx
      .insert(plans)
      .values({
        projectId: ctx.projectId,
        episodeId,
        ordre: existants.length,
        titre: texte(a.titre)!.trim(),
        sceneId,
        description: texte(a.description)?.trim() || null,
        dureeMontageSecondes: duree,
        dureeGenerationSecondes: duree,
      })
      .returning({ id: plans.id });
    // Réutilise la logique d'ordre du glisser-déposer : le plan prend sa place, les
    // suivants descendent d'un rang, rien n'est renuméroté (F03).
    const sequence = existants.map((p) => ({ id: p.id, sceneId: p.sceneId }));
    sequence.splice(insertion.index, 0, { id: cree!.id, sceneId });
    await recomposerOrdre(tx, episodeId, sequence);
    // Les répliques de la même proposition se rattachent à ce plan par sa clé.
    if (ch.cle) ctx.cles.set(ch.cle, cree!.id);
  },
};
