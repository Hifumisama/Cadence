import { writeFile } from "node:fs/promises";
import type { EtatDansLaFile } from "../../lib/tasks/cancellation";
import type { ComfyUIClient, EvenementSuivi, PollResult, Suivi } from "./types";
import { pngFactice } from "./stubPng";

/**
 * Fake client — lets you develop and test the whole chain (queue,
 * pages, controls) as long as VID_REF2VA.json has not been re-exported in API
 * format (see implementation plan, "Prérequis bloquant" (blocking prerequisite)). Simulates a round
 * trip of a few seconds, then systematically "termine" (done).
 */
export class StubComfyUIClient implements ComfyUIClient {
  private enCours = new Map<string, number>(); // promptId -> start timestamp

  async healthcheck(): Promise<boolean> {
    return true;
  }

  async uploadRef(): Promise<void> {
    // no-op
  }

  async submitGraph(graphe?: Record<string, unknown>): Promise<string> {
    // A video graph (VHS_VideoCombine) yields a fake video file.
    const classes = Object.values(graphe ?? {}).map((n) => (n as { class_type?: string }).class_type ?? "");
    const video = classes.includes("VHS_VideoCombine");
    const promptId = `stub-${video ? "vid" : "img"}-${Date.now()}`;
    this.enCours.set(promptId, Date.now());
    return promptId;
  }

  async pollImage(promptId: string): Promise<PollResult> {
    const debut = this.enCours.get(promptId) ?? 0;
    if (Date.now() - debut < 2000) return { statut: "en_cours" };
    return { statut: "termine", cheminSortieDistant: `stub/${promptId}.${promptId.startsWith("stub-vid-") ? "mp4" : "png"}` };
  }

  async pollFin(promptId: string): Promise<PollResult> {
    const debut = this.enCours.get(promptId) ?? 0;
    return Date.now() - debut < 2000 ? { statut: "en_cours" } : { statut: "termine", cheminSortieDistant: "" };
  }

  /** Replays ~2 s of progress (8 steps, a preview halfway): enough to
   * test the interface's bar and preview without ComfyUI. */
  async ouvrirSuivi(surEvenement: (e: EvenementSuivi) => void): Promise<Suivi> {
    let arrete = false;
    return {
      fermer: () => {
        arrete = true;
      },
      attendre: async (promptId: string) => {
        const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
        surEvenement({ type: "demarre" });
        surEvenement({ type: "noeud", noeud: "stub" });
        for (let i = 1; i <= 8 && !arrete; i++) {
          await pause(Number(process.env.STUB_PAS_MS ?? 220));
          if (this.interrompus.has(promptId)) return "erreur";
          surEvenement({ type: "progression", valeur: i, max: 8, noeud: "stub" });
          if (i === 4) surEvenement({ type: "apercu", octets: pngFactice(128, 72), format: "png" });
        }
        surEvenement({ type: "termine" });
        return "termine";
      },
    };
  }

  /** Simulated prompts « tournent » (keep running) as long as they have not been interrupted. */
  private interrompus = new Set<string>();

  async etatDansLaFile(promptId: string): Promise<EtatDansLaFile> {
    if (!this.enCours.has(promptId) || this.interrompus.has(promptId)) return "absent";
    return "en_cours";
  }

  async interrompre(promptId: string): Promise<boolean> {
    this.interrompus.add(promptId);
    return true;
  }

  async retirerDeLaFile(promptId: string): Promise<boolean> {
    this.interrompus.add(promptId);
    return true;
  }

  async libererMemoire(): Promise<boolean> {
    return true;
  }

  async fetchOutput(_distant?: string, cheminLocalCible?: string): Promise<void> {
    // Video: nothing to copy. Image: a fake PNG, so that the whole chain
    // (candidates, adoption, preview) can be tested without ComfyUI.
    if (cheminLocalCible?.toLowerCase().endsWith(".png")) {
      await writeFile(cheminLocalCible, pngFactice());
    }
  }
}
