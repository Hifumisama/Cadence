import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { assetGenerationSources, assetGenerations } from "../db/schema";
import { cheminGenerationMedia, cheminSourceImportMedia } from "./media";

// Nettoyage des générations d'images et de leurs fichiers, partagé entre l'app
// (supprimer un candidat) et le worker (purge des plus anciens). Les sources
// importées à la volée sont jetables : elles partent avec la dernière génération
// qui les utilise, jamais avant (« Régénérer » peut réutiliser les mêmes).

/** Un import déposé mais jamais utilisé (popup fermée avant de lancer) est
 * balayé après ce délai. */
const AGE_MAX_IMPORT_ORPHELIN_MS = 24 * 3_600_000;

/** Supprime une génération : son candidat, puis sa ligne (les lignes de sources
 * partent en cascade), puis les imports qu'aucune autre génération n'utilise. */
export async function supprimerGenerationEtFichiers(
  gen: { id: number; assetId: number; fichier: string | null },
  mediaRoot: string,
): Promise<void> {
  const imports = await db
    .select({ fichier: assetGenerationSources.fichier })
    .from(assetGenerationSources)
    .where(and(eq(assetGenerationSources.generationId, gen.id), eq(assetGenerationSources.origine, "import")));

  if (gen.fichier) await unlink(join(mediaRoot, cheminGenerationMedia(gen.assetId, gen.fichier))).catch(() => undefined);
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

/** Balaie les imports d'un asset que plus aucune génération ne référence et qui
 * traînent depuis plus d'un jour (déposés puis jamais utilisés). */
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
