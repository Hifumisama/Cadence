import { NextResponse } from "next/server";
import { configLlm } from "@/lib/llm/config";
import { lireModeleChoisi } from "@/lib/llm/modele-choisi";
import { listerModeles, llmJoignable, modelesCharges } from "@/worker/llamaSwap";

// Sondé par la pastille du header (components/llm) : jamais mis en cache.
export const dynamic = "force-dynamic";

export type StatutLlm = {
  /** Le serveur répond (route de santé) — on peut lui poser une requête. */
  joignable: boolean;
  /** Modèle qui sert aujourd'hui : le choix fait dans le header, sinon celui de la configuration (`LLM_LOCAL_MODELE`).
   * Une surcharge `LLM_MODELE_<SKILL>` prime encore sur lui pour son skill. */
  modele: string;
  /** Modèle de la configuration (`LLM_LOCAL_MODELE`) : celui qu'on retrouve en retirant le choix. */
  defaut: string;
  /** Vrai quand `modele` vient d'un choix fait dans l'interface. */
  choisi: boolean;
  /** Modèles que le serveur sait charger (`/v1/models`), null si on ne peut pas le savoir. */
  modeles: string[] | null;
  /** Modèles réellement chargés en VRAM (llama-swap `/running`), null si on ne peut pas le savoir. */
  charges: string[] | null;
  /** Hôte seulement (pas de chemin ni d'identifiants), pour l'infobulle. */
  hote: string;
};

export async function GET() {
  const c = configLlm();
  const joignable = await llmJoignable(c.url, fetch, c.routeSante);
  const [charges, modeles] = joignable ? await Promise.all([modelesCharges(c.url), listerModeles(c.url)]) : [null, null];
  const choix = await lireModeleChoisi().catch(() => null);
  let hote = c.url;
  try {
    hote = new URL(c.url).host;
  } catch {
    // URL non analysable : on garde la valeur brute
  }
  const corps: StatutLlm = { joignable, modele: choix ?? c.modeleParDefaut, defaut: c.modeleParDefaut, choisi: choix != null, modeles, charges, hote };
  return NextResponse.json(corps, { headers: { "Cache-Control": "no-store" } });
}
