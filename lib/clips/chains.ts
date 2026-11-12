/** The CHAINS of clips (docs/PLAN_FILE_CONSIGNES.md, phase 3): pure rules, nothing in the database. A clip in « suite » link (lib/clips/clip-link.ts)
 * picks up where the previous one ends: its render starts from that of the previous one. A chain is thus a sequence of consecutive clips (`plans.ordre`) of which
 * each, except the first, is in « suite ». A « coupe » opens a new chain. */

export type PlanDeChaine = { id: number; ordre: number; liaison: string };

/** The clips that precede `planId` in its chain (from the nearest to the farthest), `plansDeLEpisode` being the clips of ONE episode. Empty for the
 * first clip of a chain (the episode's first, or a clip in « coupe ») and for an unknown clip. */
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

/** The next iteration to start among those waiting (in queue order): the first one that has, IN QUEUE behind it, no clip that precedes it
 * in its chain. A clip in « suite » restarts from the previous one's render: rendered before it, it would have to be redone. If everything waits for someone (impossible case in a finite chain, but we never block the queue), the first of the queue goes. */
export function choisirProchaineIteration<T extends IterationEnAttente>(file: T[], precedentsDe: (planId: number) => number[]): T | null {
  if (file.length === 0) return null;
  const enFile = new Set(file.map((f) => f.planId));
  return file.find((f) => !precedentsDe(f.planId).some((p) => p !== f.planId && enFile.has(p))) ?? file[0]!;
}

/** Must a render in the queue wait? A clip in « suite » restarts from its predecessor's render: as long as that one has a render queued or running, it waits (queueing it
 * always remains possible). A clip in a « coupe », or without a predecessor, never waits. */
export const doitAttendreLePrecedent = (liaison: string, precedentEnRendu: boolean): boolean => liaison === "suite" && precedentEnRendu;

/** Is the render of a clip in « suite » outdated relative to its predecessor? `utilise`: the attempt of the predecessor it left from (`jobs.raccord_job_id`);
 * `actuelId`: the attempt of the predecessor that would be taken now. False when one of the two is missing (nothing to compare, or nothing to take up). */
export const raccordPerime = (utilise: number | null, actuelId: number | null): boolean => utilise != null && actuelId != null && utilise !== actuelId;
