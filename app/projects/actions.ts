"use server";

import { db } from "@/db";
import { episodes, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminPosterMedia, type PosterCible } from "@/lib/media";
import { inventaireProjet, supprimerProjetComplet } from "@/lib/projects/project-deletion";
import { creativiteOuNull, styleCameraOuNull } from "@/lib/h3ir/settings";

/** Creates the project (a film) and its single episode WITHOUT redirecting: « Créer avec l'agent » then opens the agent popup on the empty project. */
export async function creerProjetSansRedirection(valeurs: { nom: string; creativite?: string | null; styleCamera?: string | null }): Promise<{ projectId: number }> {
  // Creativity and staging style (Open H3 IR): chosen at the « Mise en scène » step of the design; when absent, the project inherits the defaults.
  const [projet] = await db
    .insert(projects)
    .values({ nom: valeurs.nom, creativite: creativiteOuNull(valeurs.creativite), styleCamera: styleCameraOuNull(valeurs.styleCamera) })
    .returning();
  if (!projet) throw new Error("Échec de création du projet.");
  await db.insert(episodes).values({ projectId: projet.id, numero: 1, titre: "" });

  revalidatePath("/", "layout");
  return { projectId: projet.id };
}

async function enregistrerPoster(cible: PosterCible, id: number, fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX_UPLOAD_ASSET) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).`,
    );
  }
  const ext = extname(fichier.name) || "";
  const nomFichier = `poster${ext}`;
  const cheminComplet = join(MEDIA_ROOT, cheminPosterMedia(cible, id, nomFichier));
  await mkdir(dirname(cheminComplet), { recursive: true });
  const octets = Buffer.from(await fichier.arrayBuffer());
  await writeFile(cheminComplet, octets);
  return nomFichier;
}

export async function uploaderPosterProjet(projectId: number, formData: FormData) {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  const nomFichier = await enregistrerPoster("projects", projectId, fichier);
  await db.update(projects).set({ posterFichier: nomFichier }).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
}

/** What the deletion will take away — for the confirmation (lib/projects/project-deletion.ts). */
export async function lireInventaireSuppression(projectId: number) {
  return inventaireProjet(projectId);
}

/** Never blocked (user feedback 2026-09-28): the project is the root
 * of the hierarchy, deleting it takes everything with it — episodes, scenes, clips (and their sections/refs/dialogues/jobs), AND
 * its assets (db/schema.ts, cascade) — the only case where an asset disappears.
 * Since the recipe of 2026-10-04 it also takes the traces and LLM calls of the
 * project and its files on disk (renders, voices, posters, asset images).
 * Operational warning: as long as only one project exists, deleting it
 * breaks `getDefaultProjectId()` (lib/queries.ts) until a new project is created — no safeguard added here, as it was not requested. */
export async function supprimerProjet(projectId: number) {
  await supprimerProjetComplet(projectId);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function modifierNomProjet(projectId: number, nom: string) {
  await db.update(projects).set({ nom }).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
}

/** Creativity and staging style of the project (Open H3 IR): the most general level, which the scenes and then the clips can override (lib/h3ir/settings.ts).
 * Empty or unknown value = default setting; the style « aucun » is a value (no staging style). */
export async function modifierReglagesCameraProjet(projectId: number, valeurs: { creativite: string | null; styleCamera: string | null }) {
  await db
    .update(projects)
    .set({ creativite: creativiteOuNull(valeurs.creativite), styleCamera: styleCameraOuNull(valeurs.styleCamera) })
    .where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
}

/** The displayed « titre » of the film is the project's (modifierNomProjet), not its episode's: only the summary is edited here. */
export async function modifierEpisode(episodeId: number, valeurs: { resume: string }) {
  await db.update(episodes).set({ resume: valeurs.resume }).where(eq(episodes.id, episodeId));
  revalidatePath("/", "layout");
}
