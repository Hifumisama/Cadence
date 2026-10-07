import type { FournisseurLlm } from "./types";
import { FournisseurCompatibleOpenAI } from "./compatibleOpenAI";

/** Configuration par variables d'environnement (voir .env.example). Lue à
 * l'appel, jamais à l'import : le build Next.js collecte les modules avant que
 * l'environnement runtime existe. */

export const MODELE_LOCAL_PAR_DEFAUT = "gemma4-26b-A4B";
export const URL_LOCALE_PAR_DEFAUT = "http://localhost:8080";
export const DELAI_PAR_DEFAUT_MS = 10 * 60 * 1000;
/** Silence maximal d'un flux (le chargement d'un modèle ou un long préremplissage ne renvoient rien). */
export const INACTIVITE_PAR_DEFAUT_MS = 5 * 60 * 1000;
/** Au bout de ce temps d'injoignabilité, les appels en attente échouent (au lieu d'attendre indéfiniment). */
export const INJOIGNABLE_MAX_PAR_DEFAUT_MS = 5 * 60 * 1000;

export type Env = Record<string, string | undefined>;

export type ConfigLlm = {
  fournisseur: "local";
  url: string;
  modeleParDefaut: string;
  delaiMs: number;
  inactiviteMs: number;
  /** Route testée avant de prendre un appel (`/health` chez llama-swap ; `/v1/models` pour LM Studio, Ollama…). */
  routeSante: string;
  injoignableMaxMs: number;
  flux: boolean;
};

function dureeMs(brut: string | undefined, defaut: number): number {
  const n = Number(brut);
  return brut?.trim() && Number.isFinite(n) && n >= 0 ? n : defaut;
}

export function configLlm(env: Env = process.env): ConfigLlm {
  const fournisseur = (env.LLM_FOURNISSEUR ?? "local").trim();
  if (fournisseur !== "local") {
    // « claude » viendra derrière la même interface (voir docs/CONCEPTION_AGENTS.md) ;
    // d'ici là une valeur inconnue échoue franchement plutôt que de retomber sur le local.
    throw new Error(`LLM_FOURNISSEUR inconnu : « ${fournisseur} » (seul « local » est branché).`);
  }
  const delai = Number(env.LLM_TIMEOUT_MS);
  return {
    fournisseur: "local",
    url: (env.LLM_LOCAL_URL?.trim() || URL_LOCALE_PAR_DEFAUT).replace(/\/+$/, ""),
    modeleParDefaut: env.LLM_LOCAL_MODELE?.trim() || MODELE_LOCAL_PAR_DEFAUT,
    delaiMs: Number.isFinite(delai) && delai > 0 ? delai : DELAI_PAR_DEFAUT_MS,
    inactiviteMs: dureeMs(env.LLM_INACTIVITE_MS, INACTIVITE_PAR_DEFAUT_MS),
    routeSante: `/${(env.LLM_HEALTH_PATH?.trim() || "/health").replace(/^\/+/, "")}`,
    injoignableMaxMs: dureeMs(env.LLM_INJOIGNABLE_MAX_MS, INJOIGNABLE_MAX_PAR_DEFAUT_MS),
    // Le flux évite qu'un reverse proxy coupe une connexion silencieuse pendant
    // une longue génération ; « 0 » le désactive.
    flux: env.LLM_FLUX !== "0",
  };
}

/** `plan-h3` → `LLM_MODELE_PLAN_H3`. */
export function nomVariableModele(skill: string): string {
  return `LLM_MODELE_${skill.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/** Clé de `parametres` où l'interface (pastille du header) range le modèle choisi. */
export const CLE_MODELE_CHOISI = "llm_modele";

/** Modèle d'un skill, par ordre de priorité : surcharge `LLM_MODELE_<SKILL>` (un choix de configuration délibéré, par
 * skill), puis le modèle choisi dans l'interface (`choisi`, lu en base par l'appelant), puis `LLM_LOCAL_MODELE`. */
export function modelePourSkill(skill: string, env: Env = process.env, choisi?: string | null): string {
  return env[nomVariableModele(skill)]?.trim() || choisi?.trim() || configLlm(env).modeleParDefaut;
}

function suffixeSkill(skill: string): string {
  return skill.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Skills qui partent SANS réflexion tant qu'aucune variable ne dit le contraire. Mesuré sur gemma-4 (2026-10-07) : pour
 * traduire une description en prompt, la réflexion pesait ~90 % des jetons de sortie (1 500 jetons pour une réponse de 130,
 * 30 s au lieu de 1). Le drapeau est honoré par le serveur (`reasoning_budget`, lui, ne l'est pas). `conversation-agent` : un
 * tour de dialogue doit rester vif. À étendre skill par skill, après un essai de qualité. */
export const SKILLS_SANS_REFLEXION: readonly string[] = ["prompt-asset", "prompt-voix", "prompt-affiche", "conversation-agent", "notes-entretien"];
export const CORPS_SANS_REFLEXION = { chat_template_kwargs: { enable_thinking: false } };

/** Champs ajoutés au corps de la requête pour un skill : `LLM_CORPS_<SKILL>` sinon `LLM_CORPS`, en JSON (`{}` pour rétablir
 * la réflexion d'un skill de `SKILLS_SANS_REFLEXION`), sinon le défaut du skill.
 * Sert surtout à régler la RÉFLEXION du modèle (ex. `{"chat_template_kwargs":{"enable_thinking":false}}`) :
 * ses jetons de réflexion comptent dans `max_tokens` et allongent beaucoup l'appel. Un JSON invalide
 * est une erreur franche (jamais ignoré en silence). */
export function corpsPourSkill(skill: string, env: Env = process.env): Record<string, unknown> | undefined {
  const nom = `LLM_CORPS_${suffixeSkill(skill)}`;
  const brut = env[nom]?.trim() || env.LLM_CORPS?.trim();
  if (!brut) return SKILLS_SANS_REFLEXION.includes(skill) ? CORPS_SANS_REFLEXION : undefined;
  try {
    const v = JSON.parse(brut) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("un objet JSON est attendu");
    return v as Record<string, unknown>;
  } catch (e) {
    throw new Error(`${env[nom]?.trim() ? nom : "LLM_CORPS"} n'est pas un objet JSON valide : ${(e as Error).message}`);
  }
}

/** Limite de jetons de sortie d'un skill : `LLM_MAX_TOKENS_<SKILL>` sinon `LLM_MAX_TOKENS`, sinon null
 * (le défaut de l'exécuteur s'applique). */
export function maxTokensPourSkill(skill: string, env: Env = process.env): number | null {
  const brut = env[`LLM_MAX_TOKENS_${suffixeSkill(skill)}`]?.trim() || env.LLM_MAX_TOKENS?.trim();
  if (!brut) return null;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 256) throw new Error(`LLM_MAX_TOKENS doit être un entier d'au moins 256 (reçu « ${brut} »).`);
  return n;
}

export function creerFournisseur(env: Env = process.env): FournisseurLlm {
  const c = configLlm(env);
  return new FournisseurCompatibleOpenAI({ url: c.url, modele: c.modeleParDefaut, delaiMs: c.delaiMs, inactiviteMs: c.inactiviteMs, flux: c.flux });
}
