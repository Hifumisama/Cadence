import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MEDIA_ROOT } from "../lib/media";
import { emplacementLibre, extraireDerniereImage } from "../lib/plan-raccord";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { jobs } from "../db/schema";
import { essaiSourceDuRaccord, planPrecedent } from "../lib/queries-raccord";
import { nomDistantDepuisChemin } from "./comfyui/mapping";
import type { RefMedia } from "./comfyui/types";

/** Image de raccord d'un plan en liaison « suite » (lib/plan-raccord.ts) : la dernière image du rendu du plan PRÉCÉDENT, extraite maintenant. */
export type Raccord = { ref: RefMedia; slot: number; sourceJobId: number };

/** Le raccord à joindre à la génération de ce plan, ou null (liaison « coupe », premier plan, précédent sans rendu, plus d'emplacement libre, ffmpeg
 * absent : rien n'est joint et la génération continue comme avant, sans raccord). L'image est écrite sous un nom propre à l'essai source : un autre
 * rendu du précédent donne une autre image, jamais une image périmée. */
export async function preparerRaccord(
  plan: { id: number; episodeId: number; ordre: number; liaison: string },
  slotsImage: number[],
  nbVideos: number,
  /** Un rendu final qui reprend le latent d'une prévisualisation doit refaire EXACTEMENT son conditioning : il rejoue l'image de raccord de cette
   * prévisualisation (`jobs.raccord_job_id`, `null` si elle n'en avait pas) au lieu de calculer celle d'aujourd'hui. */
  imposeSourceJobId?: number | null,
): Promise<Raccord | null> {
  if (imposeSourceJobId === null) return null;
  let source: { id: number; cheminSortie: string } | null;
  if (imposeSourceJobId !== undefined) {
    const [ligne] = await db
      .select({ id: jobs.id, cheminSortie: jobs.cheminSortie })
      .from(jobs)
      .where(and(eq(jobs.id, imposeSourceJobId), isNotNull(jobs.cheminSortie)));
    source = ligne?.cheminSortie ? { id: ligne.id, cheminSortie: ligne.cheminSortie } : null;
  } else {
    if (plan.liaison !== "suite") return null;
    const precedent = await planPrecedent(plan);
    if (!precedent) return null;
    source = await essaiSourceDuRaccord(precedent);
  }
  if (!source) {
    console.warn(`[worker] Plan ${plan.id} : en suite du plan précédent, mais celui-ci n'a aucun rendu : pas d'image de raccord`);
    return null;
  }
  const slot = emplacementLibre(slotsImage, nbVideos);
  if (slot == null) {
    console.warn(`[worker] Plan ${plan.id} : plus d'emplacement de référence libre pour l'image de raccord`);
    return null;
  }
  const relatif = `plans/${plan.id}/raccord_j${source.id}.png`;
  const local = join(MEDIA_ROOT, relatif);
  try {
    if (!existsSync(local)) {
      const png = await extraireDerniereImage(join(MEDIA_ROOT, source.cheminSortie));
      await mkdir(dirname(local), { recursive: true });
      await writeFile(local, png);
    }
  } catch (err) {
    console.warn(`[worker] Plan ${plan.id} : image de raccord impossible (${err instanceof Error ? err.message : String(err)}) : générée sans`);
    return null;
  }
  return { ref: { slot, cheminLocal: local, nomDistant: nomDistantDepuisChemin(relatif) }, slot, sourceJobId: source.id };
}
