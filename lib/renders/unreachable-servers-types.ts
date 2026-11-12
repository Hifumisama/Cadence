/** Servers that the worker found unreachable while tasks were waiting for them (written by
 * worker/availability.ts; `null` = reachable or nothing waiting). Value = ISO instant of the start.
 * No server dependency: the header (client) imports it. */
export type ServeursInjoignables = { llm: string | null; comfyui: string | null };

export const SERVEURS_OK: ServeursInjoignables = { llm: null, comfyui: null };

export const LIBELLE_SERVEUR: Record<keyof ServeursInjoignables, string> = { llm: "Serveur LLM", comfyui: "ComfyUI" };
