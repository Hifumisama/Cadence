/** Cartes de choix du scénariste (`choix` dans la sortie de `conversation-agent`). Pur : utilisé par le worker (lecture de la sortie),
 * le service (contrôle de la réponse) et l'écran. Une sortie mal formée n'est JAMAIS une erreur : `normaliserChoix` rend null, le tour
 * s'affiche avec son seul texte. */

import type { Choix, MessageConversation, OptionChoix } from "./types";

export const CHOIX_MIN = 2;
export const CHOIX_MAX = 4;
export const LIBELLE_DECIDER = "Je te laisse décider";
const MAX_QUESTION = 200;
const MAX_LIBELLE = 60;
const MAX_DESCRIPTION = 160;

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Vrai pour l'option de délégation (« Je te laisse décider », à la casse et aux accents près). */
export const estDecider = (libelle: string): boolean => sansAccents(libelle).includes("je te laisse decider");

const texte = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max).trimEnd() : t;
};

/** Valide et normalise une sortie `choix`. Rend null si la forme est invalide (on ignore alors le choix, sans rien signaler). Règles :
 * `multiple` booléen ; 2 à 4 options ; libellé non vide de 60 caractères au plus, sans doublon ; une option « Je te laisse décider » ;
 * description facultative (tronquée) ; question facultative (ignorée si elle n'est pas du texte). */
export function normaliserChoix(v: unknown): Choix | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const brut = v as { question?: unknown; multiple?: unknown; options?: unknown };
  if (typeof brut.multiple !== "boolean") return null;
  if (!Array.isArray(brut.options) || brut.options.length < CHOIX_MIN || brut.options.length > CHOIX_MAX) return null;

  const options: OptionChoix[] = [];
  for (const o of brut.options) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const libelleBrut = (o as { libelle?: unknown }).libelle;
    const libelle = typeof libelleBrut === "string" ? libelleBrut.trim() : "";
    if (!libelle || libelle.length > MAX_LIBELLE) return null;
    if (options.some((x) => x.libelle.toLowerCase() === libelle.toLowerCase())) return null;
    const description = texte((o as { description?: unknown }).description, MAX_DESCRIPTION);
    options.push(description ? { libelle, description } : { libelle });
  }
  if (!options.some((o) => estDecider(o.libelle))) return null;

  const question = texte(brut.question, MAX_QUESTION);
  return question ? { question, multiple: brut.multiple, options } : { multiple: brut.multiple, options };
}

/** Une réponse par cartes est-elle acceptable pour ce choix ? Choix simple : une seule option. Choix multiple : au moins une, et
 * « Je te laisse décider » seule (elle ne se mélange pas aux autres). */
export function selectionValide(choix: Choix, libelles: string[]): boolean {
  if (libelles.length === 0 || new Set(libelles).size !== libelles.length) return false;
  if (!libelles.every((l) => choix.options.some((o) => o.libelle === l))) return false;
  if (!choix.multiple) return libelles.length === 1;
  return !libelles.some(estDecider) || libelles.length === 1;
}

/** Le texte envoyé au scénariste pour une réponse par cartes : le libellé, ou les libellés cochés, dans l'ordre des options. */
export function formulerReponse(choix: Choix, libelles: string[]): string {
  return choix.options.map((o) => o.libelle).filter((l) => libelles.includes(l)).join(", ");
}

/** Le choix du DERNIER message de l'agent, s'il n'est suivi d'aucun message : seul cas où les cartes répondent encore. */
export function choixActif(messages: MessageConversation[]): Choix | null {
  const dernier = messages[messages.length - 1];
  return dernier && dernier.role === "assistant" && dernier.choix ? dernier.choix : null;
}
