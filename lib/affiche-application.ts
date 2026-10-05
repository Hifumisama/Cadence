import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { episodes, projects } from "../db/schema";
import { cibleDeCodeAffiche } from "./affiches";
import { cheminAssetMedia, cheminPosterMedia } from "./media";

/** Fait de l'image d'un asset d'affiche l'affiche du projet ou de l'épisode qu'elle habille : le fichier est copié dans le
 * rangement des posters et `posterFichier` pointe dessus. Sans dépendance à Next : appelée à l'adoption d'un candidat
 * (lib/generation-adoption.ts).
 *
 * Le nom de fichier est UNIQUE à chaque application (jamais `poster.png` réécrit sur place) : l'adresse change, donc le
 * navigateur ne montre jamais l'ancienne image en cache. L'affiche précédente est supprimée du stockage. */
export async function appliquerAffiche(
  codeAsset: string,
  fichierAsset: string,
  mediaRoot: string,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const cible = cibleDeCodeAffiche(codeAsset);
  if (!cible) return { ok: false, erreur: "Ce code ne désigne ni un projet ni un épisode." };

  const [courant] =
    cible.cible === "projects"
      ? await db.select({ poster: projects.posterFichier }).from(projects).where(eq(projects.id, cible.id))
      : await db.select({ poster: episodes.posterFichier }).from(episodes).where(eq(episodes.id, cible.id));
  if (!courant) return { ok: false, erreur: cible.cible === "projects" ? "Ce projet n'existe plus." : "Cet épisode n'existe plus." };

  const nom = `poster-${Date.now().toString(36)}${extname(fichierAsset).toLowerCase() || ".png"}`;
  const destination = join(mediaRoot, cheminPosterMedia(cible.cible, cible.id, nom));
  try {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(mediaRoot, cheminAssetMedia(fichierAsset)), destination);
  } catch {
    return { ok: false, erreur: "Le fichier de l'affiche est introuvable sur le stockage." };
  }

  if (cible.cible === "projects") await db.update(projects).set({ posterFichier: nom }).where(eq(projects.id, cible.id));
  else await db.update(episodes).set({ posterFichier: nom }).where(eq(episodes.id, cible.id));

  if (courant.poster && courant.poster !== nom) {
    await unlink(join(mediaRoot, cheminPosterMedia(cible.cible, cible.id, courant.poster))).catch(() => undefined);
  }
  return { ok: true };
}
