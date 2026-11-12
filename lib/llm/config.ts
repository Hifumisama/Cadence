import type { FournisseurLlm } from "./types";
import { FournisseurCompatibleOpenAI } from "./compatibleOpenAI";

/** Configuration through environment variables (see .env.example). Read at
 * call time, never at import: the Next.js build collects modules before the
 * runtime environment exists. */

const MODELE_LOCAL_PAR_DEFAUT = "gemma4-26b-A4B";
const URL_LOCALE_PAR_DEFAUT = "http://localhost:8080";
const DELAI_PAR_DEFAUT_MS = 10 * 60 * 1000;
/** Maximum silence of a stream (loading a model or a long prefill returns nothing). */
const INACTIVITE_PAR_DEFAUT_MS = 5 * 60 * 1000;
/** After this much unreachability, pending calls fail (instead of waiting indefinitely). */
const INJOIGNABLE_MAX_PAR_DEFAUT_MS = 5 * 60 * 1000;

export type Env = Record<string, string | undefined>;

export type ConfigLlm = {
  fournisseur: "local";
  url: string;
  modeleParDefaut: string;
  delaiMs: number;
  inactiviteMs: number;
  /** Route tested before taking a call (`/health` on llama-swap; `/v1/models` for LM Studio, Ollama…). */
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
    // « claude » will come behind the same interface (see docs/CONCEPTION_AGENTS.md);
    // until then an unknown value fails clearly rather than falling back to local.
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
    // The stream prevents a reverse proxy from cutting a silent connection during
    // a long generation; « 0 » disables it.
    flux: env.LLM_FLUX !== "0",
  };
}

/** `prompt-asset` → `LLM_MODELE_PROMPT_ASSET`. */
export function nomVariableModele(skill: string): string {
  return `LLM_MODELE_${skill.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/** Key of `parametres` where the interface (header badge) stores the chosen model. */
export const CLE_MODELE_CHOISI = "llm_modele";

/** Model of a skill, by priority: override `LLM_MODELE_<SKILL>` (a deliberate configuration choice, per
 * skill), then the model chosen in the interface (`choisi`, read from the database by the caller), then `LLM_LOCAL_MODELE`. */
export function modelePourSkill(skill: string, env: Env = process.env, choisi?: string | null): string {
  return env[nomVariableModele(skill)]?.trim() || choisi?.trim() || configLlm(env).modeleParDefaut;
}

function suffixeSkill(skill: string): string {
  return skill.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** All skills go WITHOUT reasoning until a variable says otherwise. Measured on gemma-4 (2026-10-07): to translate a description into a prompt, reasoning
 * weighed ~90 % of the output tokens (1,500 tokens for a 130-token answer, 30 s instead of 1). Measured on Swift (traces 2026-10-26): one skill
 * produced ~26,000 characters of reasoning for 4,500 of output (110 s per clip), scenario-episode 151 s, relecture-scenario 131 s, and an
 * iteration-plan hit the 600 s timeout without returning anything. The flag is honoured by the server (`reasoning_budget`, on the other hand, is not).
 * To restore a skill's reasoning: `LLM_CORPS_<SKILL>={}`. */
export const CORPS_SANS_REFLEXION = { chat_template_kwargs: { enable_thinking: false } };

/** Fields added to the request body for a skill: `LLM_CORPS_<SKILL>` otherwise `LLM_CORPS`, as JSON (`{}` to restore a skill's
 * reasoning), otherwise the default: reasoning cut.
 * Mainly used to set the model's REASONING (e.g. `{"chat_template_kwargs":{"enable_thinking":false}}`):
 * its reasoning tokens count towards `max_tokens` and lengthen the call a lot. An invalid JSON
 * is a clear error (never silently ignored). */
export function corpsPourSkill(skill: string, env: Env = process.env): Record<string, unknown> | undefined {
  const nom = `LLM_CORPS_${suffixeSkill(skill)}`;
  const brut = env[nom]?.trim() || env.LLM_CORPS?.trim();
  if (!brut) return CORPS_SANS_REFLEXION;
  try {
    const v = JSON.parse(brut) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("un objet JSON est attendu");
    return v as Record<string, unknown>;
  } catch (e) {
    throw new Error(`${env[nom]?.trim() ? nom : "LLM_CORPS"} n'est pas un objet JSON valide : ${(e as Error).message}`);
  }
}

/** Output token cap specific to a skill when no variable sets it. A conversation turn fits in ~600 tokens: beyond that, it is a
 * repetition loop (observed 2026-10-10, trace 755: 2 × 16,384 tokens, 10 minutes). A low cap cuts it off quickly. */
const MAX_TOKENS_PAR_DEFAUT_SKILL: Readonly<Record<string, number>> = {
  "conversation-agent": 3000,
  // ≤ 300 expected tokens (6 references, 2 missing): beyond 800, the small skill loops.
  "references-plan": 800,
};

/** Output token limit of a skill: `LLM_MAX_TOKENS_<SKILL>` otherwise `LLM_MAX_TOKENS`, otherwise the skill's default
 * (`MAX_TOKENS_PAR_DEFAUT_SKILL`), otherwise null (the executor's default applies). */
export function maxTokensPourSkill(skill: string, env: Env = process.env): number | null {
  const brut = env[`LLM_MAX_TOKENS_${suffixeSkill(skill)}`]?.trim() || env.LLM_MAX_TOKENS?.trim();
  if (!brut) return MAX_TOKENS_PAR_DEFAUT_SKILL[skill] ?? null;
  const n = Number(brut);
  if (!Number.isInteger(n) || n < 256) throw new Error(`LLM_MAX_TOKENS doit être un entier d'au moins 256 (reçu « ${brut} »).`);
  return n;
}

export function creerFournisseur(env: Env = process.env): FournisseurLlm {
  const c = configLlm(env);
  return new FournisseurCompatibleOpenAI({ url: c.url, modele: c.modeleParDefaut, delaiMs: c.delaiMs, inactiviteMs: c.inactiviteMs, flux: c.flux });
}
