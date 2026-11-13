import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CLES_DEMOS, cheminDemo, type DemoDispo } from "./h3ir/demos";

export const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? "./data");

// Deliberately low limit for now — assets are images/
// short audio extracts, not full video renders (which go through the
// ComfyUI worker, not through this direct upload).
export const TAILLE_MAX_UPLOAD_ASSET = 10 * 1024 * 1024;

// Manual import of an already shot clip (traceability, no generation —
// see app/plans/actions.ts, importerVideoExistante): a complete video,
// not an extract, so the limit is much wider than for an asset.

const EXT_IMAGE = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
// .flac: recommended format for cloning references (project practice —
// never MP3, the model would copy the compression artifacts).
const EXT_AUDIO = [".wav", ".flac", ".mp3", ".ogg", ".m4a"];
const EXT_VIDEO = [".mp4", ".webm", ".mov"];

function extension(chemin: string): string {
  const idx = chemin.lastIndexOf(".");
  return idx === -1 ? "" : chemin.slice(idx).toLowerCase();
}

export function estImage(chemin: string): boolean {
  return EXT_IMAGE.includes(extension(chemin));
}

export function estAudio(chemin: string): boolean {
  return EXT_AUDIO.includes(extension(chemin));
}

export function estVideo(chemin: string): boolean {
  return EXT_VIDEO.includes(extension(chemin));
}

/** Storage convention for asset files on the media storage,
 * symmetric to `plans/<id>/...` for video renders — see
 * app/api/media/[...path]/route.ts. The registry only stores the file name
 * (e.g. "Maya_CharacterSheet.png"), never the full path. */
export function cheminAssetMedia(fichier: string): string {
  return `assets/${fichier}`;
}

/** Service URL of an asset file, suffixed with its modification date:
 * an image adopted or replaced keeps the same name (F01); without this suffix the
 * browser (and React, which does not touch an unchanged `src`) would keep
 * the old one. Server side only (disk access). */
export function urlAssetMedia(fichier: string): string {
  let version = "";
  try {
    version = `?v=${Math.floor(statSync(resolve(MEDIA_ROOT, cheminAssetMedia(fichier))).mtimeMs)}`;
  } catch {
    // file missing: the caller has already handled this case
  }
  return `/api/media/${cheminAssetMedia(fichier)}${version}`;
}

/** A "fichier" asset is often just a reference file name noted
 * in the registry, not necessarily already present in the media storage (e.g.
 * character sheets supplied outside the pipeline) — we check before trying to
 * display it, rather than showing a broken image. */
export function fichierMediaExiste(fichier: string): boolean {
  try {
    return existsSync(resolve(MEDIA_ROOT, cheminAssetMedia(fichier)));
  } catch {
    return false;
  }
}


export type PosterCible = "projects" | "episodes";

/** Storage convention for posters (project/episode) — same
 * logic as cheminAssetMedia, one folder per entity type rather than a
 * single catch-all, since the id alone would not be enough to tell a
 * project poster from an episode poster with the same id. */
export function cheminPosterMedia(cible: PosterCible, id: number, fichier: string): string {
  return `${cible}/${id}/${fichier}`;
}

function posterMediaExiste(cible: PosterCible, id: number, fichier: string): boolean {
  try {
    return existsSync(resolve(MEDIA_ROOT, cheminPosterMedia(cible, id, fichier)));
  } catch {
    return false;
  }
}

/** URL to display for a poster, or null (gradient fallback) — resolved here,
 * server side (disk access), never in the Poster component itself:
 * importing lib/media.ts (node:fs) from a component rendered by a
 * "use client" would break the bundling (Turbopack refuses node:fs in a
 * browser chunk). Always call this from a page/server component,
 * never from a client component. */
export function posterSrc(cible: PosterCible, id: number, fichier: string | null): string | null {
  if (!fichier || !posterMediaExiste(cible, id, fichier)) return null;
  return `/api/media/${cheminPosterMedia(cible, id, fichier)}`;
}

/** Service URL of an asset's own file, or null if it is not (or no longer) on the storage. */
export function assetMediaSrc(fichier: string | null): string | null {
  if (!fichier || !fichierMediaExiste(fichier)) return null;
  return urlAssetMedia(fichier);
}

/** Images generated for an asset (candidates, before adoption) — stored per
 * asset, An adopted candidate is COPIED under
 * `assets/` (assets.fichier); the candidate itself stays here until it is purged. */
export function cheminGenerationMedia(assetId: number, fichier: string): string {
  return `generations/${assetId}/${fichier}`;
}

/** Service URL of a candidate, or null if it is not (or no longer) on the
 * storage. Server side only (disk access). */
export function generationMediaSrc(assetId: number, fichier: string | null): string | null {
  if (!fichier) return null;
  const relatif = cheminGenerationMedia(assetId, fichier);
  try {
    if (!existsSync(resolve(MEDIA_ROOT, relatif))) return null;
  } catch {
    return null;
  }
  return `/api/media/${relatif}`;
}

/** Disposable source images of a « à partir d'images » generation (dropped on the fly
 * in the popup) — under the asset's folder, never in the registry. */
export function cheminSourceImportMedia(assetId: number, fichier: string): string {
  return `generations/${assetId}/sources/${fichier}`;
}

/** Safe import file name: a name generated by the application (never a
 * path), which cannot escape the sources folder. */
export function estNomSourceImport(fichier: string): boolean {
  return /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i.test(fichier);
}

/** Service URL of an imported source (with the modification date, like
 * `urlAssetMedia`), or null if it is not (or no longer) on the storage. */
export function sourceImportMediaSrc(assetId: number, fichier: string | null): string | null {
  if (!fichier || !estNomSourceImport(fichier)) return null;
  const relatif = cheminSourceImportMedia(assetId, fichier);
  try {
    const mtime = Math.floor(statSync(resolve(MEDIA_ROOT, relatif)).mtimeMs);
    return `/api/media/${relatif}?v=${mtime}`;
  } catch {
    return null;
  }
}

/** The « Mise en scène » screen's demo videos (lib/h3ir/demos.ts) present on the storage: for each key, the URL of the video and of its poster (if there is one). A missing demo
 * is not in the result: the screen falls back to the sample text. The `?v=` (file date) allows caching without missing a redone demo. Server side only
 * (disk access). */
export function demosMiseEnScene(): Record<string, DemoDispo> {
  const demos: Record<string, DemoDispo> = {};
  for (const cle of CLES_DEMOS) {
    try {
      const video = resolve(MEDIA_ROOT, cheminDemo(cle, "mp4"));
      if (!existsSync(video)) continue;
      const affiche = resolve(MEDIA_ROOT, cheminDemo(cle, "webp"));
      demos[cle] = {
        video: `/api/media/${cheminDemo(cle, "mp4")}?v=${Math.floor(statSync(video).mtimeMs)}`,
        affiche: existsSync(affiche) ? `/api/media/${cheminDemo(cle, "webp")}?v=${Math.floor(statSync(affiche).mtimeMs)}` : null,
      };
    } catch {
      /* unreadable file: treated as missing */
    }
  }
  return demos;
}
