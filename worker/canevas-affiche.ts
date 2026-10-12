import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Canevas vide d'une affiche éditée : l'image 1 de Qwen Image Edit fixe le format de la sortie (le graphe n'a aucun nœud
 * de taille, voir worker/comfyui/imageMapping.ts), et le personnage est une fiche 16:9. On met donc en image 1 un
 * canevas 2:3 et le personnage derrière (image 2). Un fichier `canevas_affiche_2x3.png` posé dans workflows/image-refs/
 * (avec un cadre d'affiche, par exemple) remplace le gris neutre généré par défaut. */
export const LARGEUR_CANEVAS = 832;
export const HAUTEUR_CANEVAS = 1248; // 2:3

const CHEMIN_CANEVAS_FOURNI = () =>
  resolve(process.env.COMFYUI_CANEVAS_AFFICHE_PATH ?? "./workflows/image-refs/canevas_affiche_2x3.png");

/** Chemin local d'un canevas prêt à envoyer : le fichier fourni s'il existe, sinon un gris moyen écrit dans `dossier`. */
export async function cheminCanevasAffiche(dossier: string): Promise<string> {
  const fourni = CHEMIN_CANEVAS_FOURNI();
  try {
    await access(fourni);
    return fourni;
  } catch {
    // pas de fichier fourni : gris neutre généré ci-dessous
  }
  const { default: sharp } = await import("sharp");
  sharp.cache(false);
  const png = await sharp({
    create: { width: LARGEUR_CANEVAS, height: HAUTEUR_CANEVAS, channels: 3, background: { r: 128, g: 128, b: 128 } },
  })
    .png()
    .toBuffer();
  const chemin = resolve(dossier, "canevas_affiche_2x3.png");
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, png);
  return chemin;
}
