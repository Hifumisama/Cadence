import type { FichierEtat, MediaKind } from "@/components/assets/AssetCard";
import { estAudio, estVideo, fichierMediaExiste, urlAssetMedia } from "@/lib/media";

/** What one needs to know of an asset to display it as a card: kind of media,
 * presence of the file on storage, service URL. Server-side
 * only (checks the disk). */
export function infosMedia(
  type: string,
  fichier: string | null,
): { kind: MediaKind; etat: FichierEtat; src: string | null } {
  if (!fichier) return { kind: "image", etat: "aucun", src: null };
  const kind: MediaKind =
    estAudio(fichier) ? "audio" : estVideo(fichier) ? "video" : "image";
  if (!fichierMediaExiste(fichier)) return { kind, etat: "manquant", src: null };
  return { kind, etat: "ok", src: urlAssetMedia(fichier) };
}
