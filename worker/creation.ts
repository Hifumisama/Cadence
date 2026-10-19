import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { creationsProjet } from "../db/schema";

/** Le projet est-il en cours de création (l'installateur travaille) ? Ses appels LLM prennent alors le GPU seul, et
 * ses images attendent la fin (worker/images.ts) : le gros modèle de la création ne tient pas à côté de ComfyUI. */
export async function projetEnCreation(projectId: number | null): Promise<boolean> {
  if (projectId == null) return false;
  const [c] = await db
    .select({ id: creationsProjet.id })
    .from(creationsProjet)
    .where(and(eq(creationsProjet.projectId, projectId), eq(creationsProjet.statut, "en_cours")))
    .limit(1);
  return c != null;
}
