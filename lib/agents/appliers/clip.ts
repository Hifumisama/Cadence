import { and, asc, count, eq, inArray } from "drizzle-orm";
import { episodes, jobs, planPromptSections, planRefs, plans, scenes } from "../../../db/schema";
import { recomposerOrdre } from "../../clips/clip-order";
import { ajouterPlanNeAuMontage } from "../../montage/montage-db";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../clips/clip-checks";
import { estLiaison, liaisonOuDefaut } from "../../clips/clip-link";
import type { ChangementBrut } from "../changes";
import { planifierDeplacement, planifierInsertion } from "../ranks";
import type { Avertissement, Position } from "../types";
import { apres, parentDe, texte, type Applicateur, type Db } from "./common";

/** `plan` target: create (at a POSITION: after such clip by uuid, start or end — never a
 * number) or modify title, description, link (with the previous clip, lib/clips/clip-link.ts) and generation duration. `cibleRef` = the clip's uuid
 * (modification). `apres` (creation) = { titre, description, dureeGenerationSecondes,
 * episodeId | episodeCle, sceneId | sceneCle? }. The lines of dialogue and the H3 prompt (sections) are not
 * written through this path: they remain on the clip sheet.
 *
 * Modifying WITH a `position` (after such clip by uuid, start, end) MOVES the clip: it enters the scene
 * of the clip before it, and the episode's order is recomposed as with drag-and-drop (`recomposerOrdre`).
 * A move alone overwrites nothing: the order does not go into a render.
 *
 * Delete (2026-10): as with manual deletion (`supprimerPlan`, app/plans/actions.ts), the sheet, the
 * references, the dialogue-line links and the renders go by cascade (db/schema.ts); the LINES OF DIALOGUE and the
 * ASSETS remain (a line of dialogue exists by itself, F02). A successful render requires confirmation (`ecrase`); a
 * render queued or in progress blocks. The render files are not touched here. */

function controleDuree(duree: unknown): Avertissement | null {
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
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)));
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
    .select({ id: plans.id, episodeId: plans.episodeId, statut: plans.statut, titre: plans.titre, description: plans.description, liaison: plans.liaison, duree: plans.dureeGenerationSecondes })
    .from(plans)
    .where(and(eq(plans.uuid, uuid), eq(plans.projectId, projectId)));
  return p ?? null;
}

const aUnRenduReussi = (statut: string) => statut === "previsualise" || statut === "termine";

/** What a clip takes with it (or leaves) when it is deleted: enough to warn, without guessing. */
async function contenuDuPlan(db: Db, planId: number) {
  const [refs] = await db.select({ n: count() }).from(planRefs).where(eq(planRefs.planId, planId));
  const [actifs] = await db.select({ n: count() }).from(jobs).where(and(eq(jobs.planId, planId), inArray(jobs.statut, ["en_attente", "en_cours"])));
  const sections = await db.select({ contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, planId));
  return {
    refs: refs?.n ?? 0,
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
      return e ? { type: "plan", operation: "creer", episodeId: e.id } : "Épisode introuvable dans ce projet.";
    }
    const plan = await planParUuid(db, ctx.projectId, ch.cibleRef);
    return plan ? { type: "plan", operation: ch.operation, planId: plan.id, episodeId: plan.episodeId } : "Plan introuvable dans ce projet.";
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
      // Position anchor: must exist in the episode (if it already exists).
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
    // Only a CONTENT change overwrites a render: moving a clip does not touch it.
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
      // `ordre` is a position: rewritten densely, a deleted clip leaves no gap (F03).
      await recomposerOrdre(tx, plan.episodeId, restants.map((p) => ({ id: p.id, sceneId: p.sceneId })));
      return;
    }
    if (ch.operation === "modifier") {
      const plan = (await planParUuid(tx, ctx.projectId, ch.cibleRef))!;
      const valeurs: Partial<typeof plans.$inferInsert> = { updatedAt: new Date() };
      if (texte(a.titre) !== undefined) valeurs.titre = texte(a.titre)!.trim();
      if (texte(a.description) !== undefined) valeurs.description = texte(a.description)!.trim() || null;
      if (estLiaison(a.liaison)) valeurs.liaison = a.liaison;
      // The duration in the edit follows the generation duration (same rule as the interface actions, app/plans/actions.ts).
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
        // Same logic as drag-and-drop: the clip enters the scene of its neighbour, then everything is recomposed.
        sequence.splice(dep.index, 0, { id: moi.id, sceneId: dep.sceneId === undefined ? moi.sceneId : dep.sceneId });
        await recomposerOrdre(tx, plan.episodeId, sequence);
      }
      return;
    }
    const episodeId = parentDe(a, "episodeCle", "episodeId", ctx.cles).id!;
    const existants = await plansDeEpisode(tx, episodeId);
    const insertion = planifierInsertion(existants, (ch.position as Position | null) ?? { fin: true })!;
    // Without a given scene (the director adds a clip), it enters the scene of its neighbour: the one before it, otherwise the one after it.
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
    // Reuses the order logic of drag-and-drop: the clip takes its place, the following ones move down one rank,
    // nothing is renumbered (F03).
    const sequence = existants.map((p) => ({ id: p.id, sceneId: p.sceneId }));
    sequence.splice(insertion.index, 0, { id: cree!.id, sceneId });
    await recomposerOrdre(tx, episodeId, sequence);
    // The final edit (docs/PLAN_MONTAGE.md) receives it too, at the place the screenplay gives it.
    await ajouterPlanNeAuMontage(tx, episodeId, cree!.id);
    // The lines of dialogue of the same proposal attach to this clip by its key.
    if (ch.cle) ctx.cles.set(ch.cle, cree!.id);
  },
};

/** Preview of a deletion: what goes with the clip (cascade), what remains, what blocks. Read-only. */
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
  return { ...ch, avant: { titre: plan.titre, description: plan.description ?? "", dureeGenerationSecondes: plan.duree, rang }, apres: null, ecrase, avertissements };
}
