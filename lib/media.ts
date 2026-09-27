import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? "./data");

const EXT_IMAGE = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const EXT_AUDIO = [".wav", ".mp3", ".ogg", ".m4a"];

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
