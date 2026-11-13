import { eq } from "drizzle-orm";
import { db } from "../../db";
import { briefs } from "../../db/schema";
import { langueMoteurVoix } from "./engine-language";

/** Language of the project's dialogues, in the engine's sense (« French »…): that of the brief, « Auto » by default. A character has only one voice, in
 * this language (a translation is another project). */
export async function langueDesDialogues(projectId: number): Promise<string> {
  const [b] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  return langueMoteurVoix((b?.contenu as { langueDialogues?: string } | undefined)?.langueDialogues);
}
