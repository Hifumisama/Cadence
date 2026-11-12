import { eq } from "drizzle-orm";
import { db } from "../db";
import { parametres } from "../db/schema";

// Availability of the servers the worker drives (LLM, ComfyUI). The worker does not run in the same
// process as the interface: the « injoignable depuis » state goes through `parametres` (key/value), which the header
// reads to display a badge. Only the TRANSITIONS are written (the worker probes every second).

export type DomaineServeur = "llm" | "comfyui";

export const cleInjoignable = (domaine: DomaineServeur) => `injoignable_${domaine}`;

/** Since when (ms epoch) is the server unreachable? `null` = reachable or not probed. Pure. */
export function suivreInjoignable(depuis: number | null, joignable: boolean, maintenant: number): number | null {
  if (joignable) return null;
  return depuis ?? maintenant;
}

/** Should we give up waiting? Pure. `maxMs` at 0: never (we wait indefinitely, the previous behaviour). */
export function attenteDepassee(depuis: number | null, maintenant: number, maxMs: number): boolean {
  return depuis != null && maxMs > 0 && maintenant - depuis >= maxMs;
}

const memoire: Record<DomaineServeur, number | null> = { llm: null, comfyui: null };

/** Records the result of a probe and returns « injoignable depuis » (ms epoch or null). Writes to the database only
 * when the state changes; an unavailable database never breaks the worker loop. */
export async function noterSonde(domaine: DomaineServeur, joignable: boolean, maintenant = Date.now()): Promise<number | null> {
  const avant = memoire[domaine];
  const apres = suivreInjoignable(avant, joignable, maintenant);
  memoire[domaine] = apres;
  if ((avant == null) === (apres == null)) return apres;
  try {
    const cle = cleInjoignable(domaine);
    if (apres == null) await db.delete(parametres).where(eq(parametres.cle, cle));
    else {
      const valeur = new Date(apres).toISOString();
      await db.insert(parametres).values({ cle, valeur }).onConflictDoUpdate({ target: parametres.cle, set: { valeur } });
    }
  } catch (err) {
    console.error("[worker] État de disponibilité non enregistré :", err);
  }
  return apres;
}

/** Forgets a domain that has nothing pending anymore (nothing to report: the badge disappears). */
export const effacerSonde = (domaine: DomaineServeur) => noterSonde(domaine, true);
