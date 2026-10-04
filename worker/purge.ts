import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, assetGenerations, jobs, propositions } from "../db/schema";
import { ERREUR_ANNULEE, SEUIL_PURGE_ECHECS_MS, estPurgeable } from "../lib/annulation";
import { supprimerGenerationEtFichiers } from "../lib/generation-sources";

// Purge des échecs « à l'échelle de la journée » : une demande d'image échouée ou
// annulée depuis plus de 24 h disparaît (ligne, fichiers d'import devenus
// orphelins), et un job vidéo annulé de même. Ne touche JAMAIS :
// - un candidat terminé : il suit la règle des 8 par asset (worker/images.ts) ;
// - une tâche active ;
// - un appel LLM terminé : son résultat est exploité par l'écran de revue (chantier 3) ;
//   seuls les appels LLM échoués ou annulés de plus de 24 h disparaissent — SAUF une sous-tâche d'un
//   lot dont la proposition est encore ouverte (en génération ou prête) : la revue en a besoin pour
//   dire « sous-tâche en échec — relancer » ;
// - un job vidéo ÉCHOUÉ pour de vrai : c'est la mémoire de la boucle d'itération
//   (F03, historique des tentatives d'un plan), il se garde. Il disparaît juste du
//   panneau du header au bout d'une journée (lib/taches.ts, estAffichable).
//
// Appelée une fois au démarrage du worker puis toutes les heures (worker/index.ts).

export const INTERVALLE_PURGE_MS = 3_600_000;

export async function purgerEchecs(
  mediaRoot: string,
  maintenant: Date = new Date(),
  seuilMs: number = SEUIL_PURGE_ECHECS_MS,
): Promise<{ images: number; videos: number; llm: number }> {
  const limite = new Date(maintenant.getTime() - seuilMs);

  // Pré-filtre SQL large (créées avant la limite), puis la règle pure tranche sur
  // la date de fin réelle.
  const candidats = await db
    .select()
    .from(assetGenerations)
    .where(and(inArray(assetGenerations.statut, ["echoue", "annulee"]), lt(assetGenerations.createdAt, limite)));
  let images = 0;
  for (const g of candidats) {
    if (!estPurgeable(g, maintenant, seuilMs)) continue;
    await supprimerGenerationEtFichiers(g, mediaRoot);
    images++;
  }

  // Une vidéo annulée a toujours une date de fin (finirAnnulationVideo / annulation directe).
  const videosAnnulees = await db
    .delete(jobs)
    .where(and(eq(jobs.statut, "echoue"), eq(jobs.erreur, ERREUR_ANNULEE), lt(jobs.finishedAt, limite)))
    .returning({ id: jobs.id });

  const llm = await purgerAppelsLlm(limite);

  return { images, videos: videosAnnulees.length, llm };
}

/** Les appels LLM échoués ou annulés avant `limite`, sauf les sous-tâches d'un lot dont la proposition
 * est encore ouverte (la revue en a besoin). Exportée pour être testée seule. */
export async function purgerAppelsLlm(limite: Date): Promise<number> {
  const supprimes = await db
    .delete(agentRuns)
    .where(
      and(
        inArray(agentRuns.statut, ["echoue", "annulee"]),
        lt(agentRuns.finishedAt, limite),
        notExists(
          db
            .select({ un: sql`1` })
            .from(propositions)
            .where(and(eq(propositions.id, agentRuns.propositionId), inArray(propositions.statut, ["en_generation", "prete"]))),
        ),
      ),
    )
    .returning({ id: agentRuns.id });
  return supprimes.length;
}
