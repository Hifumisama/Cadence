import { and, asc, count, eq, inArray } from "drizzle-orm";
import { episodes, jobs, planDialogues, planPromptSections, planRefs, plans, scenes, seasons } from "../../../db/schema";
import { recomposerOrdre } from "../../ordre-plans";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../plan-checks";
import { estLiaison, liaisonOuDefaut } from "../../plan-liaison";
import type { ChangementBrut } from "../changements";
import { planifierDeplacement, planifierInsertion } from "../rangs";
import type { Avertissement, Position } from "../types";
import { apres, parentDe, texte, type Applicateur, type Db } from "./commun";

/** Cible `plan` : créer (à une POSITION : après tel plan par uuid, début ou fin — jamais un
 * numéro) ou modifier titre, description, liaison (avec le plan précédent, lib/plan-liaison.ts) et durée de génération. `cibleRef` = uuid du plan
 * (modification). `apres` (création) = { titre, description, dureeGenerationSecondes,
 * episodeId | episodeCle, sceneId | sceneCle? }. Les répliques et le prompt H3 (sections) ne
 * s'écrivent pas par ce chemin : ils restent à la fiche de plan.
 *
 * Modifier AVEC une `position` (après tel plan par uuid, début, fin) DÉPLACE le plan : il entre dans la scène
 * du plan qui le précède, l'ordre de l'épisode est recomposé comme au glisser-déposer (`recomposerOrdre`).
 * Un déplacement seul n'écrase rien : l'ordre n'entre pas dans un rendu.
 *
 * Supprimer (2026-10) : comme la suppression manuelle (`supprimerPlan`, app/plans/actions.ts), la fiche, les
 * références, les liaisons de répliques et les rendus partent par cascade (db/schema.ts) ; les RÉPLIQUES et les
 * ASSETS restent (une réplique existe par elle-même, F02). Un rendu réussi demande confirmation (`ecrase`) ; un
 * rendu en file ou en cours bloque. Les fichiers de rendu ne sont pas touchés ici. */

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
    .select({ id: plans.id, episodeId: plans.episodeId, statut: plans.statut, titre: plans.titre, description: plans.description, liaison: plans.liaison, duree: plans.dureeGenerationSecondes, seasonId: episodes.seasonId })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .where(and(eq(plans.uuid, uuid), eq(plans.projectId, projectId)));
  return p ?? null;
}

const aUnRenduReussi = (statut: string) => statut === "previsualise" || statut === "termine";

/** Ce qu'un plan emporte (ou laisse) quand il est supprimé : de quoi avertir, sans rien deviner. */
async function contenuDuPlan(db: Db, planId: number) {
  const [refs] = await db.select({ n: count() }).from(planRefs).where(eq(planRefs.planId, planId));
  const [liaisons] = await db.select({ n: count() }).from(planDialogues).where(eq(planDialogues.planId, planId));
  const [actifs] = await db.select({ n: count() }).from(jobs).where(and(eq(jobs.planId, planId), inArray(jobs.statut, ["en_attente", "en_cours"])));
  const sections = await db.select({ contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, planId));
  return {
    refs: refs?.n ?? 0,
    repliques: liaisons?.n ?? 0,
    rendusActifs: actifs?.n ?? 0,
    fiche: sections.some((s) => s.contenu.trim() !== ""),
  };
}

const REFUS_RENDU_ACTIF = "Un rendu de ce plan est en file ou en cours : annule-le avant de supprimer le plan.";

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
    if (ch.operation === "supprimer") return previsualiserSuppression(db, ctx.projectId, ch);
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
    if (estLiaison(a.liaison) && a.liaison !== plan.liaison) { avant.liaison = plan.liaison; garde.liaison = a.liaison; }
    const modifieDesChamps = Object.keys(garde).length > 0;
    if (ch.position) {
      const dep = planifierDeplacement(await plansDeEpisode(db, plan.episodeId), ch.cibleRef!, ch.position);
      if (!dep) return { ...sortie, avertissements, refuseRaison: "Le plan de repère n'est pas dans cet épisode, ou c'est ce plan lui-même." };
      if (!modifieDesChamps && dep.rangAvant === dep.rangApres) return { ...sortie, avertissements, refuseRaison: "Ce plan est déjà à cette place." };
      avant.rang = dep.rangAvant;
      garde.rang = dep.rangApres;
    }
    sortie.avant = avant;
    sortie.apres = garde;
    // Seule une modification de CONTENU écrase un rendu : déplacer un plan n'y touche pas.
    if (modifieDesChamps && aUnRenduReussi(plan.statut)) {
      sortie.ecrase = `« ${plan.titre} » a un rendu réussi : sa fiche ne correspondra plus au rendu.`;
      avertissements.push({ type: "ecrase_valide", texte: "Modifie un plan déjà rendu." });
    }
    return { ...sortie, avertissements };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation === "supprimer") {
      const plan = await planParUuid(tx, ctx.projectId, ch.cibleRef);
      if (!plan) return "Plan introuvable dans ce projet.";
      return (await contenuDuPlan(tx, plan.id)).rendusActifs > 0 ? REFUS_RENDU_ACTIF : null;
    }
    const a = apres(ch);
    if (a.dureeGenerationSecondes !== undefined && controleDuree(a.dureeGenerationSecondes)) return `Durée de plan invalide (${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières).`;
    if (a.liaison !== undefined && !estLiaison(a.liaison)) return "Liaison de plan invalide (« suite » ou « coupe »).";
    if (ch.operation === "creer") {
      if (!texte(a.titre)?.trim()) return "Titre de plan manquant.";
      if (controleDuree(a.dureeGenerationSecondes)) return `Durée de plan invalide (${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières).`;
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
    const plan = await planParUuid(tx, ctx.projectId, ch.cibleRef);
    if (!plan) return "Plan introuvable dans ce projet.";
    if (ch.position && !planifierDeplacement(await plansDeEpisode(tx, plan.episodeId), ch.cibleRef!, ch.position)) return "Le plan de repère n'est pas dans cet épisode, ou c'est ce plan lui-même.";
    return null;
  },

  async appliquer(tx, ctx, ch) {
    const a = apres(ch);
    if (ch.operation === "supprimer") {
      const plan = (await planParUuid(tx, ctx.projectId, ch.cibleRef))!;
      const restants = (await plansDeEpisode(tx, plan.episodeId)).filter((p) => p.id !== plan.id);
      await tx.delete(plans).where(eq(plans.id, plan.id));
      // `ordre` est une position : réécrite densément, un plan supprimé ne laisse aucun trou (F03).
      await recomposerOrdre(tx, plan.episodeId, restants.map((p) => ({ id: p.id, sceneId: p.sceneId })));
      return;
    }
    if (ch.operation === "modifier") {
      const plan = (await planParUuid(tx, ctx.projectId, ch.cibleRef))!;
      const valeurs: Partial<typeof plans.$inferInsert> = { updatedAt: new Date() };
      if (texte(a.titre) !== undefined) valeurs.titre = texte(a.titre)!.trim();
      if (texte(a.description) !== undefined) valeurs.description = texte(a.description)!.trim() || null;
      if (estLiaison(a.liaison)) valeurs.liaison = a.liaison;
      // La durée au montage suit la durée de génération (même règle que les actions de l'interface, app/plans/actions.ts).
      if (typeof a.dureeGenerationSecondes === "number") {
        valeurs.dureeGenerationSecondes = a.dureeGenerationSecondes;
        valeurs.dureeMontageSecondes = a.dureeGenerationSecondes;
      }
      await tx.update(plans).set(valeurs).where(eq(plans.id, plan.id));
      if (ch.position) {
        const existants = await plansDeEpisode(tx, plan.episodeId);
        const dep = planifierDeplacement(existants, ch.cibleRef!, ch.position)!;
        const moi = existants.find((p) => p.uuid === ch.cibleRef)!;
        const sequence = existants.filter((p) => p.id !== moi.id).map((p) => ({ id: p.id, sceneId: p.sceneId }));
        // Même logique que le glisser-déposer : le plan entre dans la scène de son voisin, puis tout est recomposé.
        sequence.splice(dep.index, 0, { id: moi.id, sceneId: dep.sceneId === undefined ? moi.sceneId : dep.sceneId });
        await recomposerOrdre(tx, plan.episodeId, sequence);
      }
      return;
    }
    const episodeId = parentDe(a, "episodeCle", "episodeId", ctx.cles).id!;
    const existants = await plansDeEpisode(tx, episodeId);
    const insertion = planifierInsertion(existants, (ch.position as Position | null) ?? { fin: true })!;
    // Sans scène donnée (le réalisateur ajoute un plan), il entre dans la scène de son voisin : celui qui le précède, sinon celui qui le suit.
    const sceneDonnee = parentDe(a, "sceneCle", "sceneId", ctx.cles).id;
    const sceneId = sceneDonnee ?? (existants[insertion.index - 1]?.sceneId ?? existants[insertion.index]?.sceneId ?? null);
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
        liaison: liaisonOuDefaut(a.liaison),
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

/** Aperçu d'une suppression : ce qui part avec le plan (cascade), ce qui reste, ce qui bloque. Lecture seule. */
async function previsualiserSuppression(db: Db, projectId: number, ch: ChangementBrut): Promise<ChangementBrut> {
  const plan = await planParUuid(db, projectId, ch.cibleRef);
  if (!plan) return { ...ch, refuseRaison: "Plan introuvable dans ce projet." };
  const avertissements = [...(ch.avertissements ?? [])];
  const contenu = await contenuDuPlan(db, plan.id);
  const rang = (await plansDeEpisode(db, plan.episodeId)).findIndex((p) => p.id === plan.id) + 1;
  let ecrase: string | null = null;
  if (contenu.rendusActifs > 0) avertissements.push({ type: "bloque_controle", texte: REFUS_RENDU_ACTIF });
  if (aUnRenduReussi(plan.statut)) {
    ecrase = `« ${plan.titre} » a un rendu réussi : il sera supprimé avec le plan.`;
    avertissements.push({ type: "ecrase_valide", texte: "Supprime un plan déjà rendu." });
  }
  if (contenu.fiche) avertissements.push({ type: "info", texte: "Sa fiche (prompt) est supprimée avec lui." });
  if (contenu.refs > 0) avertissements.push({ type: "info", texte: `${contenu.refs} référence${contenu.refs > 1 ? "s" : ""} retirée${contenu.refs > 1 ? "s" : ""} du plan : les assets eux-mêmes restent.` });
  if (contenu.repliques > 0) {
    avertissements.push({
      type: "info",
      texte: `${contenu.repliques} réplique${contenu.repliques > 1 ? "s" : ""} reste${contenu.repliques > 1 ? "nt" : ""} dans l'épisode, sans plan : une réplique existe par elle-même.`,
    });
  }
  return { ...ch, avant: { titre: plan.titre, description: plan.description ?? "", dureeGenerationSecondes: plan.duree, rang }, apres: null, ecrase, avertissements };
}
