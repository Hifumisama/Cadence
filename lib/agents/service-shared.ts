/** Helpers shared by the service-*.ts files (lib/agents/service.ts was split by topic). */
import { type ButRun, tacheBloquante, type TacheBloquante } from "./runs";

/** Server logic of the agent system: conversations, brief, proposals. No dependency on
 * Next (the actions of app/agents/actions.ts are only wrappers): the trial script
 * and the tests call it directly. See app/agents/actions.ts for the contract. */

export const ERR = (erreur: string) => ({ ok: false as const, erreur });

/** The refusal "a task is already running": it NAMES the blocking task (and returns it) so the window
 * offers to cancel it, instead of a message with no handle (a task left pending blocks the whole conversation). */
export async function refusSiTacheActive(conversationId: number, message: string, buts?: ButRun[]) {
  const t = await tacheBloquante(conversationId, buts);
  if (!t) return null;
  const quoi = `${t.libelle ?? t.skill}, ${t.statut === "en_cours" ? "en cours" : "en attente"}`;
  return { ok: false as const, erreur: `${message} Tâche en cause : ${quoi}.`, bloquante: t as TacheBloquante };
}

// --- episode screenplays: a BATCH (one subtask per episode) -------------------

export const CONSIGNE_SCENARIO = "Écris le scénario complet de cet épisode.";

export const CONSIGNE_TRAITEMENT = "Découpe cet épisode en scènes : ce que chacune raconte, d'où elle part, où elle arrive.";

export const CONSIGNE_RELECTURE = "Relis le scénario de cet épisode et rends les plus petites corrections qui le rendent cohérent.";

export const CONSIGNE_REGISTRE = "Écris le prompt de génération de ce master (image de référence) à partir de sa description canonique.";

export const CONSIGNE_INVENTAIRE = "Dresse la liste des assets qui manquent au registre pour écrire les fiches de plan de ce projet.";

// --- step 3: clip sheets ------------------------------------------

export const CONSIGNE_FICHE = "Écris la fiche de plan complète.";
export const CONSIGNE_PROMPTS_CREES =
  "Écris le prompt de génération de cet asset (image de référence) à partir de sa description canonique ; s'il dérive d'un parent, pars de lui quand c'est pertinent.";

// --- preparation of a clip before its compilation (wave 4a, lib/h3ir/preparation.ts) ----------

export const CONSIGNE_REFERENCES = "Choisis les images de référence de ce plan (doute du choix automatique).";
