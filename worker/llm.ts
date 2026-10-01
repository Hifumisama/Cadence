import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { agentRuns } from "../db/schema";
import { annulationDemandeeLlm, finirAnnulationLlm } from "../lib/annulation-db";
import { configLlm } from "../lib/llm/config";
import { executerSkill } from "../lib/llm/executer";
import { insererTrace } from "../lib/llm/traces";
import { surveillerAnnulation } from "./annulation";
import { limiteur } from "./comfyui/limiteur";
import { llmJoignable } from "./llamaSwap";

// Tâche LLM : un appel à un skill d'agent posé dans `agent_runs` (genre « llm »
// du worker). Même contrat que les images : une demande n'est jamais rejouée toute
// seule (un appel de plusieurs minutes se relance à la main), et un serveur LLM
// injoignable ne consomme rien : elle reste en attente.
//
// L'annulation coupe la connexion HTTP (AbortSignal) : llama.cpp arrête de générer.
// Elle n'est ni une erreur ni une raison de relancer.

const INTERVALLE_PROGRESSION_MS = 1_000;

export type AgentRun = typeof agentRuns.$inferSelect;

/** Le plus ancien appel en attente (FIFO), ou null. Le worker le compare aux
 * images et aux vidéos (worker/ordonnanceur.ts) avant de choisir. */
export async function prochaineTacheLlmEnAttente(): Promise<AgentRun | null> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.statut, "en_attente"))
    .orderBy(agentRuns.createdAt, agentRuns.id)
    .limit(1);
  return run ?? null;
}

/** Ce qu'on peut injecter pour tester sans serveur LLM. */
export type DepsLlm = {
  executer?: typeof executerSkill;
  joignable?: () => Promise<boolean>;
};

/** Traite un appel. Renvoie `true` s'il a été pris (réussi, échoué ou annulé),
 * `false` si le serveur LLM est injoignable : il reste alors en attente et le
 * worker patiente avant de réessayer. */
export async function traiterTacheLlm(run: AgentRun, deps: DepsLlm = {}): Promise<boolean> {
  const executer = deps.executer ?? executerSkill;
  const joignable = deps.joignable ?? (() => llmJoignable(configLlm().url));
  if (!(await joignable())) {
    console.log(`[worker] Serveur LLM injoignable — appel ${run.id} (${run.skill}) reste en_attente`);
    return false;
  }

  // Prise gardée par le statut : un appel annulé entre-temps (annulation directe
  // d'une tâche en attente) ne doit pas être ressuscité.
  const prise = await db
    .update(agentRuns)
    .set({ statut: "en_cours", startedAt: new Date(), erreur: null })
    .where(and(eq(agentRuns.id, run.id), eq(agentRuns.statut, "en_attente")))
    .returning({ id: agentRuns.id });
  if (prise.length === 0) return true;

  const abandon = new AbortController();
  const surveillance = surveillerAnnulation(() => annulationDemandeeLlm(run.id));
  void surveillance.promesse.then(() => abandon.abort());

  // Les écritures s'enchaînent : jamais deux UPDATE concurrents sur la ligne.
  const peutEcrire = limiteur(INTERVALLE_PROGRESSION_MS);
  let file: Promise<unknown> = Promise.resolve();
  const enfiler = (tache: () => Promise<unknown>) => {
    file = file.then(tache).catch(() => undefined);
  };

  let traceId: number | null = null;
  const options = (run.options ?? {}) as { modele?: string; variante?: string };
  const debut = Date.now();

  try {
    const res = await executer(run.skill, run.entree as string | object, {
      projectId: run.projectId,
      modele: options.modele,
      variante: options.variante,
      signal: abandon.signal,
      surProgres: (jetons) => {
        if (peutEcrire()) enfiler(() => db.update(agentRuns).set({ progressionJetons: jetons }).where(eq(agentRuns.id, run.id)));
      },
      enregistrer: async (trace) => {
        traceId = await insererTrace(trace);
      },
    });
    await file;
    await db
      .update(agentRuns)
      .set({ statut: "termine", resultat: res.json as object, traceId, progressionJetons: null, finishedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
    console.log(
      `[worker] Appel LLM ${run.id} (${run.skill}) terminé : ${res.modele}, ${res.usage.entree}+${res.usage.sortie} jetons, ${Math.round((Date.now() - debut) / 1000)} s`,
    );
  } catch (err) {
    await file;
    // Annulation demandée (puis connexion coupée) : une annulation, pas un échec.
    if (abandon.signal.aborted || (await annulationDemandeeLlm(run.id).catch(() => false))) {
      await db.update(agentRuns).set({ traceId }).where(eq(agentRuns.id, run.id));
      await finirAnnulationLlm(run.id);
      console.log(`[worker] Appel LLM ${run.id} (${run.skill}) annulé`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Appel LLM ${run.id} (${run.skill}) échoué : ${message}`);
      await db
        .update(agentRuns)
        .set({ statut: "echoue", erreur: message.slice(0, 2000), traceId, progressionJetons: null, finishedAt: new Date() })
        .where(eq(agentRuns.id, run.id));
    }
  } finally {
    surveillance.arreter();
  }
  return true;
}
