import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { agentRuns } from "../db/schema";
import { annulationDemandeeLlm, finirAnnulationLlm } from "../lib/annulation-db";
import { configLlm } from "../lib/llm/config";
import { executerSkill } from "../lib/llm/executer";
import { AccumulateurFlux } from "../lib/llm/flux-partiel";
import { insererTrace } from "../lib/llm/traces";
import { surveillerAnnulation } from "./annulation";
import { limiteur } from "./comfyui/limiteur";
import { llmJoignable } from "./llamaSwap";
import { postTraiterRun, surEchecRun } from "./agents/postTraitement";
import { preparerEntree, type DepsPreparation } from "./agents/preparation";
import { controleurPourSkill } from "../lib/llm/controles";

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
 * images et aux vidéos (worker/ordonnanceur.ts) avant de choisir. Un appel dont les options portent
 * `suspendu: true` n'est jamais pris tout seul : les essais bout en bout (scripts/agents-e2e.ts)
 * le traitent eux-mêmes avec un faux modèle, sans courir contre le worker de dev. */
export async function prochaineTacheLlmEnAttente(): Promise<AgentRun | null> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.statut, "en_attente"), sql`coalesce(${agentRuns.options}->>'suspendu', 'false') <> 'true'`))
    .orderBy(agentRuns.createdAt, agentRuns.id)
    .limit(1);
  return run ?? null;
}

/** Le serveur LLM est injoignable depuis trop longtemps : les appels en attente échouent (au lieu d'attendre
 * indéfiniment et de bloquer la conversation, `tacheActive`). Chacun suit le chemin d'un échec ordinaire
 * (`surEchecRun` : lot finalisé, conversation revenue), et se relance à la main. Les appels `suspendu` (essais
 * bout en bout) ne sont pas touchés. Renvoie leur nombre. */
export async function echouerAppelsEnAttente(message: string): Promise<number> {
  const enAttente = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.statut, "en_attente"), sql`coalesce(${agentRuns.options}->>'suspendu', 'false') <> 'true'`));
  let n = 0;
  for (const run of enAttente) {
    const pris = await db
      .update(agentRuns)
      .set({ statut: "echoue", erreur: message, finishedAt: new Date() })
      .where(and(eq(agentRuns.id, run.id), eq(agentRuns.statut, "en_attente")))
      .returning({ id: agentRuns.id });
    if (pris.length === 0) continue;
    n += 1;
    await surEchecRun(run, message).catch((err) => console.error(`[worker] Échec de l'appel ${run.id} non propagé :`, err));
  }
  return n;
}

/** Ce qu'on peut injecter pour tester sans serveur LLM (ni ffmpeg : `planche`, voir worker/agents/preparation.ts). */
export type DepsLlm = {
  executer?: typeof executerSkill;
  joignable?: () => Promise<boolean>;
} & DepsPreparation;

/** Traite un appel. Renvoie `true` s'il a été pris (réussi, échoué ou annulé),
 * `false` si le serveur LLM est injoignable : il reste alors en attente et le
 * worker patiente avant de réessayer. */
export async function traiterTacheLlm(run: AgentRun, deps: DepsLlm = {}): Promise<boolean> {
  const executer = deps.executer ?? executerSkill;
  const joignable = deps.joignable ?? (() => {
    const c = configLlm();
    return llmJoignable(c.url, fetch, c.routeSante);
  });
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
  const peutEcrireFlux = limiteur(INTERVALLE_PROGRESSION_MS);
  const flux = new AccumulateurFlux();
  let file: Promise<unknown> = Promise.resolve();
  const enfiler = (tache: () => Promise<unknown>) => {
    file = file.then(tache).catch(() => undefined);
  };

  let traceId: number | null = null;
  const options = (run.options ?? {}) as { modele?: string; variante?: string };
  const debut = Date.now();

  try {
    // Entrée propre au skill, construite À L'EXÉCUTION (iteration-plan : planche de vignettes du rendu, durée
    // réelle mesurée) ; un échec ici (rendu disparu, ffmpeg absent) fait échouer la tâche avec son message.
    const prep = await preparerEntree(run, { planche: deps.planche });
    const res = await executer(run.skill, prep.entree, {
      projectId: run.projectId,
      modele: options.modele,
      variante: options.variante,
      controler: controleurPourSkill(run.skill, prep.controle),
      signal: abandon.signal,
      surProgres: (jetons) => {
        if (peutEcrire()) enfiler(() => db.update(agentRuns).set({ progressionJetons: jetons }).where(eq(agentRuns.id, run.id)));
      },
      // Le texte et la réflexion au fil du flux, pour les voir s'écrire (au plus une écriture par seconde).
      surFlux: (e) => {
        flux.recevoir(e);
        if (peutEcrireFlux()) {
          const [texte, reflexion] = [flux.texte, flux.reflexion];
          enfiler(() => db.update(agentRuns).set({ fluxTexte: texte, fluxReflexion: reflexion }).where(eq(agentRuns.id, run.id)));
        }
      },
      enregistrer: async (trace) => {
        traceId = await insererTrace(trace);
      },
    });
    await file;
    // Le résultat devient ce qu'il doit être (message de conversation, brouillon de brief,
    // changements de proposition) DANS la même transaction que son écriture : si cette
    // conversion échoue, rien n'est écrit et la tâche est marquée échouée.
    await db.transaction(async (tx) => {
      await postTraiterRun(tx, run, res.json, prep.execution);
      await tx
        .update(agentRuns)
        .set({ statut: "termine", resultat: res.json as object, traceId, progressionJetons: null, fluxTexte: null, fluxReflexion: null, finishedAt: new Date() })
        .where(eq(agentRuns.id, run.id));
    });
    console.log(
      `[worker] Appel LLM ${run.id} (${run.skill}) terminé : ${res.modele}, ${res.usage.entree}+${res.usage.sortie} jetons, ${Math.round((Date.now() - debut) / 1000)} s`,
    );
  } catch (err) {
    await file;
    // Annulation demandée (puis connexion coupée) : une annulation, pas un échec.
    if (abandon.signal.aborted || (await annulationDemandeeLlm(run.id).catch(() => false))) {
      await db.update(agentRuns).set({ traceId, fluxTexte: null, fluxReflexion: null }).where(eq(agentRuns.id, run.id));
      await finirAnnulationLlm(run.id);
      await surEchecRun(run, "Annulée.").catch(() => undefined);
      console.log(`[worker] Appel LLM ${run.id} (${run.skill}) annulé`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Appel LLM ${run.id} (${run.skill}) échoué : ${message}`);
      await db
        .update(agentRuns)
        .set({ statut: "echoue", erreur: message.slice(0, 2000), traceId, progressionJetons: null, fluxTexte: null, fluxReflexion: null, finishedAt: new Date() })
        .where(eq(agentRuns.id, run.id));
      await surEchecRun(run, message).catch(() => undefined);
    }
  } finally {
    surveillance.arreter();
  }
  return true;
}
