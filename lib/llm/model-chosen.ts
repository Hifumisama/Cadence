import { eq } from "drizzle-orm";
import { db } from "../../db";
import { parametres } from "../../db/schema";
import { CLE_MODELE_CHOISI, modelePourSkill, type Env } from "./config";

/** The LLM model chosen in the interface (header badge), stored in `parametres`. Single user: one choice,
 * global. `null` = no choice, the configuration's model (`LLM_LOCAL_MODELE`) applies. Server side only.
 * The full priority is described on `modelePourSkill` (lib/llm/config.ts). */

export async function lireModeleChoisi(): Promise<string | null> {
  const [ligne] = await db.select({ valeur: parametres.valeur }).from(parametres).where(eq(parametres.cle, CLE_MODELE_CHOISI)).limit(1);
  return ligne?.valeur.trim() || null;
}

/** `null` removes the choice (back to the configuration's model). */
export async function ecrireModeleChoisi(modele: string | null): Promise<void> {
  if (modele == null) {
    await db.delete(parametres).where(eq(parametres.cle, CLE_MODELE_CHOISI));
    return;
  }
  await db.insert(parametres).values({ cle: CLE_MODELE_CHOISI, valeur: modele }).onConflictDoUpdate({ target: parametres.cle, set: { valeur: modele } });
}

/** Model a skill will take now: per-skill override, otherwise the interface's choice, otherwise the configuration. */
export async function modeleEffectifPourSkill(skill: string, env: Env = process.env): Promise<string> {
  return modelePourSkill(skill, env, await lireModeleChoisi());
}

