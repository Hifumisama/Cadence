/** Brique LLM : une interface unique, derrière laquelle on branche un modèle
 * local (serveur compatible OpenAI) aujourd'hui, l'API Claude plus tard. Voir
 * docs/CONCEPTION_AGENTS.md §9. Aucune dépendance à Next, à la base ni au disque
 * ici : ces types servent aussi au worker. */

export type RoleLlm = "system" | "user" | "assistant";
/** Contenu mixte au format OpenAI (texte + images). Une image passe en URL `data:` (base64) :
 * le serveur local n'a pas accès au disque de Cadence. llama.cpp exige un projecteur `mmproj`
 * chargé avec le modèle, sinon il refuse la requête (« vision_absente »). */
export type PartieTexte = { type: "text"; text: string };
export type PartieImage = { type: "image_url"; image_url: { url: string } };
export type PartieContenu = PartieTexte | PartieImage;
/** Une chaîne (cas courant, inchangé) ou une liste de parties texte/image. */
export type ContenuLlm = string | PartieContenu[];
export type MessageLlm = { role: Exclude<RoleLlm, "system">; content: ContenuLlm };

/** Partie image JPEG à partir de son base64 brut (sans préfixe `data:`). */
export function partieImageJpeg(base64: string): PartieImage {
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } };
}

/** Taille décodée (octets) d'une URL `data:…;base64,` ; 0 si ce n'en est pas une. */
function octetsDataUrl(url: string): number {
  const i = url.indexOf(";base64,");
  if (!url.startsWith("data:") || i < 0) return 0;
  const b64 = url.slice(i + 8);
  const rembourrage = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - rembourrage);
}

/** Copie des messages SANS les images, pour la trace (`agent_traces.messages`) : chaque image
 * devient un marqueur texte `[image 3 : 41 Ko]` (numérotée sur toute la conversation). Une
 * planche de 15 vignettes pèse ~0,5 Mo de base64 : elle n'a rien à faire en base. Une URL
 * http(s) est gardée telle quelle (elle ne pèse rien et reste rejouable). */
export function messagesSansImages(messages: MessageLlm[]): MessageLlm[] {
  let n = 0;
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    const content = m.content.map((p): PartieContenu => {
      if (p.type !== "image_url") return p;
      n += 1;
      const url = p.image_url.url;
      if (!url.startsWith("data:")) return { type: "text", text: `[image ${n} : ${url}]` };
      return { type: "text", text: `[image ${n} : ${Math.max(1, Math.round(octetsDataUrl(url) / 1024))} Ko]` };
    });
    return { ...m, content };
  });
}

/** Le texte seul d'un contenu (les images sont ignorées). */
export function texteDuContenu(contenu: ContenuLlm): string {
  if (typeof contenu === "string") return contenu;
  return contenu.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
}

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
  | "vision_absente"
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
