import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MEDIA_ROOT } from "../lib/media";
import { emplacementLibre, extraireDerniereImage } from "../lib/clips/clip-continuity";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { jobs } from "../db/schema";
import { essaiSourceDuRaccord, planPrecedent } from "../lib/clips/queries-continuity";
import { nomDistantDepuisChemin } from "./comfyui/mapping";
import type { RefMedia } from "./comfyui/types";

/** Continuity image of a clip in « suite » link (lib/clips/clip-continuity.ts): the last image of the render of the PREVIOUS clip, extracted now. */
export type Raccord = { ref: RefMedia; slot: number; sourceJobId: number };

/** The continuity to attach to this clip's generation, or null (« coupe » link, first clip, previous without render, no free slot anymore, ffmpeg
 * missing: nothing is attached and the generation continues as before, without continuity). The image is written under a name specific to the source attempt: another
 * render of the previous clip gives another image, never a stale one. */
export async function preparerRaccord(
  plan: { id: number; episodeId: number; ordre: number; liaison: string },
  slotsImage: number[],
  nbVideos: number,
  /** A final render that resumes the latent of a preview must redo EXACTLY its conditioning: it replays the continuity image of this
   * preview (`jobs.raccord_job_id`, `null` if it had none) instead of computing today's one. */
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
