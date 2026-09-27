"use server";

import { db } from "@/db";
import { mouvements, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { setParam } from "@/lib/params";
import type { Parametres } from "@/lib/params";

export async function updateScenarioGlobal(cle: keyof Parametres, valeur: string) {
  await setParam(cle, valeur);
  revalidatePath("/scenario");
}

/** Un plan naît toujours en brouillon (défaut du schéma) — il faudra le
 * "développer" explicitement en fiche de plan avant qu'il entre dans Shots.
 * Le numéro n'est jamais imposé par une règle stricte de dizaines : c'est
 * une convention d'écriture, pas une contrainte, on peut insérer librement
 * entre deux numéros existants. */
export async function creerPlanScenario(valeurs: {
  numero: number;
  titre: string;
  mouvementId: number | null;
  dureeMontageSecondes: number;
  valeur: string;
  sujet: string;
  decor: string;
  lumiere: string;
  mouvementCamera: string;
  son: string;
  intention: string;
  assetsRequis: string;
}) {
  await db.insert(plans).values({
    numero: valeurs.numero,
    titre: valeurs.titre,
    mouvementId: valeurs.mouvementId,
    dureeMontageSecondes: valeurs.dureeMontageSecondes,
    dureeGenerationSecondes: valeurs.dureeMontageSecondes,
    valeur: valeurs.valeur || null,
    sujet: valeurs.sujet || null,
    decor: valeurs.decor || null,
    lumiere: valeurs.lumiere || null,
    mouvementCamera: valeurs.mouvementCamera || null,
    son: valeurs.son || null,
    intention: valeurs.intention || null,
    assetsRequis: valeurs.assetsRequis || null,
  });
  revalidatePath("/scenario");
}

export async function creerMouvement(valeurs: {
  titre: string;
  planNumeroDebut: number;
  planNumeroFin: number;
  fonction: string;
  dureeApproxSecondes: number | null;
}) {
  const existants = await db.select().from(mouvements);
  const ordre = existants.reduce((acc, m) => Math.max(acc, m.ordre), -1) + 1;
  await db.insert(mouvements).values({
    ordre,
    titre: valeurs.titre,
    planNumeroDebut: valeurs.planNumeroDebut,
    planNumeroFin: valeurs.planNumeroFin,
    fonction: valeurs.fonction || null,
    dureeApproxSecondes: valeurs.dureeApproxSecondes,
  });
  revalidatePath("/scenario");
}

/** Suppression sans blocage (retour utilisateur 2026-09-28) : un mouvement
 * n'est qu'un regroupement narratif, pas une dépendance structurelle — le
 * supprimer détache simplement ses plans ("sans mouvement") plutôt que de
 * bloquer l'action ou de supprimer les plans eux-mêmes. */
export async function supprimerMouvement(mouvementId: number) {
  await db.update(plans).set({ mouvementId: null }).where(eq(plans.mouvementId, mouvementId));
  await db.delete(mouvements).where(eq(mouvements.id, mouvementId));
  revalidatePath("/scenario");
}
