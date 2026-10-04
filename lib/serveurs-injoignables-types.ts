/** Serveurs que le worker a trouvés injoignables alors que des tâches les attendaient (écrit par
 * worker/disponibilite.ts ; `null` = joignable ou rien en attente). Valeur = instant ISO du début.
 * Sans dépendance serveur : le header (client) l'importe. */
export type ServeursInjoignables = { llm: string | null; comfyui: string | null };

export const SERVEURS_OK: ServeursInjoignables = { llm: null, comfyui: null };

export const LIBELLE_SERVEUR: Record<keyof ServeursInjoignables, string> = { llm: "Serveur LLM", comfyui: "ComfyUI" };
