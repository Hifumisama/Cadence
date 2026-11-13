"use server";

import { configLlm } from "@/lib/llm/config";
import { ecrireModeleChoisi } from "@/lib/llm/model-chosen";
import { listerModeles } from "@/worker/llamaSwap";
import { z } from "zod";
import { verifier } from "@/lib/validation/args";

/** Chooses the LLM model (header badge). `null` reverts to the configured model (`LLM_LOCAL_MODELE`).
 * The choice applies to the next calls, including those already queued: the worker reads it at the start of each call.
 * Returns `{ ok: true } | { ok: false, erreur }`, never an exception for a business case. */
export async function choisirModeleLlm(modele: string | null): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const v = verifier(z.string().max(1000).nullable(), modele);
  if (!v.ok) return v;
  if (modele == null) {
    await ecrireModeleChoisi(null);
    return { ok: true };
  }
  const nom = modele.trim();
  if (!nom || nom.length > 200) return { ok: false, erreur: "Nom de modèle invalide." };
  // Only a model the server declares is accepted: a wrong name would make every call fail. If the server does not
  // respond (or cannot list), we cannot check: we refuse rather than save blindly.
  const connus = await listerModeles(configLlm().url);
  if (connus == null) return { ok: false, erreur: "Le serveur LLM ne répond pas : impossible de vérifier ce modèle." };
  if (!connus.includes(nom)) return { ok: false, erreur: `« ${nom} » n'est pas un modèle de ce serveur.` };
  await ecrireModeleChoisi(nom);
  return { ok: true };
}
