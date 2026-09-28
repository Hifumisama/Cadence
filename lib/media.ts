import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? "./data");

// Limite volontairement basse pour l'instant — les assets sont des images/
// courts extraits audio, pas des rendus vidéo complets (qui passent par le
// worker ComfyUI, pas par cet upload direct).
export const TAILLE_MAX_UPLOAD_ASSET = 10 * 1024 * 1024;

const EXT_IMAGE = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const EXT_AUDIO = [".wav", ".mp3", ".ogg", ".m4a"];
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

/** Convention de rangement des fichiers d'assets sur le stockage média,
 * symétrique à `plans/<numero>/...` pour les rendus vidéo — voir
 * app/api/media/[...path]/route.ts. Le registre ne stocke que le nom de
 * fichier (ex. "Maya_CharacterSheet.png"), jamais le chemin complet. */
export function cheminAssetMedia(fichier: string): string {
  return `assets/${fichier}`;
}

/** Un asset "fichier" est souvent juste un nom de fichier de référence noté
 * dans le registre, pas forcément déjà présent dans le stockage média (ex.
 * fiches personnage fournies hors pipeline) — on vérifie avant d'essayer de
 * l'afficher, plutôt que de montrer une image cassée. */
export function fichierMediaExiste(fichier: string): boolean {
  try {
    return existsSync(resolve(MEDIA_ROOT, cheminAssetMedia(fichier)));
  } catch {
    return false;
  }
}

export type PosterCible = "projects" | "seasons" | "episodes";

/** Convention de rangement des posters (projet/saison/épisode) — même
 * logique que cheminAssetMedia, un dossier par type d'entité plutôt qu'un
 * seul fourre-tout, puisque l'id seul ne suffirait pas à distinguer un
 * poster de projet d'un poster de saison portant le même id. */
export function cheminPosterMedia(cible: PosterCible, id: number, fichier: string): string {
  return `${cible}/${id}/${fichier}`;
}

export function posterMediaExiste(cible: PosterCible, id: number, fichier: string): boolean {
  try {
    return existsSync(resolve(MEDIA_ROOT, cheminPosterMedia(cible, id, fichier)));
  } catch {
    return false;
  }
}

/** URL à afficher pour un poster, ou null (repli en dégradé) — résolue ici,
 * côté serveur (accès disque), jamais dans le composant Poster lui-même :
 * un import de lib/media.ts (node:fs) depuis un composant rendu par un
 * "use client" ferait planter le bundling (Turbopack refuse node:fs dans un
 * chunk navigateur). Toujours appeler ça depuis une page/composant serveur,
 * jamais depuis un composant client. */
export function posterSrc(cible: PosterCible, id: number, fichier: string | null): string | null {
  if (!fichier || !posterMediaExiste(cible, id, fichier)) return null;
  return `/api/media/${cheminPosterMedia(cible, id, fichier)}`;
}
