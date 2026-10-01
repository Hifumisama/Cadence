import { MediaZoom } from "@/components/assets/MediaZoom";
import { urlMiniature, type LargeurMiniature } from "@/lib/miniatures";
import { estAudio, estVideo, fichierMediaExiste, urlAssetMedia } from "@/lib/media";

// Largeur de la miniature selon la taille d'affichage (écran 2×) ; l'original ne
// sert qu'au zoom.
const LARGEUR_APERCU: Record<"sm" | "md" | "lg", LargeurMiniature> = { sm: 96, md: 192, lg: 768 };

export function AssetPreview({
  type,
  fichier,
  taille = "sm",
}: {
  type: string;
  fichier: string | null;
  taille?: "sm" | "md" | "lg";
}) {
  const classe = `asset-preview asset-preview-${taille}`;

  if (!fichier) {
    return <div className={`${classe} is-empty`} aria-hidden="true" />;
  }

  const existe = fichierMediaExiste(fichier);
  if (!existe) {
    return (
      <div className={`${classe} is-missing`} title={`Fichier introuvable : ${fichier}`}>
        <span className="tiny-note">introuvable</span>
      </div>
    );
  }

  const src = urlAssetMedia(fichier);

  if (type === "voix" || type === "sfx" || estAudio(fichier)) {
    return (
      <div className={`${classe} is-audio`}>
        <audio controls src={src} style={{ width: "100%" }} />
      </div>
    );
  }

  const video = estVideo(fichier);
  return (
    <MediaZoom
      kind={video ? "video" : "image"}
      src={src}
      apercu={video ? undefined : urlMiniature(src, LARGEUR_APERCU[taille])}
      alt={fichier}
      classe={classe}
    />
  );
}
