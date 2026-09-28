/** Étiquette de lecture non ambiguë pour un plan hors du contexte d'un
 * épisode déjà connu (ex. "E01_P010") — jamais stockée, jamais un vrai
 * identifiant : `plans.id` reste la seule clé technique. `numero` seul
 * suffit à l'intérieur d'un même épisode (c'est sa portée d'unicité réelle,
 * voir db/schema.ts) mais redevient ambigu dès qu'on le montre à côté d'un
 * plan d'un autre épisode — voir docs/FRICTIONS.md F03 (révision
 * 2026-09-28). */
export function planLabel(episodeNumero: number, planNumero: number): string {
  return `E${String(episodeNumero).padStart(2, "0")}_P${String(planNumero).padStart(3, "0")}`;
}
