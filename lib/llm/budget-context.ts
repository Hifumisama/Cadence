/** LLM server context budget, for parallel calls.
 *
 * With a unified KV cache (llama.cpp `--parallel N`), the N calls share ONE context (`--ctx-size`). Three calls of 15 000 tokens plus their
 * output overflow: the server answers "Context size has been exceeded" and cuts the other calls' streams. The worker therefore only sends a call if the sum
 * estimated (input + expected output) of the calls in flight fits in `LLM_CONTEXTE_TOTAL`. A single call always goes through (even oversized: the server decides).
 * Without `LLM_CONTEXTE_TOTAL`, no limit. Pure, tested. */

/** Expected output per skill (tokens), a bit above what was measured on average. */
const SORTIE_ATTENDUE: Record<string, number> = {
  "scenario-scene": 2500,
  "traitement-episode": 3000,
  "scenario-episode": 8000,
  "relecture-scenario": 5000,
  // 4000 → 6000 (2026-11-09): the inventory also returns a line of references per clip (≈ 30 tokens), i.e. ≈ 3000 more for 100 clips. The
  // split of a long film into scene groups has its own estimate (lib/agents/inventory.ts, `estimerInventaire`).
  "inventaire-assets": 6000,
  // 800 → 1000 (2026-11-08): a character is 150-220 words + the 4-view sentence (~35 words), ≈ 260-370 tokens; `reflexion` (2-4 lines of
  // French, ≈ 100-200), `raisonMethode` (≈ 30), the JSON keys (≈ 40), and `remarques` more frequent since the « incertain » / « déduit »
  // details of the brief (2-3 × ≈ 50): ≈ 530-790 tokens, 800 no longer had any margin.
  "prompt-asset": 1000,
  "iteration-plan": 2000,
  // A clip's reference choice when in doubt: 6 references and 2 missing at most, ≤ 300 tokens targeted; the input (summarised registry, descriptions
  // cut at 160 characters) is counted by its JSON size like the others.
  "references-plan": 400,
  "retouche-prompt": 3000, // the six sections of the prompt, copied back (what does not change is rendered identically)
  "plan-h3ir": 1500, // the translation of the intent; the compiler, for its part, is counted separately (JETONS_COMPILATEUR_H3IR)
};
/** Open H3 IR (`plan-h3ir`): the Python compiler makes its own calls to the server (image analysis, clip plan, prose), which the translation skill does not
 * count. Estimate to refine on the traces; added to that of the translation to reserve the room for a whole task. */
export const JETONS_COMPILATEUR_H3IR = 12_000;
const SORTIE_PAR_DEFAUT = 2000;

/** Tokens a call will occupy in the context: the skill (instructions, examples), the input, the expected output. */
export function estimerContexte(skill: string, jetonsSkill: number, entree: unknown): number {
  const json = typeof entree === "string" ? entree : JSON.stringify(entree ?? {});
  return jetonsSkill + Math.ceil(json.length / 4) + (SORTIE_ATTENDUE[skill] ?? SORTIE_PAR_DEFAUT);
}

export class BudgetContexte {
  private enVol = new Map<number, number>();
  /** What the last finished calls leave in the cache: each slot keeps the context of its last request (to reuse it) as long as another does not
   * replace it. The cells are taken even when the slot is idle (observed: 3 slots, 49,152 tokens, « failed to find a memory slot »). */
  private retenus: number[] = [];

  /** `slots`: the server's `--parallel`; an idle slot retains the size of a finished call. */
  constructor(
    private readonly total: number | null,
    private readonly slots = 1,
  ) {}

  /** Reserves the room for call `id` if it fits alongside the calls in flight AND what the idle slots retain (or if it is alone: the server decides).
   * Returns `false` without reserving anything otherwise. */
  reserver(id: number, estimation: number): boolean {
    if (this.total != null && this.enVol.size > 0 && this.utilise() + estimation > this.total) return false;
    this.enVol.set(id, estimation);
    return true;
  }

  /** The call is finished (succeeded, failed or never sent): its room becomes retained cache, until another call takes the slot. */
  liberer(id: number, retenir = true): void {
    const e = this.enVol.get(id);
    this.enVol.delete(id);
    if (e != null && retenir) this.retenus = [...this.retenus, e].slice(-this.slots);
  }

  /** Occupied cells: the calls in flight, plus what the slots nobody uses keep (the biggest retained first: caution). */
  utilise(): number {
    let s = 0;
    for (const v of this.enVol.values()) s += v;
    const libres = Math.max(0, this.slots - this.enVol.size);
    return s + [...this.retenus].sort((x, y) => y - x).slice(0, libres).reduce((a, b) => a + b, 0);
  }
}

/** `LLM_CONTEXTE_TOTAL` (tokens): the server's `--ctx-size`; absent or invalid = no limit. */
export function contexteTotalDepuisEnv(env: Record<string, string | undefined> = process.env): number | null {
  const n = Number(env.LLM_CONTEXTE_TOTAL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
