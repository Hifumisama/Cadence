import type { FournisseurLlm } from "./types";
import { FournisseurCompatibleOpenAI } from "./compatibleOpenAI";

/** Configuration par variables d'environnement (voir .env.example). Lue à
 * l'appel, jamais à l'import : le build Next.js collecte les modules avant que
 * l'environnement runtime existe. */

export const MODELE_LOCAL_PAR_DEFAUT = "gemma4-26b-A4B";
export const URL_LOCALE_PAR_DEFAUT = "http://localhost:8080";
export const DELAI_PAR_DEFAUT_MS = 10 * 60 * 1000;

export type Env = Record<string, string | undefined>;

export type ConfigLlm = {
  fournisseur: "local";
  url: string;
  modeleParDefaut: string;
  delaiMs: number;
  flux: boolean;
};

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
    // Le flux évite qu'un reverse proxy coupe une connexion silencieuse pendant
    // une longue génération ; « 0 » le désactive.
    flux: env.LLM_FLUX !== "0",
  };
}

/** `plan-h3` → `LLM_MODELE_PLAN_H3`. */
export function nomVariableModele(skill: string): string {
  return `LLM_MODELE_${skill.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

/** Modèle d'un skill : surcharge `LLM_MODELE_<SKILL>`, sinon le modèle par défaut. */
export function modelePourSkill(skill: string, env: Env = process.env): string {
  return env[nomVariableModele(skill)]?.trim() || configLlm(env).modeleParDefaut;
}

export function creerFournisseur(env: Env = process.env): FournisseurLlm {
  const c = configLlm(env);
  return new FournisseurCompatibleOpenAI({ url: c.url, modele: c.modeleParDefaut, delaiMs: c.delaiMs, flux: c.flux });
}
