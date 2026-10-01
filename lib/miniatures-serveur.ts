import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estMiniaturisable, type LargeurMiniature } from "./miniatures";

/** Miniatures à la demande, mises en cache sur disque — côté serveur uniquement
 * (sharp, node:fs). Voir lib/miniatures.ts pour le helper d'URL côté client.
 *
 * Rangement : `<MEDIA_ROOT>/_miniatures/<largeur>/<hash du chemin>-<mtime>-<taille>.webp`.
 * La clé contient la date de modification et la taille de la source : une image
 * remplacée sous le même nom (F01 : adoption d'un candidat, import) donne une
 * miniature neuve, sans invalidation explicite. Les anciennes miniatures du même
 * chemin sont supprimées à la génération, le cache reste borné. */

export const DOSSIER_MINIATURES = "_miniatures";

/** Empreinte stable du chemin relatif (séparateurs normalisés) : même fichier,
 * même préfixe, quel que soit l'OS qui a construit le chemin. */
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

// Évite de produire deux fois en parallèle la même miniature (une page affiche
// souvent dix fois la même image).
const enCours = new Map<string, Promise<Miniature | null>>();

/** Miniature WebP de `<racine>/<relatif>` à la largeur demandée (jamais agrandie),
 * depuis le cache si elle existe. Renvoie null si la source n'est pas
 * miniaturisable, introuvable, ou si sharp échoue : l'appelant sert alors
 * l'original. */
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
    // pas encore en cache
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
    // Sous Windows, sharp garde le fichier ouvert tant que son cache vit : ça
    // bloquerait l'écrasement de l'image d'un asset à l'adoption (EBUSY). On lit
    // donc la source en mémoire et on coupe le cache.
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

/** Supprime les miniatures périmées du même fichier source (même préfixe,
 * mtime ou taille différents) dans le dossier de cette largeur. */
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
    // le nettoyage est un confort : un échec ne doit jamais faire perdre la miniature
  }
}
