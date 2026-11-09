import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assets } from "../db/schema";
import { horsAffiches } from "./assets-visibles";
import { poserGenerationsLot } from "./generation-lancement";
import { idsSansImage } from "./images-projet";

/** Les images de référence qui partent TOUTES SEULES (2026-10-17) : pendant la création d'un projet, dès qu'un asset a
 * son prompt, son image est mise en file, sans attendre la fin des autres étapes ni le bouton « générer les images ».
 * C'est le même lot que le bouton (lib/generation-lancement.ts : prompt et format par défaut du type, adoption
 * automatique, assets déjà en file sautés) ; il se rappelle à chaque tour du pilote, donc un dérivé en édition part
 * tout seul une fois l'image de son master adoptée. Renvoie le nombre d'images mises en file. */
export async function lancerImagesPretes(projectId: number): Promise<number> {
  const lignes = await db.select({ id: assets.id, type: assets.type, fichier: assets.fichier }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
  const ids = idsSansImage(lignes);
  if (ids.length === 0) return 0;
  const r = await poserGenerationsLot(projectId, ids);
  return r.ok ? r.lancees : 0;
}
