import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Blank canvas of an edited poster: image 1 of Qwen Image Edit fixes the output format (the graph has no size node,
 * see worker/comfyui/imageMapping.ts), and the character is a 16:9 sheet. So we put a
 * 2:3 canvas as image 1 and the character behind it (image 2). A file `canevas_affiche_2x3.png` placed in workflows/image-refs/
 * (with a poster frame, for example) replaces the default generated neutral grey. */
export const LARGEUR_CANEVAS = 832;
export const HAUTEUR_CANEVAS = 1248; // 2:3

const CHEMIN_CANEVAS_FOURNI = () =>
  resolve(process.env.COMFYUI_CANEVAS_AFFICHE_PATH ?? "./workflows/image-refs/canevas_affiche_2x3.png");

/** Local path of a canvas ready to send: the supplied file if it exists, otherwise a mid grey written in `dossier`. */
export async function cheminCanevasAffiche(dossier: string): Promise<string> {
  const fourni = CHEMIN_CANEVAS_FOURNI();
  try {
    await access(fourni);
    return fourni;
  } catch {
    // no supplied file: neutral grey generated below
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
