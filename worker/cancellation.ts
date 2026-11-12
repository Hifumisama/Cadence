import { gestePourAnnuler } from "../lib/tasks/cancellation";
import type { ComfyUIClient } from "./comfyui/types";

// Cancellation of a task IN PROGRESS (the flag is set by the interface, see
// lib/tasks/cancellation-db.ts). The worker decides, on the ComfyUI side, according to what /queue says about the
// prompt — never blindly: `POST /interrupt` stops what is running on the WHOLE
// server, including a job launched by hand by the user.

export type IssueAnnulation =
  | "interrompue" // it was running, we interrupted it and it left the queue
  | "retiree" // it was waiting in the ComfyUI queue, we removed it from it
  | "rien" // neither running nor queued: already finished, or never arrived
  | "sans_effet"; // impossible to be sure (ComfyUI silent, unreadable response): nothing was cut

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Cancels a prompt on the ComfyUI side. Rereads /queue after each gesture: we only hand
 * back control when the prompt is no longer there (or after `passes` attempts). */
export async function annulerCoteComfyUI(
  client: ComfyUIClient,
  promptId: string,
  opts: { passes?: number; pauseMs?: number } = {},
): Promise<IssueAnnulation> {
  const passes = opts.passes ?? 6;
  const pauseMs = opts.pauseMs ?? 700;
  let fait: "interrompue" | "retiree" | null = null;
  let interrompu = false;

  for (let i = 0; i < passes; i++) {
    const geste = gestePourAnnuler(await client.etatDansLaFile(promptId));
    if (geste === "rien") return fait ?? "rien";
    if (geste === "interrompre") {
      // Only once: if ComfyUI ignored the `prompt_id` and cut « what is
      // running », a second call could cut the next task.
      if (!interrompu) {
        interrompu = true;
        if (await client.interrompre(promptId)) fait = "interrompue";
      }
    } else if (geste === "retirer") {
      if (await client.retirerDeLaFile(promptId)) fait = fait ?? "retiree";
    }
    // `reessayer`: we do not know, we cut nothing; we retry after a pause.
    await pause(pauseMs);
  }
  return "sans_effet";
}

/** Probes the cancellation flag while a task runs. `promesse` resolves as soon as it is set; the caller races it against the wait
 * for the result (Promise.race) and calls `arreter()` in all cases. A read error
 * (database briefly unavailable) does not count as a request. */
export function surveillerAnnulation(
  demandee: () => Promise<boolean>,
  intervalleMs = 1_500,
): { promesse: Promise<"annulee">; arreter: () => void } {
  let arrete = false;
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  const promesse = new Promise<"annulee">((resolve) => {
    const tour = async () => {
      if (arrete) return;
      try {
        if (await demandee()) {
          resolve("annulee");
          return;
        }
      } catch {
        // database briefly unreachable: we retry on the next turn
      }
      if (arrete) return;
      minuteur = setTimeout(tour, intervalleMs);
      minuteur.unref?.();
    };
    minuteur = setTimeout(tour, intervalleMs);
    minuteur.unref?.();
  });
  return {
    promesse,
    arreter() {
      arrete = true;
      if (minuteur) clearTimeout(minuteur);
    },
  };
}
