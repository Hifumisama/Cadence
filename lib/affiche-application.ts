import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { episodes, projects, seasons } from "../db/schema";
import { cibleDeCodeAffiche, type CibleAffiche } from "./affiches";
import { cheminAssetMedia, cheminPosterMedia } from "./media";

const TABLES = { projects, seasons, episodes } as const;

/** Nom du fichier d'affiche actuel (null s'il n'y en a pas), ou undefined si la cible n'existe pas. */
export async function lirePoster(cible: CibleAffiche, id: number): Promise<string | null | undefined> {
  const table = TABLES[cible];
  const [ligne] = await db.select({ poster: table.posterFichier }).from(table).where(eq(table.id, id));
  return ligne ? ligne.poster : undefined;
}

export async function ecrirePoster(cible: CibleAffiche, id: number, fichier: string | null): Promise<void> {
  const table = TABLES[cible];
  await db.update(table).set({ posterFichier: fichier }).where(eq(table.id, id));
}

const ABSENT: Record<CibleAffiche, string> = {
  projects: "Ce projet n'existe plus.",
  seasons: "Cette saison n'existe plus.",
  episodes: "Cet épisode n'existe plus.",
};

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
  if (!cible) return { ok: false, erreur: "Ce code ne désigne ni un projet, ni une saison, ni un épisode." };

  const courant = await lirePoster(cible.cible, cible.id);
  if (courant === undefined) return { ok: false, erreur: ABSENT[cible.cible] };

  const nom = `poster-${Date.now().toString(36)}${extname(fichierAsset).toLowerCase() || ".png"}`;
  const destination = join(mediaRoot, cheminPosterMedia(cible.cible, cible.id, nom));
  try {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(mediaRoot, cheminAssetMedia(fichierAsset)), destination);
  } catch {
    return { ok: false, erreur: "Le fichier de l'affiche est introuvable sur le stockage." };
  }

  await ecrirePoster(cible.cible, cible.id, nom);

  if (courant && courant !== nom) {
    await unlink(join(mediaRoot, cheminPosterMedia(cible.cible, cible.id, courant))).catch(() => undefined);
  }
  return { ok: true };
}
