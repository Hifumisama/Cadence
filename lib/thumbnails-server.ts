import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estMiniaturisable, type LargeurMiniature } from "./thumbnails";

/** Thumbnails on demand, cached on disk — server side only
 * (sharp, node:fs). See lib/thumbnails.ts for the client-side URL helper.
 *
 * Layout: `<MEDIA_ROOT>/_miniatures/<largeur>/<hash du chemin>-<mtime>-<taille>.webp`.
 * The key contains the modification date and the size of the source: an image
 * replaced under the same name (F01: adoption of a candidate, import) gives a
 * new thumbnail, without explicit invalidation. The old thumbnails of the same
 * path are deleted at generation, so the cache stays bounded. */

export const DOSSIER_MINIATURES = "_miniatures";

/** Stable fingerprint of the relative path (normalized separators): same file,
 * same prefix, whatever the OS that built the path. */
export function prefixeCache(relatif: string): string {
  const normalise = relatif.replace(/\\/g, "/");
  return createHash("sha1").update(normalise).digest("hex").slice(0, 20);
}

export function nomCache(relatif: string, mtimeMs: number, taille: number): string {
  return `${prefixeCache(relatif)}-${Math.floor(mtimeMs)}-${taille}.webp`;
}

export function cheminCache(racine: string, largeur: LargeurMiniature, relatif: string, mtimeMs: number, taille: number): string {
  return join(racine, DOSSIER_MINIATURES, String(largeur), nomCache(relatif, mtimeMs, taille));
}

export type Miniature = { chemin: string; taille: number; etag: string };

// Avoids producing the same thumbnail twice in parallel (a page often displays
// the same image ten times).
const enCours = new Map<string, Promise<Miniature | null>>();

/** WebP thumbnail of `<racine>/<relatif>` at the requested width (never enlarged),
 * from the cache if it exists. Returns null if the source is not
 * thumbnailable, not found, or if sharp fails: the caller then serves
 * the original. */
export async function obtenirMiniature(racine: string, relatif: string, largeur: LargeurMiniature): Promise<Miniature | null> {
  if (!estMiniaturisable(relatif)) return null;
  const source = join(racine, relatif);

  let infos;
  try {
    infos = await stat(source);
    if (!infos.isFile()) return null;
  } catch {
    return null;
  }

  const chemin = cheminCache(racine, largeur, relatif, infos.mtimeMs, infos.size);
  const etag = `"${nomCache(relatif, infos.mtimeMs, infos.size).replace(".webp", "")}-${largeur}"`;

  try {
    const deja = await stat(chemin);
    return { chemin, taille: deja.size, etag };
  } catch {
    // not cached yet
  }

  const existante = enCours.get(chemin);
  if (existante) return existante;

  const travail = produire(racine, relatif, source, largeur, chemin, etag).finally(() => enCours.delete(chemin));
  enCours.set(chemin, travail);
  return travail;
}

async function produire(
  racine: string,
  relatif: string,
  source: string,
  largeur: LargeurMiniature,
  chemin: string,
  etag: string,
): Promise<Miniature | null> {
  try {
    const { default: sharp } = await import("sharp");
    // On Windows, sharp keeps the file open as long as its cache lives: that
    // would block overwriting an asset's image on adoption (EBUSY). So we read
    // the source into memory and turn the cache off.
    sharp.cache(false);
    const entree = await readFile(source);
    const sortie = await sharp(entree, { failOn: "none" })
      .rotate()
      .resize({ width: largeur, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await mkdir(join(racine, DOSSIER_MINIATURES, String(largeur)), { recursive: true });
    const temporaire = `${chemin}.${process.pid}.tmp`;
    await writeFile(temporaire, sortie);
    await rename(temporaire, chemin);
    await purgerAnciennes(chemin, relatif);
    return { chemin, taille: sortie.length, etag };
  } catch {
    return null;
  }
}

/** Deletes the stale thumbnails of the same source file (same prefix,
 * different mtime or size) in the folder of this width. */
async function purgerAnciennes(cheminNeuf: string, relatif: string): Promise<void> {
  const dossier = join(cheminNeuf, "..");
  const prefixe = `${prefixeCache(relatif)}-`;
  const nomNeuf = cheminNeuf.slice(dossier.length + 1);
  try {
    for (const nom of await readdir(dossier)) {
      if (nom.startsWith(prefixe) && nom.endsWith(".webp") && nom !== nomNeuf) {
        await unlink(join(dossier, nom)).catch(() => undefined);
      }
    }
  } catch {
    // cleanup is a convenience: a failure must never lose the thumbnail
  }
}
