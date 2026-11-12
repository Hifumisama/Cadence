/** Les CHAÎNES de plans (docs/PLAN_FILE_CONSIGNES.md, phase 3) : règles pures, rien en base. Un plan en liaison « suite » (lib/plans/plan-liaison.ts)
 * reprend là où le précédent finit : son rendu part de celui du précédent. Une chaîne est donc une suite de plans consécutifs (`plans.ordre`) dont
 * chacun, sauf le premier, est en « suite ». Une « coupe » ouvre une nouvelle chaîne. */

export type PlanDeChaine = { id: number; ordre: number; liaison: string };

/** Les plans qui précèdent `planId` dans sa chaîne (du plus proche au plus lointain), `plansDeLEpisode` étant les plans d'UN épisode. Vide pour le
 * premier plan d'une chaîne (le premier de l'épisode, ou un plan en coupe) et pour un plan inconnu. */
export function precedentsDansLaChaine(plansDeLEpisode: PlanDeChaine[], planId: number): number[] {
  const tries = [...plansDeLEpisode].sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  let i = tries.findIndex((p) => p.id === planId);
  if (i < 0) return [];
  const avant: number[] = [];
  while (i > 0 && tries[i]!.liaison === "suite") {
    i -= 1;
    avant.push(tries[i]!.id);
  }
  return avant;
}

export type IterationEnAttente = { id: number; planId: number };

/** La prochaine itération à démarrer parmi celles qui attendent (dans l'ordre de la file) : la première qui n'a, EN FILE derrière elle, aucun plan qui la
 * précède dans sa chaîne. Un plan en « suite » repart du rendu du précédent : rendu avant lui, il serait à refaire. Si tout attend quelqu'un (cas
 * impossible dans une chaîne finie, mais on ne bloque jamais la file), la première de la file passe. */
export function choisirProchaineIteration<T extends IterationEnAttente>(file: T[], precedentsDe: (planId: number) => number[]): T | null {
  if (file.length === 0) return null;
  const enFile = new Set(file.map((f) => f.planId));
  return file.find((f) => !precedentsDe(f.planId).some((p) => p !== f.planId && enFile.has(p))) ?? file[0]!;
}

/** Un rendu en file doit-il attendre ? Un plan en « suite » repart du rendu de son précédent : tant que celui-ci a un rendu en file ou en cours, il patiente (le mettre en
 * file reste toujours possible). Un plan en coupe, ou sans précédent, ne patiente jamais. */
export const doitAttendreLePrecedent = (liaison: string, precedentEnRendu: boolean): boolean => liaison === "suite" && precedentEnRendu;

/** Le rendu d'un plan en « suite » est-il périmé par rapport à son précédent ? `utilise` : l'essai du précédent dont il est parti (`jobs.raccord_job_id`) ;
 * `actuelId` : l'essai du précédent qui serait pris maintenant. Faux quand l'un des deux manque (rien à comparer, ou rien à reprendre). */
export const raccordPerime = (utilise: number | null, actuelId: number | null): boolean => utilise != null && actuelId != null && utilise !== actuelId;
