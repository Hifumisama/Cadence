import { NextResponse } from "next/server";
import { configLlm } from "@/lib/llm/config";
import { lireModeleChoisi } from "@/lib/llm/model-chosen";
import { listerModeles, llmJoignable, modelesCharges } from "@/worker/llamaSwap";

// Probed by the header badge (components/llm): never cached.
export const dynamic = "force-dynamic";

export type StatutLlm = {
  /** The server responds (health route): a request can be sent to it. */
  joignable: boolean;
  /** Model serving today: the choice made in the header, otherwise the one from the configuration (`LLM_LOCAL_MODELE`).
   * A `LLM_MODELE_<SKILL>` override still takes precedence over it for its skill. */
  modele: string;
  /** Model from the configuration (`LLM_LOCAL_MODELE`): the one found when the choice is removed. */
  defaut: string;
  /** True when `modele` comes from a choice made in the interface. */
  choisi: boolean;
  /** Models the server can load (`/v1/models`), null if this cannot be known. */
  modeles: string[] | null;
  /** Models actually loaded in VRAM (llama-swap `/running`), null if this cannot be known. */
  charges: string[] | null;
  /** Host only (no path or credentials), for the tooltip. */
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
    // URL cannot be parsed: keep the raw value
  }
  const corps: StatutLlm = { joignable, modele: choix ?? c.modeleParDefaut, defaut: c.modeleParDefaut, choisi: choix != null, modeles, charges, hote };
  return NextResponse.json(corps, { headers: { "Cache-Control": "no-store" } });
}
