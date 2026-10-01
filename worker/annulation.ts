import { gestePourAnnuler } from "../lib/annulation";
import type { ComfyUIClient } from "./comfyui/types";

// Annulation d'une tâche EN COURS (le drapeau est posé par l'interface, voir
// lib/annulation-db.ts). Le worker décide, côté ComfyUI, selon ce que /queue dit du
// prompt — jamais à l'aveugle : `POST /interrupt` arrête ce qui tourne sur TOUT le
// serveur, y compris un job lancé à la main par l'utilisateur.

export type IssueAnnulation =
  | "interrompue" // il tournait, on l'a interrompu et il a quitté la file
  | "retiree" // il attendait dans la file de ComfyUI, on l'en a retiré
  | "rien" // ni en cours ni en file : déjà fini, ou jamais arrivé
  | "sans_effet"; // impossible de s'en assurer (ComfyUI muet, réponse illisible) : rien n'a été coupé

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Annule un prompt côté ComfyUI. Relit /queue après chaque geste : on ne rend la
 * main que lorsque le prompt n'y figure plus (ou après `passes` essais). */
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
      // Une seule fois : si ComfyUI ignorait le `prompt_id` et coupait « ce qui
      // tourne », un second appel pourrait couper la tâche suivante.
      if (!interrompu) {
        interrompu = true;
        if (await client.interrompre(promptId)) fait = "interrompue";
      }
    } else if (geste === "retirer") {
      if (await client.retirerDeLaFile(promptId)) fait = fait ?? "retiree";
    }
    // `reessayer` : on ne sait pas, on ne coupe rien ; on réessaie après une pause.
    await pause(pauseMs);
  }
  return "sans_effet";
}

/** Sonde le drapeau d'annulation pendant qu'une tâche s'exécute. `promesse` se
 * résout dès qu'il est posé ; l'appelant la met en concurrence avec l'attente du
 * résultat (Promise.race) et appelle `arreter()` dans tous les cas. Une erreur de
 * lecture (base indisponible un instant) ne compte pas comme une demande. */
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
        // base injoignable un instant : on réessaie au tour suivant
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
