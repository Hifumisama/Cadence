"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { arreterCreation, lancerCreation, lancerFichesApresCreation, reprendreCreation } from "@/lib/agents/creation-db";

import type { Resultat } from "@/lib/agents/types";
import { z } from "zod";
import { idSchema, texteSchema, uuidSchema, verifier } from "@/lib/validation/args";

/** The installer (lib/agents/creation.ts): a single request chains the whole project creation. These actions
 * only write the state; the worker advances the steps (lib/agents/creation-db.ts, `piloterCreations`). */

export async function lancerCreationProjet(projectId: number): Promise<Resultat<{ creationId: number }>> {
  const v = verifier(idSchema, projectId);
  if (!v.ok) return v;
  const r = await lancerCreation(projectId);
  revalidatePath(`/p/${projectId}/creation`);
  return r;
}

export async function reprendreCreationProjet(projectId: number): Promise<Resultat> {
  const v = verifier(idSchema, projectId);
  if (!v.ok) return v;
  const r = await reprendreCreation(projectId);
  revalidatePath(`/p/${projectId}/creation`);
  return r;
}

export async function arreterCreationProjet(projectId: number): Promise<Resultat> {
  const v = verifier(idSchema, projectId);
  if (!v.ok) return v;
  const r = await arreterCreation(projectId);
  revalidatePath(`/p/${projectId}/creation`);
  return r;
}

/** « Écrire les fiches » on the intent screen: one clip sheet request per clip (no sheet by default, all if `tous`), in screenplay order,
 * outside creation (lib/agents/creation-db.ts, `lancerFichesApresCreation`). Progress is then read via app/api/creation/[projectId]/fiches. */
export async function ecrireFichesProjet(projectId: number, options: { tous?: boolean } = {}): Promise<Resultat<{ lancees: number; erreurs: string[] }>> {
  const v = verifier(z.tuple([idSchema, z.object({ tous: z.boolean().optional() })]), [projectId, options]);
  if (!v.ok) return v;
  const r = await lancerFichesApresCreation(projectId, { tous: options.tous === true });
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, lancees: r.lancees, erreurs: r.erreurs } : r;
}

const MAX_INTENT = 4000;

/** Fixes a clip's intent (its description) from the end screen, before writing its clip sheet. The clip is identified by its uuid, within THIS project. */
export async function modifierIntentPlan(projectId: number, planUuid: string, description: string): Promise<Resultat> {
  const v = verifier(z.tuple([idSchema, uuidSchema, texteSchema()]), [projectId, planUuid, description]);
  if (!v.ok) return v;
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
