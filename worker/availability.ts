import { eq } from "drizzle-orm";
import { db } from "../db";
import { parametres } from "../db/schema";

// Disponibilité des serveurs que le worker pilote (LLM, ComfyUI). Le worker ne tourne pas dans le même
// processus que l'interface : l'état « injoignable depuis » passe par `parametres` (clé/valeur), que l'en-tête
// lit pour afficher une pastille. Seules les TRANSITIONS sont écrites (le worker sonde toutes les secondes).

export type DomaineServeur = "llm" | "comfyui";

export const cleInjoignable = (domaine: DomaineServeur) => `injoignable_${domaine}`;

/** Depuis quand (ms epoch) le serveur est-il injoignable ? `null` = joignable ou pas sondé. Pur. */
export function suivreInjoignable(depuis: number | null, joignable: boolean, maintenant: number): number | null {
  if (joignable) return null;
  return depuis ?? maintenant;
}

/** Faut-il renoncer à attendre ? Pur. `maxMs` à 0 : jamais (on attend indéfiniment, comportement d'avant). */
export function attenteDepassee(depuis: number | null, maintenant: number, maxMs: number): boolean {
  return depuis != null && maxMs > 0 && maintenant - depuis >= maxMs;
}

const memoire: Record<DomaineServeur, number | null> = { llm: null, comfyui: null };

/** Note le résultat d'une sonde et renvoie « injoignable depuis » (ms epoch ou null). N'écrit en base que
 * quand l'état change ; une base indisponible ne casse jamais la boucle du worker. */
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

/** Oublie un domaine qui n'a plus rien en attente (rien à signaler : la pastille s'efface). */
export const effacerSonde = (domaine: DomaineServeur) => noterSonde(domaine, true);
