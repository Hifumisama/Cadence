/** Brique LLM : une interface unique, derrière laquelle on branche un modèle
 * local (serveur compatible OpenAI) aujourd'hui, l'API Claude plus tard. Voir
 * docs/CONCEPTION_AGENTS.md §9. Aucune dépendance à Next, à la base ni au disque
 * ici : ces types servent aussi au worker. */

export type RoleLlm = "system" | "user" | "assistant";
export type MessageLlm = { role: Exclude<RoleLlm, "system">; content: string };

export type DemandeLlm = {
  /** Prompt système (le skill assemblé). */
  systeme: string;
  messages: MessageLlm[];
  /** Schéma JSON (draft 2020-12) : le fournisseur contraint la sortie quand il le sait. */
  schemaSortie?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  /** Coupe la connexion : le serveur arrête de générer. */
  signal?: AbortSignal;
  /** Modèle visé ; sinon celui de la configuration. */
  modele?: string;
  /** Reçoit le nombre de jetons de sortie reçus au fil de l'eau (progression). */
  surProgres?: (jetonsSortie: number) => void;
  /** Reçoit le TEXTE au fil du flux : `debut` à l'ouverture de chaque appel (un renvoi en ouvre un nouveau),
   * puis `reflexion` (reasoning_content) et `texte` (la réponse). Sert aux essais en direct. */
  surFlux?: (evenement: { type: "debut" | "reflexion" | "texte"; texte: string }) => void;
  /** Champs ajoutés tels quels au corps de la requête, pour CET appel (ex. couper la réflexion :
   * `{ chat_template_kwargs: { enable_thinking: false } }`). Voir `LLM_CORPS` dans lib/llm/config.ts. */
  corps?: Record<string, unknown>;
};

export type ReponseLlm = {
  texte: string;
  /** Le texte parsé, si une sortie JSON était attendue et qu'elle est du JSON valide. */
  json?: unknown;
  usage: { entree: number; sortie: number };
  dureeMs: number;
  modele: string;
  /** Raison d'arrêt du serveur (`stop`, `length` = sortie tronquée par max_tokens…). */
  arret?: string;
  /** Réponse brute du serveur (dernier message ou assemblage du flux), pour la trace. */
  brut: unknown;
};

export interface FournisseurLlm {
  readonly nom: string;
  generer(demande: DemandeLlm): Promise<ReponseLlm>;
}

export type CodeErreurLlm =
  | "injoignable"
  | "modele_absent"
  | "sortie_invalide"
  | "interrompu"
  | "delai"
  | "flux_coupe"
  | "http";

/** Erreur typée : l'appelant (et la trace) distingue « le serveur est éteint »
 * de « le modèle n'existe pas » de « il a répondu n'importe quoi ». */
export class ErreurLlm extends Error {
  constructor(
    readonly code: CodeErreurLlm,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ErreurLlm";
  }
}
