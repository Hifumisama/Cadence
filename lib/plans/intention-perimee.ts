import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { jobs, planPromptSections, plans } from "../../db/schema";
import { intentionChangee } from "./intent";
import { assemblerPrompt } from "./prompt";
import { promptDiffere } from "../renders/rendus";

/** Ce que le texte d'un plan a laissé derrière lui depuis qu'il a changé (lib/plans/intent.ts, `intentionChangee`) :
 * - `fiche` : la fiche a été écrite à partir d'un autre texte (`plans.ficheDescription`) : elle est à régénérer ;
 * - `rendu` : le rendu de référence est parti d'un autre texte (`jobs.descriptionUtilisee`) : il est à refaire. Le rendu de référence est l'essai RETENU quand le plan
 *   est « prêt à upscaler » (valider un essai met le texte du plan à celui de l'essai), sinon le dernier rendu terminé.
 * Comparé par valeur, jamais réécrit seul ; sans valeur enregistrée (plan écrit avant ce suivi), rien n'est signalé.
 *
 * Une fiche n'est jamais signalée quand le rendu de référence la PROUVE d'accord avec le texte : sa fiche actuelle est celle que ce rendu a envoyée, et ce rendu est parti du
 * texte d'aujourd'hui. `ficheDescription` peut être en retard (un chemin d'écriture qui ne l'a pas noté) sans que la fiche soit pour autant périmée. */
export type IntentionPerimee = "fiche" | "rendu";

/** Les plans de l'épisode dont le texte a changé depuis leur fiche ou leur rendu de référence, par uuid. Les autres n'y sont pas. */
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
