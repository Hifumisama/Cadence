"use server";

import { db } from "@/db";
import { episodes, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminPosterMedia, type PosterCible } from "@/lib/media";
import { inventaireProjet, supprimerProjetComplet } from "@/lib/suppression-projet";

/** Crée le projet (un film) et son épisode unique SANS rediriger : « Créer avec l'agent » ouvre ensuite la popup d'agent sur le projet vide. */
export async function creerProjetSansRedirection(valeurs: { nom: string }): Promise<{ projectId: number }> {
  const [projet] = await db.insert(projects).values({ nom: valeurs.nom }).returning();
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

/** Ce que la suppression emportera — pour la confirmation (lib/suppression-projet.ts). */
export async function lireInventaireSuppression(projectId: number) {
  return inventaireProjet(projectId);
}

/** Jamais bloquée (retour utilisateur 2026-09-28) : le projet est la racine
 * de la hiérarchie, sa suppression entraîne tout avec elle — épisodes, scènes, plans (et leurs sections/refs/dialogues/jobs), ET
 * ses assets (db/schema.ts, cascade) — le seul cas où un asset disparaît.
 * Depuis la recette du 2026-10-04 elle emporte aussi les traces et appels LLM du
 * projet et ses fichiers sur disque (rendus, voix, posters, images d'assets).
 * Attention opérationnelle : tant qu'il n'existe qu'un projet, le supprimer
 * casse `getDefaultProjectId()` (lib/queries.ts) jusqu'à la création d'un
 * nouveau projet — pas de garde-fou ajouté ici, ce n'était pas demandé. */
export async function supprimerProjet(projectId: number) {
  await supprimerProjetComplet(projectId);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function modifierNomProjet(projectId: number, nom: string) {
  await db.update(projects).set({ nom }).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
}

/** Le « titre » affiché du film est celui du projet (modifierNomProjet), pas de son épisode : seul le résumé se modifie ici. */
export async function modifierEpisode(episodeId: number, valeurs: { resume: string }) {
  await db.update(episodes).set({ resume: valeurs.resume }).where(eq(episodes.id, episodeId));
  revalidatePath("/", "layout");
}
