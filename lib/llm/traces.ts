import { db } from "../../db";
import { agentTraces } from "../../db/schema";
import type { MessageLlm } from "./types";

export const STATUTS_TRACE = ["ok", "invalide", "echoue", "interrompu"] as const;
export type StatutTrace = (typeof STATUTS_TRACE)[number];

/** Ce que `executerSkill` journalise : tout ce qu'il faut pour rejouer ou juger
 * une exécution (docs/CONCEPTION_AGENTS.md §7 et §10). */
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
  /** Raisonnement du modèle (`reasoning_content`), s'il en émet un. */
  reflexion?: string | null;
  json: unknown | null;
  erreursValidation: string[] | null;
  erreur: string | null;
  renvois: number;
  tokensEntree: number;
  tokensSortie: number;
  /** Jetons du prompt repris du cache du serveur / préremplis pour cet appel (llama.cpp) ; null si le serveur ne le dit pas. */
  tokensCache?: number | null;
  tokensPrefill?: number | null;
  dureeMs: number;
};

export type EnregistreurTrace = (trace: TraceAEnregistrer) => Promise<void>;

/** Le nom du modèle tel que la colonne (80 caractères) le garde : llama-server renvoie parfois le CHEMIN du fichier GGUF (95 caractères
 * pour Swift, 2026-10-19), ce qui faisait échouer l'insertion de toutes les traces sans bruit. On garde le nom du fichier. */
export function nomModeleCourt(modele: string): string {
  return (modele.split(/[\\/]/).pop() || modele).slice(0, 80);
}

/** Insère une trace dans `agent_traces` et renvoie son id (la tâche de la file,
 * agent_runs, s'y rattache : worker/llm.ts). */
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

/** Enregistreur par défaut : une ligne dans `agent_traces`. */
export const enregistrerTrace: EnregistreurTrace = async (t) => {
  await insererTrace(t);
};
