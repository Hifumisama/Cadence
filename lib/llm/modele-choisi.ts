import { eq } from "drizzle-orm";
import { db } from "../../db";
import { parametres } from "../../db/schema";
import { CLE_MODELE_CHOISI, configLlm, modelePourSkill, type Env } from "./config";

/** Le modèle LLM choisi dans l'interface (pastille du header), rangé dans `parametres`. Mono-utilisateur : un seul choix,
 * global. `null` = pas de choix, le modèle de la configuration (`LLM_LOCAL_MODELE`) s'applique. Côté serveur seulement.
 * La priorité complète est décrite sur `modelePourSkill` (lib/llm/config.ts). */

export async function lireModeleChoisi(): Promise<string | null> {
  const [ligne] = await db.select({ valeur: parametres.valeur }).from(parametres).where(eq(parametres.cle, CLE_MODELE_CHOISI)).limit(1);
  return ligne?.valeur.trim() || null;
}

/** `null` retire le choix (retour au modèle de la configuration). */
export async function ecrireModeleChoisi(modele: string | null): Promise<void> {
  if (modele == null) {
    await db.delete(parametres).where(eq(parametres.cle, CLE_MODELE_CHOISI));
    return;
  }
  await db.insert(parametres).values({ cle: CLE_MODELE_CHOISI, valeur: modele }).onConflictDoUpdate({ target: parametres.cle, set: { valeur: modele } });
}

/** Modèle que prendra un skill maintenant : surcharge par skill, sinon le choix de l'interface, sinon la configuration. */
export async function modeleEffectifPourSkill(skill: string, env: Env = process.env): Promise<string> {
  return modelePourSkill(skill, env, await lireModeleChoisi());
}

/** Modèle « par défaut » effectif, sans skill : le choix de l'interface, sinon `LLM_LOCAL_MODELE`. */
export async function modeleParDefautEffectif(env: Env = process.env): Promise<string> {
  return (await lireModeleChoisi()) ?? configLlm(env).modeleParDefaut;
}
