/** Budget de contexte du serveur LLM, pour les appels en parallèle.
 *
 * Avec un cache KV unifié (llama.cpp `--parallel N`), les N appels se partagent UN contexte (`--ctx-size`). Trois `plan-h3` de 15 000 jetons plus leur
 * sortie débordent : le serveur répond « Context size has been exceeded » et coupe les flux des autres appels. Le worker n'envoie donc un appel que si la somme
 * estimée (entrée + sortie attendue) des appels en vol tient dans `LLM_CONTEXTE_TOTAL`. Un appel seul passe toujours (même démesuré : le serveur tranche).
 * Sans `LLM_CONTEXTE_TOTAL`, aucune limite. Pur, testé. */

/** Sortie attendue par skill (jetons), un peu au-dessus de ce qu'on a mesuré en moyenne. */
const SORTIE_ATTENDUE: Record<string, number> = {
  "plan-h3": 3500,
  "scenario-scene": 2500,
  "traitement-episode": 3000,
  "scenario-episode": 8000,
  "relecture-scenario": 5000,
  "inventaire-assets": 4000,
  "prompt-asset": 800,
  "iteration-plan": 2000,
};
const SORTIE_PAR_DEFAUT = 2000;

/** Jetons qu'un appel occupera dans le contexte : le skill (instructions, exemples), l'entrée, la sortie attendue. */
export function estimerContexte(skill: string, jetonsSkill: number, entree: unknown): number {
  const json = typeof entree === "string" ? entree : JSON.stringify(entree ?? {});
  return jetonsSkill + Math.ceil(json.length / 4) + (SORTIE_ATTENDUE[skill] ?? SORTIE_PAR_DEFAUT);
}

export class BudgetContexte {
  private enVol = new Map<number, number>();

  constructor(private readonly total: number | null) {}

  /** Réserve la place de l'appel `id` s'il tient (ou s'il est seul). Renvoie `false` sans rien réserver sinon. */
  reserver(id: number, estimation: number): boolean {
    if (this.total != null && this.enVol.size > 0 && this.utilise() + estimation > this.total) return false;
    this.enVol.set(id, estimation);
    return true;
  }

  liberer(id: number): void {
    this.enVol.delete(id);
  }

  utilise(): number {
    let s = 0;
    for (const v of this.enVol.values()) s += v;
    return s;
  }
}

/** `LLM_CONTEXTE_TOTAL` (jetons) : le `--ctx-size` du serveur ; absent ou invalide = pas de limite. */
export function contexteTotalDepuisEnv(env: Record<string, string | undefined> = process.env): number | null {
  const n = Number(env.LLM_CONTEXTE_TOTAL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
