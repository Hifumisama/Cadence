import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { agentRuns } from "../db/schema";
import { annulationDemandeeLlm, finirAnnulationLlm } from "../lib/tasks/cancellation-db";
import { CORPS_SANS_REFLEXION } from "../lib/llm/config";
import { modeleEffectifPourSkill } from "../lib/llm/model-chosen";
import { executerSkill } from "../lib/llm/execute";
import { AccumulateurFlux } from "../lib/llm/stream-partial";
import { insererTrace } from "../lib/llm/traces";
import { surveillerAnnulation } from "./cancellation";
import { limiteur } from "./comfyui/limiter";
import { postTraiterRun, surEchecRun } from "./agents/postProcessing";
import { preparerEntree, type DepsPreparation } from "./agents/preparation";
import { controleurPourSkill } from "../lib/llm/checks";
import { SKILL_REFERENCES_PLAN, TEMPERATURE_REFERENCES_PLAN } from "../lib/agents/references-clip";
import { executerH3ir, SKILL_H3IR, SKILL_TRADUCTION, type DepsH3ir } from "./h3ir";

// LLM task: a call to an agent skill placed in `agent_runs` (« llm » kind
// of the worker). Same contract as the images: a request is never replayed on its own
// (a call of several minutes is restarted by hand), and an unreachable LLM server
// consumes nothing: it stays pending.
//
// Cancellation cuts the HTTP connection (AbortSignal): llama.cpp stops generating.
// It is neither an error nor a reason to retry.

const INTERVALLE_PROGRESSION_MS = 1_000;

export type AgentRun = typeof agentRuns.$inferSelect;

/** The oldest pending call (FIFO), or null. The worker compares it with the
 * images and videos (worker/scheduler.ts) before choosing. A call whose options carry
 * `suspendu: true` is never taken on its own: the end-to-end tests
 * handle it themselves with a fake model, without racing against the dev worker. */
export async function prochaineTacheLlmEnAttente(): Promise<AgentRun | null> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.statut, "en_attente"), sql`coalesce(${agentRuns.options}->>'suspendu', 'false') <> 'true'`))
    // The steps of a request (iteration) first: see worker/scheduler.ts.
    .orderBy(sql`(${agentRuns.demandeId} is null)`, agentRuns.createdAt, agentRuns.id)
    .limit(1);
  return run ?? null;
}

/** The LLM server has been unreachable for too long: the pending calls fail (instead of waiting
 * indefinitely and blocking the conversation, `tacheActive`). Each one follows the path of an ordinary failure
 * (`surEchecRun`: batch finalised, conversation returned), and is restarted by hand. The `suspendu` calls (end-to-end
 * tests) are not touched. Returns their number. */
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

/** What can be injected to test without an LLM server (nor ffmpeg: `planche`, see worker/agents/preparation.ts). */
export type DepsLlm = {
  executer?: typeof executerSkill;
  /** Open H3 IR (worker/h3ir.ts): the executor itself, and its dependencies (brief, Python launcher…). */
  executerH3ir?: typeof executerH3ir;
  depsH3ir?: DepsH3ir;
} & DepsPreparation;

/** Processes a call (the server was probed just before by the worker loop). Returns `true` if it was taken (succeeded, failed or cancelled). */
export async function traiterTacheLlm(run: AgentRun, deps: DepsLlm = {}): Promise<boolean> {
  const executer = deps.executer ?? executerSkill;
  // Taking guarded by the status: a call cancelled in the meantime (direct cancellation
  // of a pending task) must not be revived.
  const prise = await db
    .update(agentRuns)
    .set({ statut: "en_cours", startedAt: new Date(), erreur: null })
    .where(and(eq(agentRuns.id, run.id), eq(agentRuns.statut, "en_attente")))
    .returning({ id: agentRuns.id });
  if (prise.length === 0) return true;

  const abandon = new AbortController();
  const surveillance = surveillerAnnulation(() => annulationDemandeeLlm(run.id));
  void surveillance.promesse.then(() => abandon.abort());

  // Writes are chained: never two concurrent UPDATEs on the row.
  const peutEcrire = limiteur(INTERVALLE_PROGRESSION_MS);
  const peutEcrireFlux = limiteur(INTERVALLE_PROGRESSION_MS);
  const flux = new AccumulateurFlux();
  let file: Promise<unknown> = Promise.resolve();
  const enfiler = (tache: () => Promise<unknown>) => {
    file = file.then(tache).catch(() => undefined);
  };

  let traceId: number | null = null;
  const options = (run.options ?? {}) as { modele?: string; variante?: string; sansReflexion?: boolean };
  const debut = Date.now();

  try {
    // Input specific to the skill, built AT EXECUTION (iteration-plan: contact sheet of the render, real
    // duration measured); a failure here (render gone, ffmpeg missing) makes the task fail with its message.
    const prep = await preparerEntree(run, { planche: deps.planche });
    // Open H3 IR (virtual skill `plan-h3ir`): brief → intent translation → Python compilation, instead of a skill call (worker/h3ir.ts).
    // The current step is written in place of the text stream, which the tasks panel displays.
    const res = run.skill === SKILL_H3IR
      ? await (deps.executerH3ir ?? executerH3ir)(
          run,
          {
            modele: options.modele ?? (await modeleEffectifPourSkill(SKILL_TRADUCTION)),
            signal: abandon.signal,
            enregistrer: async (trace) => {
              traceId = await insererTrace(trace);
            },
            surEtape: (texte) => enfiler(() => db.update(agentRuns).set({ fluxTexte: texte }).where(eq(agentRuns.id, run.id))),
          },
          deps.depsH3ir,
        )
      : await executer(run.skill, prep.entree, {
      projectId: run.projectId,
      // The model chosen in the header is read HERE, at the start of the call: a change applies to the following
      // calls, including those already queued. A task override takes precedence (re-run of a proposal).
      modele: options.modele ?? (await modeleEffectifPourSkill(run.skill)),
      // The interview notes classify and cite: little randomness, so that the same message gives the same sheet.
      // Choosing a clip's references also classifies and cites (lib/agents/references-clip.ts).
      temperature: run.skill === "notes-entretien" ? 0.1 : run.skill === SKILL_REFERENCES_PLAN ? TEMPERATURE_REFERENCES_PLAN : undefined,
      variante: options.variante,
      // A brief update starts again from a draft: the reasoning only served the first version.
      corps: options.sansReflexion ? CORPS_SANS_REFLEXION : undefined,
      controler: controleurPourSkill(run.skill, prep.controle),
      signal: abandon.signal,
      surProgres: (jetons) => {
        if (peutEcrire()) enfiler(() => db.update(agentRuns).set({ progressionJetons: jetons }).where(eq(agentRuns.id, run.id)));
      },
      // The text and the reasoning along the stream, to see them being written (at most one write per second).
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
    // The result becomes what it must be (conversation message, brief draft,
    // proposal changes) IN the same transaction as its write: if this
    // conversion fails, nothing is written and the task is marked failed.
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
    // Cancellation requested (then connection cut): a cancellation, not a failure.
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
