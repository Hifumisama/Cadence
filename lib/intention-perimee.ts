import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { jobs, plans } from "../db/schema";
import { intentionChangee } from "./intent";

/** Ce que le texte d'un plan a laissé derrière lui depuis qu'il a changé (lib/intent.ts, `intentionChangee`) :
 * - `fiche` : la fiche a été écrite à partir d'un autre texte (`plans.ficheDescription`) : elle est à régénérer ;
 * - `rendu` : le rendu de référence est parti d'un autre texte (`jobs.descriptionUtilisee`) : il est à refaire. Le rendu de référence est l'essai RETENU quand le plan
 *   est « prêt à upscaler » (valider un essai met le texte du plan à celui de l'essai), sinon le dernier rendu terminé.
 * Comparé par valeur, jamais réécrit seul ; sans valeur enregistrée (plan écrit avant ce suivi), rien n'est signalé. */
export type IntentionPerimee = "fiche" | "rendu";

/** Les plans de l'épisode dont le texte a changé depuis leur fiche ou leur rendu de référence, par uuid. Les autres n'y sont pas. */
export async function intentionsPerimees(episodeId: number): Promise<Map<string, IntentionPerimee>> {
  const resultat = new Map<string, IntentionPerimee>();
  const lignes = await db
    .select({ id: plans.id, uuid: plans.uuid, description: plans.description, ficheDescription: plans.ficheDescription, renduRetenuId: plans.renduRetenuId })
    .from(plans)
    .where(eq(plans.episodeId, episodeId));
  if (lignes.length === 0) return resultat;
  const termines = await db
    .select({ id: jobs.id, planId: jobs.planId, descriptionUtilisee: jobs.descriptionUtilisee })
    .from(jobs)
    .where(and(inArray(jobs.planId, lignes.map((l) => l.id)), eq(jobs.statut, "termine")))
    .orderBy(desc(jobs.finishedAt), desc(jobs.id));
  const dernier = new Map<number, string | null>();
  const parId = new Map<number, string | null>();
  for (const j of termines) {
    parId.set(j.id, j.descriptionUtilisee);
    if (!dernier.has(j.planId)) dernier.set(j.planId, j.descriptionUtilisee);
  }
  for (const l of lignes) {
    if (intentionChangee(l.description, l.ficheDescription)) {
      resultat.set(l.uuid, "fiche");
      continue;
    }
    const reference = l.renduRetenuId != null && parId.has(l.renduRetenuId) ? parId.get(l.renduRetenuId) : dernier.get(l.id);
    if (reference !== undefined && intentionChangee(l.description, reference)) resultat.set(l.uuid, "rendu");
  }
  return resultat;
}
