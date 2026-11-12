import { db } from "../../db";
import { agentTraces } from "../../db/schema";
import type { MessageLlm } from "./types";

const STATUTS_TRACE = ["ok", "invalide", "echoue", "interrompu"] as const;
export type StatutTrace = (typeof STATUTS_TRACE)[number];

/** What `executerSkill` logs: everything needed to replay or judge
 * an execution (docs/CONCEPTION_AGENTS.md §7 and §10). */
export type TraceAEnregistrer = {
  skill: string;
  fournisseur: string;
  modele: string;
  statut: StatutTrace;
  projectId: number | null;
  messages: MessageLlm[];
  systemeEmpreinte: string;
  systemeCaracteres: number;
  sortieBrute: string | null;
  /** The model's reasoning (`reasoning_content`), if it emits one. */
  reflexion?: string | null;
  json: unknown | null;
  erreursValidation: string[] | null;
  erreur: string | null;
  renvois: number;
  tokensEntree: number;
  tokensSortie: number;
  /** Prompt tokens taken from the server's cache / prefilled for this call (llama.cpp); null if the server does not say so. */
  tokensCache?: number | null;
  tokensPrefill?: number | null;
  dureeMs: number;
};

export type EnregistreurTrace = (trace: TraceAEnregistrer) => Promise<void>;

/** The model name as the column (80 characters) keeps it: llama-server sometimes returns the PATH of the GGUF file (95 characters
 * for Swift, 2026-10-19), which made the insertion of all traces fail silently. We keep the file name. */
export function nomModeleCourt(modele: string): string {
  return (modele.split(/[\\/]/).pop() || modele).slice(0, 80);
}

/** Inserts a trace into `agent_traces` and returns its id (the queue task,
 * agent_runs, attaches to it: worker/llm.ts). */
export async function insererTrace(t: TraceAEnregistrer): Promise<number> {
  const [ligne] = await db.insert(agentTraces).values({
    skill: t.skill,
    fournisseur: t.fournisseur,
    modele: nomModeleCourt(t.modele),
    statut: t.statut,
    projectId: t.projectId,
    messages: t.messages,
    systemeEmpreinte: t.systemeEmpreinte,
    systemeCaracteres: t.systemeCaracteres,
    sortieBrute: t.sortieBrute,
    reflexion: t.reflexion ?? null,
    json: t.json,
    erreursValidation: t.erreursValidation,
    erreur: t.erreur,
    renvois: t.renvois,
    tokensEntree: t.tokensEntree,
    tokensSortie: t.tokensSortie,
    tokensCache: t.tokensCache ?? null,
    tokensPrefill: t.tokensPrefill ?? null,
    dureeMs: t.dureeMs,
  }).returning({ id: agentTraces.id });
  return ligne!.id;
}

/** Default logger: a row in `agent_traces`. */
export const enregistrerTrace: EnregistreurTrace = async (t) => {
  await insererTrace(t);
};
