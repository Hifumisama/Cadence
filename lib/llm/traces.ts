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
  json: unknown | null;
  erreursValidation: string[] | null;
  erreur: string | null;
  renvois: number;
  tokensEntree: number;
  tokensSortie: number;
  dureeMs: number;
};

export type EnregistreurTrace = (trace: TraceAEnregistrer) => Promise<void>;

/** Enregistreur par défaut : une ligne dans `agent_traces`. */
export const enregistrerTrace: EnregistreurTrace = async (t) => {
  await db.insert(agentTraces).values({
    skill: t.skill,
    fournisseur: t.fournisseur,
    modele: t.modele,
    statut: t.statut,
    projectId: t.projectId,
    messages: t.messages,
    systemeEmpreinte: t.systemeEmpreinte,
    systemeCaracteres: t.systemeCaracteres,
    sortieBrute: t.sortieBrute,
    json: t.json,
    erreursValidation: t.erreursValidation,
    erreur: t.erreur,
    renvois: t.renvois,
    tokensEntree: t.tokensEntree,
    tokensSortie: t.tokensSortie,
    dureeMs: t.dureeMs,
  });
};
