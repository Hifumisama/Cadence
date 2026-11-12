import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { creationsProjet } from "../db/schema";

/** Is the project being created (the installer is working)? Its LLM calls then take the GPU alone, and
 * its images wait for the end (worker/images.ts): the creation's large model does not fit next to ComfyUI. */
export async function projetEnCreation(projectId: number | null): Promise<boolean> {
  if (projectId == null) return false;
  const [c] = await db
    .select({ id: creationsProjet.id })
    .from(creationsProjet)
    .where(and(eq(creationsProjet.projectId, projectId), eq(creationsProjet.statut, "en_cours")))
    .limit(1);
  return c != null;
}
