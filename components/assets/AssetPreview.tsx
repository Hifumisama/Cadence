import { cheminAssetMedia, estAudio, estVideo, fichierMediaExiste } from "@/lib/media";

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

  const src = `/api/media/${cheminAssetMedia(fichier)}`;

  if (type === "voix" || estAudio(fichier)) {
    return (
      <div className={`${classe} is-audio`}>
        <audio controls src={src} style={{ width: "100%" }} />
      </div>
    );
  }

  if (estVideo(fichier)) {
    return (
      <div className={classe}>
        <video controls src={src} />
      </div>
    );
  }

  return (
    <div className={classe}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={fichier} />
    </div>
  );
}
