/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Par défaut Next plafonne le corps d'une Server Action à 1 Mo — bien en
  // deçà de TAILLE_MAX_UPLOAD_ASSET (10 Mo, lib/media.ts) que les uploads
  // (posters, assets) visent réellement. Aligné ici pour que la limite
  // affichée à l'utilisateur soit celle qui s'applique vraiment.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // La page « Plans » est devenue « Montage » (2026-11-07, docs/PLAN_MONTAGE.md) : les anciens liens (favoris, notifications
  // gardées par le navigateur) mènent à la nouvelle adresse, atelier d'un plan compris.
  async redirects() {
    return [
      { source: "/p/:projectId/e/:episodeId/plans", destination: "/p/:projectId/e/:episodeId/montage", permanent: true },
      { source: "/p/:projectId/e/:episodeId/plans/:uuid", destination: "/p/:projectId/e/:episodeId/montage/:uuid", permanent: true },
    ];
  },
};

export default nextConfig;
