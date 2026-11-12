import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dureesCoherentes } from "../../lib/agents/iteration-clip";
import { MEDIA_ROOT } from "../../lib/media";
import { contenuPlanche, ErreurPlanche, extrairePlanche, type Planche } from "../../lib/renders/contact-sheet";
import type { MessageLlm } from "../../lib/llm/types";


import { agentRuns } from "../../db/schema";



/** « Préparer l'entrée » of an LLM task, AT THE MOMENT of execution (worker/llm.ts), specific to each skill. By
 * default the stored input (agent_runs.entree) goes as is. For `iteration-plan`, the stored input only carries a DESCRIPTOR of the render
 * (`planche`: job, path relative to MEDIA_ROOT, thumbnail cap): never images in the database. Here, we rebuild the contact sheet (ffprobe + ffmpeg),
 * we measure the real duration of the file, and we produce the `MessageLlm[]` (text + thumbnails). A missing render or an absent ffmpeg: the task
 * FAILS with a clear message, never an empty contact sheet nor a contact sheet promised then absent. The contact sheet is only requested on an
 * explicit action (« Montrer au chef opérateur », « Analyser »); without a descriptor, the input goes without render or ffmpeg. */

type RunAgent = typeof agentRuns.$inferSelect;

/** What getting a render's contact sheet costs: injectable (attempts without ffmpeg). */
type LecteurPlanche = (cheminAbsolu: string, maxVignettes: number) => Promise<Planche>;

export type DepsPreparation = { planche?: LecteurPlanche };

/** What execution needs: the model's input, that of the semantic checker (text only), and what the
 * post-processing must know about the execution (measured duration…). */
export type EntreePreparee = {
  entree: string | object | MessageLlm[];
  controle: unknown;
  execution?: InfosExecution;
};

export type InfosExecution = { dureeReelleSecondes?: number; nbVignettes?: number };

const lirePlancheParDefaut: LecteurPlanche = async (chemin, max) => {
  if (!existsSync(chemin)) {
    throw new Error(`Le rendu de ce plan est introuvable sur le stockage (${chemin}) : régénère ou réimporte la vidéo, regarde-la, puis relance la correction.`);
  }
  return extrairePlanche(chemin, { max });
};

type DescripteurPlanche = { jobId?: number; cheminSortie?: string; maxVignettes?: number };

const arrondi = (n: number) => Math.round(n * 100) / 100;

export async function preparerEntree(run: RunAgent, deps: DepsPreparation = {}): Promise<EntreePreparee> {
  if (run.skill === "iteration-plan") return preparerIteration(run, deps);
  return { entree: run.entree as string | object, controle: run.entree };
}

async function preparerIteration(run: RunAgent, deps: DepsPreparation): Promise<EntreePreparee> {
  const stockee = (run.entree ?? {}) as Record<string, unknown> & { planche?: DescripteurPlanche; plan?: { dureeVoulueSecondes?: number } };
  // The agent no longer writes a prompt (2026-11-09): the control has no translation to check any more; it receives the same input as the model (text only).
  const pourLeControle = <T extends object>(e: T): T => e;
  const d = stockee.planche;
  // Without a descriptor: the contact sheet was not requested (never automatic, 2026-10-12). The agent works from the instruction and the current
  // sheet: the stored input goes as is, without `rendu` nor measured duration (the real-duration guards are then irrelevant).
  if (!d) return { entree: stockee, controle: pourLeControle(stockee) };
  if (!d.cheminSortie) throw new Error("Entrée d'iteration-plan : descripteur de planche sans chemin de rendu. Relance l'analyse depuis la page du plan.");
  const chemin = resolve(MEDIA_ROOT, d.cheminSortie);
  let planche: Planche;
  try {
    planche = await (deps.planche ?? lirePlancheParDefaut)(chemin, d.maxVignettes ?? 15);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(e instanceof ErreurPlanche ? `Planche de vignettes impossible : ${message}` : message);
  }
  if (planche.vignettes.length === 0) throw new Error(`Planche de vignettes vide pour ${d.cheminSortie} : pas de diagnostic sans images.`);

  const voulue = stockee.plan?.dureeVoulueSecondes ?? 0;
  const { planche: _descripteur, ...reste } = stockee;
  void _descripteur;
  const texte = {
    ...reste,
    rendu: {
      dureeVoulueSecondes: voulue,
      dureeReelleSecondes: arrondi(planche.dureeSecondes),
      ecartSecondes: arrondi(planche.dureeSecondes - voulue),
      dureesCoherentes: dureesCoherentes(voulue, planche.dureeSecondes),
      nbVignettes: planche.vignettes.length,
    },
  };
  const messages: MessageLlm[] = [
    {
      role: "user",
      content: [{ type: "text", text: JSON.stringify(texte, null, 2) }, ...contenuPlanche(planche)],
    },
  ];
  return { entree: messages, controle: pourLeControle(texte), execution: { dureeReelleSecondes: arrondi(planche.dureeSecondes), nbVignettes: planche.vignettes.length } };
}
