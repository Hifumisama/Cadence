import { eq } from "drizzle-orm";
import { db } from "../db";
import { briefs } from "../db/schema";
import { langueMoteurVoix } from "./langues-tts";

/** Langue des dialogues du projet, au sens du moteur (« French »…) : celle du brief, « Auto » à défaut. Un personnage n'a qu'une voix, dans
 * cette langue (une traduction est un autre projet). */
export async function langueDesDialogues(projectId: number): Promise<string> {
  const [b] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  return langueMoteurVoix((b?.contenu as { langueDialogues?: string } | undefined)?.langueDialogues);
}
