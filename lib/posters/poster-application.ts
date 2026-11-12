import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { episodes, projects } from "../../db/schema";
import { cibleDeCodeAffiche, type CibleAffiche } from "./posters";
import { SUFFIXE_TITRE } from "./poster";
import { cheminAssetMedia, cheminPosterMedia } from "../media";

const TABLES = { projects, episodes } as const;

/** Name of the current poster file (null if there is none), or undefined if the target does not exist. */
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
  episodes: "Cet épisode n'existe plus.",
};

/** Makes the image of a poster asset the poster of the project or episode it dresses: the file is copied into the
 * posters storage and `posterFichier` points to it. No dependency on Next: called when a candidate is adopted
 * (lib/assets/generation-adoption.ts).
 *
 * The file name is UNIQUE for each application (never `poster.png` rewritten in place): the address changes, so the
 * browser never shows the old image from cache. The previous poster is deleted from storage. */
export async function appliquerAffiche(
  codeAsset: string,
  fichierAsset: string,
  mediaRoot: string,
  /** The model wrote the title in the image: the file carries the `-titre` suffix and the title is not overlaid. */
  titreIncruste = false,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const cible = cibleDeCodeAffiche(codeAsset);
  if (!cible) return { ok: false, erreur: "Ce code ne désigne ni un projet, ni un épisode." };

  const courant = await lirePoster(cible.cible, cible.id);
  if (courant === undefined) return { ok: false, erreur: ABSENT[cible.cible] };

  const nom = `poster-${Date.now().toString(36)}${titreIncruste ? SUFFIXE_TITRE : ""}${extname(fichierAsset).toLowerCase() || ".png"}`;
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
