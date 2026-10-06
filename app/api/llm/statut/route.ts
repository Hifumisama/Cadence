import { NextResponse } from "next/server";
import { configLlm } from "@/lib/llm/config";
import { llmJoignable, modelesCharges } from "@/worker/llamaSwap";

// Sondé par la pastille du header (components/llm) : jamais mis en cache.
export const dynamic = "force-dynamic";

export type StatutLlm = {
  /** Le serveur répond (route de santé) — on peut lui poser une requête. */
  joignable: boolean;
  /** Modèle par défaut de la configuration (`LLM_LOCAL_MODELE`). */
  modele: string;
  /** Modèles réellement chargés en VRAM (llama-swap `/running`), null si on ne peut pas le savoir. */
  charges: string[] | null;
  /** Hôte seulement (pas de chemin ni d'identifiants), pour l'infobulle. */
  hote: string;
};

export async function GET() {
  const c = configLlm();
  const joignable = await llmJoignable(c.url, fetch, c.routeSante);
  const charges = joignable ? await modelesCharges(c.url) : null;
  let hote = c.url;
  try {
    hote = new URL(c.url).host;
  } catch {
    // URL non analysable : on garde la valeur brute
  }
  const corps: StatutLlm = { joignable, modele: c.modeleParDefaut, charges, hote };
  return NextResponse.json(corps, { headers: { "Cache-Control": "no-store" } });
}
