"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { donneesAffiche, etatAfficheClap, lancerAfficheClap, signatureAffiche } from "@/lib/agents/poster-clap";
import { posterSrc } from "@/lib/media";
import { z } from "zod";
import { exiger, idSchema } from "@/lib/validation/args";

/** The project's poster as seen from the clap: `en_cours` (the prompt is being written or the image is being generated), `prete`,
 * `echec`, or `indisponible` (the story is not yet told). `src` is the project's current poster (the old one, until the new one is ready). */
export type VueAfficheClap = { etat: "en_cours" | "prete" | "echec" | "indisponible"; src: string | null };

async function afficheActuelle(projectId: number): Promise<string | null> {
  const [p] = await db.select({ poster: projects.posterFichier }).from(projects).where(eq(projects.id, projectId));
  return posterSrc("projects", projectId, p?.poster ?? null);
}

/** On arrival at the clap: prepares the poster if, and only if, what feeds it has changed since the last time (story, hero,
 * places, genre, tone, style: see `signatureAffiche`). Otherwise renders the poster already there, without launching anything. `force`: « Réessayer » after a failure. */
export async function preparerAfficheClap(projectId: number, force = false): Promise<VueAfficheClap> {
  exiger(z.tuple([idSchema, z.boolean()]), [projectId, force]);
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

/** Re-read during generation (the clap polls every two and a half seconds while it is « en cours »). */
export async function lireAfficheClap(projectId: number): Promise<VueAfficheClap> {
  exiger(idSchema, projectId);
  const d = await donneesAffiche(db, projectId);
  if (!d) return { etat: "indisponible", src: await afficheActuelle(projectId) };
  const etat = await etatAfficheClap(db, projectId, signatureAffiche(d));
  return { etat: etat === "a_lancer" ? "en_cours" : etat, src: await afficheActuelle(projectId) };
}
