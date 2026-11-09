"use server";

import { revalidatePath } from "next/cache";
import { ajouterConsigne, consignesDuPlan, deplacerConsigne, lancerConsignesPlan, modifierConsigne, supprimerConsigne } from "@/lib/consignes-db";
import type { ConsigneEnAttente, Reglages } from "@/lib/consignes";

// La FILE DE CONSIGNES d'un plan (docs/PLAN_FILE_CONSIGNES.md) côté interface : des brouillons modifiables, lancés d'un coup en UNE itération.

type Resume = { ok: true } | { ok: false; erreur: string };
const rafraichir = <T extends Resume>(r: T): T => {
  revalidatePath("/", "layout");
  return r;
};

export async function listerConsignes(planId: number): Promise<ConsigneEnAttente[]> {
  return consignesDuPlan(planId);
}

export async function empilerConsigne(planId: number, texte: string, reglages: Reglages = {}) {
  return rafraichir(await ajouterConsigne(planId, texte, reglages));
}

export async function corrigerConsigne(id: number, texte: string): Promise<Resume> {
  return rafraichir(await modifierConsigne(id, texte));
}

export async function retirerConsigne(id: number): Promise<Resume> {
  return rafraichir(await supprimerConsigne(id));
}

export async function bougerConsigne(id: number, sens: -1 | 1): Promise<Resume> {
  return rafraichir(await deplacerConsigne(id, sens));
}

/** Lance les consignes en attente du plan : une seule demande d'itération (un passage de l'agent, un rendu). */
export async function lancerLesConsignes(planId: number) {
  return rafraichir(await lancerConsignesPlan(planId));
}
