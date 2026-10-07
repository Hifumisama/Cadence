"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { donneesAffiche, etatAfficheClap, lancerAfficheClap, signatureAffiche } from "@/lib/agents/affiche-clap";
import { posterSrc } from "@/lib/media";

/** L'affiche du projet vue du clap : `en_cours` (le prompt s'écrit ou l'image se génère), `prete`, `echec`, ou `indisponible` (l'histoire n'est
 * pas encore dite). `src` est l'affiche actuelle du projet (l'ancienne, tant que la nouvelle n'est pas prête). */
export type VueAfficheClap = { etat: "en_cours" | "prete" | "echec" | "indisponible"; src: string | null };

async function afficheActuelle(projectId: number): Promise<string | null> {
  const [p] = await db.select({ poster: projects.posterFichier }).from(projects).where(eq(projects.id, projectId));
  return posterSrc("projects", projectId, p?.poster ?? null);
}

/** À l'arrivée sur le clap : prépare l'affiche si, et seulement si, ce qui la nourrit a changé depuis la dernière fois (histoire, héros,
 * lieux, genre, ton, style : voir `signatureAffiche`). Sinon rend l'affiche déjà là, sans rien lancer. `force` : « Réessayer » après un échec. */
export async function preparerAfficheClap(projectId: number, force = false): Promise<VueAfficheClap> {
  const d = await donneesAffiche(db, projectId);
  if (!d) return { etat: "indisponible", src: await afficheActuelle(projectId) };
  const signature = signatureAffiche(d);
  const etat = await etatAfficheClap(db, projectId, signature);
  if (etat === "a_lancer" || (force && etat === "echec")) {
    await lancerAfficheClap(db, projectId, d, signature);
    return { etat: "en_cours", src: await afficheActuelle(projectId) };
  }
  return { etat, src: await afficheActuelle(projectId) };
}

/** Relecture pendant la génération (le clap interroge toutes les deux secondes et demie tant que c'est « en cours »). */
export async function lireAfficheClap(projectId: number): Promise<VueAfficheClap> {
  const d = await donneesAffiche(db, projectId);
  if (!d) return { etat: "indisponible", src: await afficheActuelle(projectId) };
  const etat = await etatAfficheClap(db, projectId, signatureAffiche(d));
  return { etat: etat === "a_lancer" ? "en_cours" : etat, src: await afficheActuelle(projectId) };
}
