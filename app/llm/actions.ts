"use server";

import { configLlm } from "@/lib/llm/config";
import { ecrireModeleChoisi } from "@/lib/llm/modele-choisi";
import { listerModeles } from "@/worker/llamaSwap";

/** Choisit le modèle LLM (pastille du header). `null` revient au modèle de la configuration (`LLM_LOCAL_MODELE`).
 * Le choix vaut pour les prochains appels, y compris ceux déjà en file : le worker le lit au démarrage de chaque appel.
 * Renvoie `{ ok: true } | { ok: false, erreur }`, jamais d'exception pour un cas métier. */
export async function choisirModeleLlm(modele: string | null): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (modele == null) {
    await ecrireModeleChoisi(null);
    return { ok: true };
  }
  const nom = modele.trim();
  if (!nom || nom.length > 200) return { ok: false, erreur: "Nom de modèle invalide." };
  // On n'accepte qu'un modèle que le serveur déclare : un nom faux ferait échouer chaque appel. Si le serveur ne
  // répond pas (ou ne sait pas lister), on ne peut pas vérifier : on refuse plutôt que d'enregistrer à l'aveugle.
  const connus = await listerModeles(configLlm().url);
  if (connus == null) return { ok: false, erreur: "Le serveur LLM ne répond pas : impossible de vérifier ce modèle." };
  if (!connus.includes(nom)) return { ok: false, erreur: `« ${nom} » n'est pas un modèle de ce serveur.` };
  await ecrireModeleChoisi(nom);
  return { ok: true };
}
