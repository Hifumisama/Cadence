import { eq } from "drizzle-orm";
import { briefs, projects } from "../../db/schema";
import { briefVide, clauseDuBrief, fusionnerPartielDansBrouillon, notesDuBrief, promptImageDuBrief } from "./brief";
import type { Db } from "./appliers/common";
import type { BriefContenu, StatutChamp } from "./types";

/** The brief is the SINGLE SOURCE of the project's style clause and notes (2026-10-02,
 * replaces the "scenario globals"). `projects.clause_style` and `projects.notes` are only
 * denormalized COPIES (image generation reads the clause unchanged): they are written ONLY
 * by `synchroniserClauseStyle`, called after any write of a "valide" or "partiel" brief
 * (direct edit, application of a proposal). A draft synchronizes nothing:
 * it is not yet the project's reference. */
export async function synchroniserClauseStyle(db: Db, projectId: number): Promise<void> {
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (!b || (b.statut !== "valide" && b.statut !== "partiel")) return;
  const contenu = b.contenu as BriefContenu;
  await db
    .update(projects)
    .set({ clauseStyle: clauseDuBrief(contenu), stylePromptImage: promptImageDuBrief(contenu), notes: notesDuBrief(contenu) })
    .where(eq(projects.id, projectId));
}

/** Creates the partial brief of a project that has none (first manual edit). */
export async function creerBriefPartiel(db: Db, projectId: number): Promise<void> {
  const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, projectId));
  await db
    .insert(briefs)
    .values({ projectId, statut: "partiel", source: "reconstitue", contenu: briefVide(projet?.nom ?? ""), statuts: {} })
    .onConflictDoNothing();
}

/** Writes the DRAFT brief of a project (never over a validated brief). A partial brief (style, notes… set by hand):
 * what the user set wins over what the agent wrote. Used for the draft coming from the interview's
 * notes sheet, as soon as it is complete. */
export async function ecrireBrouillon(db: Db, projectId: number, genere: { contenu: BriefContenu; statuts: Record<string, StatutChamp> }): Promise<void> {
  const [existant] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (existant?.statut === "valide") throw new Error("Le projet a déjà un brief validé : le brouillon n'a pas été écrit par-dessus.");
  const { contenu, statuts } =
    existant?.statut === "partiel"
      ? fusionnerPartielDansBrouillon(genere, { contenu: existant.contenu as BriefContenu, statuts: existant.statuts as Record<string, StatutChamp> })
      : genere;
  if (existant) {
    await db
      .update(briefs)
      .set({ statut: "brouillon", source: "conversation", contenu, statuts, version: existant.version + 1, updatedAt: new Date() })
      .where(eq(briefs.id, existant.id));
  } else {
    await db.insert(briefs).values({ projectId, statut: "brouillon", source: "conversation", contenu, statuts });
  }
}
