"use server";

import { db } from "@/db";
import { assetGenerations, jobs } from "@/db/schema";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { analyserCle } from "@/lib/taches";

// « Vu » : l'utilisateur a pris connaissance d'une tâche terminée ou échouée
// (indicateur du header). Ces actions ne rechargent aucune page : l'indicateur se
// remet à jour par son propre sondage. Jamais appelées pendant un rendu.

/** Marque des tâches comme vues (`image:<uuid>` / `video:<id>`). Les clés
 * inconnues sont ignorées. */
export async function marquerVu(cles: string[]): Promise<{ ok: true }> {
  const maintenant = new Date();
  const uuids: string[] = [];
  const ids: number[] = [];
  for (const cle of cles.slice(0, 100)) {
    const a = analyserCle(cle);
    if (!a) continue;
    if (a.genre === "image") uuids.push(a.ref);
    else if (Number.isInteger(Number(a.ref))) ids.push(Number(a.ref));
  }
  if (uuids.length > 0) {
    await db
      .update(assetGenerations)
      .set({ vuAt: maintenant })
      .where(and(inArray(assetGenerations.uuid, uuids), isNull(assetGenerations.vuAt)));
  }
  if (ids.length > 0) {
    await db.update(jobs).set({ vuAt: maintenant }).where(and(inArray(jobs.id, ids), isNull(jobs.vuAt)));
  }
  return { ok: true };
}

/** « Tout marquer comme vu » : toutes les tâches finies pas encore vues. Les
 * tâches actives restent non vues : elles le seront à leur fin. */
export async function marquerToutVu(): Promise<{ ok: true }> {
  const maintenant = new Date();
  await db
    .update(assetGenerations)
    .set({ vuAt: maintenant })
    .where(and(isNull(assetGenerations.vuAt), notInArray(assetGenerations.statut, ["en_attente", "en_cours"])));
  await db
    .update(jobs)
    .set({ vuAt: maintenant })
    .where(and(isNull(jobs.vuAt), notInArray(jobs.statut, ["en_attente", "en_cours"])));
  return { ok: true };
}
