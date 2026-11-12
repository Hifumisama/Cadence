import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { assetGenerationSources, assetGenerations } from "../../db/schema";
import { videoDeMaster } from "./asset-generation";
import { cheminGenerationMedia, cheminSourceImportMedia } from "../media";

// Cleanup of image generations and their files, shared between the app
// (deleting a candidate) and the worker (purge of the oldest). Sources
// imported on the fly are disposable: they leave with the last generation
// that uses them, never before (« Régénérer » can reuse the same ones).

/** An import dropped but never used (popup closed before launching) is
 * swept after this delay. */
const AGE_MAX_IMPORT_ORPHELIN_MS = 24 * 3_600_000;

/** Deletes a generation: its candidate, then its row (the source rows
 * go in cascade), then the imports that no other generation uses. */
export async function supprimerGenerationEtFichiers(
  gen: { id: number; assetId: number; fichier: string | null },
  mediaRoot: string,
): Promise<void> {
  const imports = await db
    .select({ fichier: assetGenerationSources.fichier })
    .from(assetGenerationSources)
    .where(and(eq(assetGenerationSources.generationId, gen.id), eq(assetGenerationSources.origine, "import")));

  if (gen.fichier) await unlink(join(mediaRoot, cheminGenerationMedia(gen.assetId, gen.fichier))).catch(() => undefined);
  // The voice master keeps its test video alongside the audio (videoDeMaster); for any other method, this file does not exist.
  if (gen.fichier) await unlink(join(mediaRoot, cheminGenerationMedia(gen.assetId, videoDeMaster(gen.fichier)))).catch(() => undefined);
  await db.delete(assetGenerations).where(eq(assetGenerations.id, gen.id));

  const noms = imports.map((i) => i.fichier);
  if (noms.length === 0) return;
  const encoreUtilises = await db
    .select({ fichier: assetGenerationSources.fichier })
    .from(assetGenerationSources)
    .where(and(eq(assetGenerationSources.origine, "import"), inArray(assetGenerationSources.fichier, noms)));
  const gardes = new Set(encoreUtilises.map((r) => r.fichier));
  for (const nom of noms) {
    if (gardes.has(nom)) continue;
    await unlink(join(mediaRoot, cheminSourceImportMedia(gen.assetId, nom))).catch(() => undefined);
  }
}

/** Sweeps the imports of an asset that no generation references any more and that
 * have been lying around for more than a day (dropped then never used). */
export async function balayerImportsOrphelins(assetId: number, mediaRoot: string): Promise<void> {
  const dossier = join(mediaRoot, "generations", String(assetId), "sources");
  let noms: string[];
  try {
    noms = await readdir(dossier);
  } catch {
    return;
  }
  if (noms.length === 0) return;
  const utilises = await db
    .select({ fichier: assetGenerationSources.fichier })
    .from(assetGenerationSources)
    .where(and(eq(assetGenerationSources.origine, "import"), inArray(assetGenerationSources.fichier, noms)));
  const gardes = new Set(utilises.map((r) => r.fichier));
  for (const nom of noms) {
    if (gardes.has(nom)) continue;
    const chemin = join(dossier, nom);
    const info = await stat(chemin).catch(() => null);
    if (info && Date.now() - info.mtimeMs > AGE_MAX_IMPORT_ORPHELIN_MS) await unlink(chemin).catch(() => undefined);
  }
}
