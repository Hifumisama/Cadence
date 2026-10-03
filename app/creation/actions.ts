"use server";

import { revalidatePath } from "next/cache";
import { arreterCreation, lancerCreation, reprendreCreation } from "@/lib/agents/creation-db";
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
