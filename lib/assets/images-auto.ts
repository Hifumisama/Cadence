import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { assets } from "../../db/schema";
import { horsAffiches } from "./assets-visible";
import { poserGenerationsLot } from "./generation-launch";
import { idsSansImage } from "./project-images";

/** The reference images that go ALL BY THEMSELVES (2026-10-17): during the creation of a project, as soon as an asset has
 * its prompt, its image is queued, without waiting for the end of the other steps nor the « générer les images » button.
 * It is the same batch as the button (lib/assets/generation-launch.ts: prompt and default format of the type, automatic adoption,
 * assets already queued skipped); it is recalled at each round of the pilot loop, so a derivative in edit goes
 * all by itself once its master's image is adopted. Returns the number of images queued. */
export async function lancerImagesPretes(projectId: number): Promise<number> {
  const lignes = await db.select({ id: assets.id, type: assets.type, fichier: assets.fichier }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
  const ids = idsSansImage(lignes);
  if (ids.length === 0) return 0;
  const r = await poserGenerationsLot(projectId, ids);
  return r.ok ? r.lancees : 0;
}
