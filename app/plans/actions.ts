"use server";

import { db } from "@/db";
import { jobs, planDialogues, planPromptSections, planRefs, plans } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MAX_REFS } from "@/lib/plan-checks";
import type { RefLabel } from "@/lib/plan-checks";

export async function updatePromptSection(
  planId: number,
  section: string,
  contenu: string,
) {
  const existing = await db
    .select()
    .from(planPromptSections)
    .where(eq(planPromptSections.planId, planId));

  const cible = existing.find((s) => s.section === section);
  if (cible) {
    await db
      .update(planPromptSections)
      .set({ contenu })
      .where(eq(planPromptSections.id, cible.id));
  } else {
    await db.insert(planPromptSections).values({
      planId,
      section,
      ordre: existing.length,
      contenu,
    });
  }
}

/** Bouton relance (F03) : crée un NOUVEAU job en_attente plutôt que de
 * réécrire le précédent — l'historique des tentatives est la mémoire de la
 * boucle d'itération. Le worker applique ensuite le healthcheck et la
 * distinction indisponible/échec réel (F04). activerUpscale distingue la
 * prévisualisation rapide (itération de prompt) du rendu final. */
export async function relancerPlan(planId: number, activerUpscale: boolean) {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);

  await db.insert(jobs).values({
    planId: plan.id,
    statut: "en_attente",
    tentative: 1,
    workflowFichier: "video-generation/VID_REF2VA.json",
    seedUtilisee: plan.seed,
    activerUpscale,
  });

  await db
    .update(plans)
    .set({ statut: "en_attente", updatedAt: new Date() })
    .where(eq(plans.id, plan.id));

  revalidatePath("/", "layout");
}

/** FPS et durée de génération, éditables depuis la Fiche de plan — le mode
 * reste toujours full-reference (CDC), pas d'édition prévue pour lui. */
export async function updatePlanParametres(
  planId: number,
  valeurs: { fps: number; dureeGenerationSecondes: number },
) {
  await db
    .update(plans)
    .set({
      fps: valeurs.fps,
      dureeGenerationSecondes: valeurs.dureeGenerationSecondes,
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  revalidatePath("/", "layout");
}

/** Ajoute une référence (image/audio/vidéo) au prochain slot disponible.
 * Ne renumérote jamais les slots existants — même philosophie que les
 * numéros de plan (F03) : un slot supprimé laisse un trou plutôt que
 * décaler les labels <Picture N> déjà cités dans le prompt. */
export async function ajouterRef(
  planId: number,
  type: RefLabel["type"],
  assetId: number,
  role: string,
) {
  const existantes = await db
    .select()
    .from(planRefs)
    .where(and(eq(planRefs.planId, planId), eq(planRefs.type, type)));

  if (existantes.length >= MAX_REFS[type]) return;

  const prochainSlot = existantes.reduce((acc, r) => Math.max(acc, r.slot), 0) + 1;

  await db.insert(planRefs).values({
    planId,
    type,
    slot: prochainSlot,
    assetId,
    role: role || null,
  });

  revalidatePath("/", "layout");
}

export async function supprimerRef(refId: number) {
  await db.delete(planRefs).where(eq(planRefs.id, refId));
  revalidatePath("/", "layout");
}

type ValeursScenario = {
  titre: string;
  description: string;
  dureeMontageSecondes: number;
};

/** Édition des champs scénario — reste ouverte même après développement en
 * fiche de plan (retour utilisateur 2026-09-27) : rien n'empêche de revenir
 * corriger la description après coup. */
export async function updatePlanScenario(planId: number, valeurs: ValeursScenario) {
  await db
    .update(plans)
    .set({
      titre: valeurs.titre,
      description: valeurs.description || null,
      dureeMontageSecondes: valeurs.dureeMontageSecondes,
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId));

  revalidatePath("/", "layout");
}

/** Suppression protégée (révisé 2026-09-28 — remplace la "suppression
 * libre" du même jour, voir docs/FRICTIONS.md) : un plan encore cité comme
 * référence (image/audio/vidéo) ou comme voix de dialogue ne se supprime
 * pas tant que ces liens n'ont pas été explicitement défaits — même
 * philosophie que supprimerAsset (app/assets/actions.ts). `force` saute la
 * vérification : le plan disparaît quand même, ses refs/dialogues
 * cascadent avec lui (db/schema.ts), mais jamais les assets qu'ils
 * citaient — ceux-ci restent dans le registre du projet. */
export async function supprimerPlan(
  planId: number,
  shotsHref: string,
  force = false,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!force) {
    const [ref] = await db
      .select()
      .from(planRefs)
      .where(and(eq(planRefs.planId, planId), isNotNull(planRefs.assetId)))
      .limit(1);
    if (ref) {
      return { ok: false, erreur: "Encore des références d'asset sur ce plan — délie-les d'abord, ou force la suppression." };
    }
    const [dial] = await db
      .select()
      .from(planDialogues)
      .where(and(eq(planDialogues.planId, planId), isNotNull(planDialogues.assetVoixId)))
      .limit(1);
    if (dial) {
      return { ok: false, erreur: "Encore une voix de dialogue liée à un asset sur ce plan — délie-la d'abord, ou force la suppression." };
    }
  }

  await db.delete(plans).where(eq(plans.id, planId));
  revalidatePath("/", "layout");
  redirect(shotsHref);
}

/** Bascule un plan brouillon en fiche de plan développable : crée les 6
 * sections de prompt vides et passe le statut à en_attente — c'est ce qui
 * fait entrer le plan dans la queue Shots (F04), jamais avant. */
export async function developperEnFichePlan(planId: number) {
  const existantes = await db
    .select()
    .from(planPromptSections)
    .where(eq(planPromptSections.planId, planId));

  const SECTIONS = [
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
  ] as const;

  if (existantes.length === 0) {
    for (const [ordre, section] of SECTIONS.entries()) {
      await db.insert(planPromptSections).values({ planId, section, ordre, contenu: "" });
    }
  }

  await db
    .update(plans)
    .set({ statut: "en_attente", updatedAt: new Date() })
    .where(eq(plans.id, planId));

  revalidatePath("/", "layout");
}
