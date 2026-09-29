import type { FichierEtat, MediaKind } from "@/components/assets/AssetCard";
import { cheminAssetMedia, estAudio, estVideo, fichierMediaExiste } from "@/lib/media";

/** Ce qu'il faut savoir d'un asset pour l'afficher en carte : nature du média,
 * présence du fichier sur le stockage, URL de service. Côté serveur
 * uniquement (vérifie le disque). */
export function infosMedia(
  type: string,
  fichier: string | null,
): { kind: MediaKind; etat: FichierEtat; src: string | null } {
  if (!fichier) return { kind: "image", etat: "aucun", src: null };
  const kind: MediaKind =
    type === "voix" || type === "sfx" || estAudio(fichier) ? "audio" : estVideo(fichier) ? "video" : "image";
  if (!fichierMediaExiste(fichier)) return { kind, etat: "manquant", src: null };
  return { kind, etat: "ok", src: `/api/media/${cheminAssetMedia(fichier)}` };
}
