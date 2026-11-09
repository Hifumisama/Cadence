"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { arreterCreation, lancerCreation, lancerFichesApresCreation, reprendreCreation } from "@/lib/agents/creation-db";
import { lirePlansIntents, type PlanIntent } from "@/lib/agents/creation-vue";
import type { Resultat } from "@/lib/agents/types";

/** L'installateur (lib/agents/creation.ts) : une seule demande enchaîne toute la création du projet. Ces actions ne
 * font qu'écrire l'état ; le worker fait avancer les étapes (lib/agents/creation-db.ts, `piloterCreations`). */

export async function lancerCreationProjet(projectId: number): Promise<Resultat<{ creationId: number }>> {
  const r = await lancerCreation(projectId);
  revalidatePath(`/p/${projectId}/creation`);
  return r;
}

export async function reprendreCreationProjet(projectId: number): Promise<Resultat> {
  const r = await reprendreCreation(projectId);
  revalidatePath(`/p/${projectId}/creation`);
  return r;
}

export async function arreterCreationProjet(projectId: number): Promise<Resultat> {
  const r = await arreterCreation(projectId);
  revalidatePath(`/p/${projectId}/creation`);
  return r;
}

/** « Écrire les fiches » de l'écran des intents : une demande de fiche par plan (sans fiche par défaut, tous si `tous`), dans l'ordre du scénario,
 * hors création (lib/agents/creation-db.ts, `lancerFichesApresCreation`). Le suivi se lit ensuite par app/api/creation/[projectId]/fiches. */
export async function ecrireFichesProjet(projectId: number, options: { tous?: boolean } = {}): Promise<Resultat<{ lancees: number; erreurs: string[] }>> {
  const r = await lancerFichesApresCreation(projectId, { tous: options.tous === true });
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, lancees: r.lancees, erreurs: r.erreurs } : r;
}

/** Les plans et leurs intents, pour l'écran de fin (relus après une modification). */
export async function lireIntentsProjet(projectId: number): Promise<PlanIntent[]> {
  return lirePlansIntents(projectId);
}

const MAX_INTENT = 4000;

/** Corrige l'intent d'un plan (sa description) depuis l'écran de fin, avant d'écrire sa fiche. Le plan est désigné par son uuid, dans CE projet. */
export async function modifierIntentPlan(projectId: number, planUuid: string, description: string): Promise<Resultat> {
  const texte = description.trim();
  if (!texte) return { ok: false, erreur: "L'intent ne peut pas être vide : c'est ce que la fiche met en images." };
  if (texte.length > MAX_INTENT) return { ok: false, erreur: `L'intent est trop long (${MAX_INTENT} caractères au plus).` };
  const maj = await db
    .update(plans)
    .set({ description: texte, updatedAt: new Date() })
    .where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)))
    .returning({ id: plans.id });
  if (maj.length === 0) return { ok: false, erreur: "Plan introuvable dans ce projet." };
  revalidatePath("/", "layout");
  return { ok: true };
}
