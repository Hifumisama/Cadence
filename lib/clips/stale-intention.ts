import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { jobs, planPromptSections, plans } from "../../db/schema";
import { intentionChangee } from "./intent";
import { assemblerPrompt } from "./prompt";
import { promptDiffere } from "../renders/renders";

/** What a clip's text has left behind since it changed (lib/clips/intent.ts, `intentionChangee`):
 * - `fiche`: the sheet was written from another text (`plans.ficheDescription`): it is to be regenerated;
 * - `rendu`: the reference render left from another text (`jobs.descriptionUtilisee`): it is to be redone. The reference render is the KEPT attempt when the clip
 *   is « prêt à upscaler » (validating an attempt sets the clip's text to that of the attempt), otherwise the last finished render.
 * Compared by value, never rewritten alone; without a recorded value (clip written before this tracking), nothing is flagged.
 *
 * A sheet is never flagged when the reference render PROVES it in agreement with the text: its current sheet is the one that this render sent, and this render left from
 * today's text. `ficheDescription` may be late (a write path that did not note it) without the sheet being stale for all that. */
export type IntentionPerimee = "fiche" | "rendu";

/** The clips of the episode whose text has changed since their sheet or their reference render, by uuid. The others are not in it. */
export async function intentionsPerimees(episodeId: number): Promise<Map<string, IntentionPerimee>> {
  const resultat = new Map<string, IntentionPerimee>();
  const lignes = await db
    .select({ id: plans.id, uuid: plans.uuid, description: plans.description, ficheDescription: plans.ficheDescription, renduRetenuId: plans.renduRetenuId })
    .from(plans)
    .where(eq(plans.episodeId, episodeId));
  if (lignes.length === 0) return resultat;
  const ids = lignes.map((l) => l.id);
  const [termines, sections] = await Promise.all([
    db
      .select({ id: jobs.id, planId: jobs.planId, descriptionUtilisee: jobs.descriptionUtilisee, promptUtilise: jobs.promptUtilise })
      .from(jobs)
      .where(and(inArray(jobs.planId, ids), eq(jobs.statut, "termine")))
      .orderBy(desc(jobs.finishedAt), desc(jobs.id)),
    db.select({ planId: planPromptSections.planId, section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(inArray(planPromptSections.planId, ids)),
  ]);
  type Essai = { descriptionUtilisee: string | null; promptUtilise: string | null };
  const dernier = new Map<number, Essai>();
  const parId = new Map<number, Essai>();
  for (const j of termines) {
    parId.set(j.id, j);
    if (!dernier.has(j.planId)) dernier.set(j.planId, j);
  }
  const sectionsParPlan = new Map<number, { section: string; contenu: string }[]>();
  for (const s of sections) sectionsParPlan.set(s.planId, [...(sectionsParPlan.get(s.planId) ?? []), s]);

  for (const l of lignes) {
    const reference = l.renduRetenuId != null && parId.has(l.renduRetenuId) ? parId.get(l.renduRetenuId) : dernier.get(l.id);
    const ficheProuvee = (): boolean => {
      const lues = sectionsParPlan.get(l.id);
      if (!reference || !reference.promptUtilise || !lues?.some((s) => s.contenu.trim() !== "")) return false;
      return !intentionChangee(l.description, reference.descriptionUtilisee) && reference.descriptionUtilisee != null && !promptDiffere(assemblerPrompt(lues), reference.promptUtilise);
    };
    if (intentionChangee(l.description, l.ficheDescription) && !ficheProuvee()) {
      resultat.set(l.uuid, "fiche");
      continue;
    }
    if (reference && intentionChangee(l.description, reference.descriptionUtilisee)) resultat.set(l.uuid, "rendu");
  }
  return resultat;
}
