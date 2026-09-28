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
};

export default nextConfig;
