import { writeFile } from "node:fs/promises";
import type { ComfyUIClient, EvenementSuivi, PollResult, SubmissionInput, Suivi } from "./types";
import { pngFactice } from "./stubPng";

/**
 * Client factice — permet de développer et tester toute la chaîne (queue,
 * pages, contrôles) tant que VID_REF2VA.json n'est pas ré-exporté en format
 * API (voir plan d'implémentation, "Prérequis bloquant"). Simule un aller-
 * retour de quelques secondes puis "termine" systématiquement.
 */
export class StubComfyUIClient implements ComfyUIClient {
  private enCours = new Map<string, number>(); // promptId -> timestamp de démarrage

  async healthcheck(): Promise<boolean> {
    return true;
  }

  async uploadRef(): Promise<void> {
    // no-op
  }

  async submit(_input: SubmissionInput): Promise<string> {
    const promptId = `stub-${Date.now()}`;
    this.enCours.set(promptId, Date.now());
    return promptId;
  }

  async poll(promptId: string): Promise<PollResult> {
    const debut = this.enCours.get(promptId) ?? 0;
    if (Date.now() - debut < 3000) return { statut: "en_cours" };
    return { statut: "termine", cheminSortieDistant: `stub/${promptId}.mp4` };
  }

  async submitGraph(): Promise<string> {
    const promptId = `stub-img-${Date.now()}`;
    this.enCours.set(promptId, Date.now());
    return promptId;
  }

  async pollImage(promptId: string): Promise<PollResult> {
    const debut = this.enCours.get(promptId) ?? 0;
    if (Date.now() - debut < 2000) return { statut: "en_cours" };
    return { statut: "termine", cheminSortieDistant: `stub/${promptId}.png` };
  }

  /** Rejoue ~2 s de progression (8 étapes, un aperçu à mi-parcours) : de quoi
   * tester la barre et l'aperçu de l'interface sans ComfyUI. */
  async ouvrirSuivi(surEvenement: (e: EvenementSuivi) => void): Promise<Suivi> {
    let arrete = false;
    return {
      fermer: () => {
        arrete = true;
      },
      attendre: async () => {
        const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
        surEvenement({ type: "demarre" });
        surEvenement({ type: "noeud", noeud: "stub" });
        for (let i = 1; i <= 8 && !arrete; i++) {
          await pause(220);
          surEvenement({ type: "progression", valeur: i, max: 8, noeud: "stub" });
          if (i === 4) surEvenement({ type: "apercu", octets: pngFactice(128, 72), format: "png" });
        }
        surEvenement({ type: "termine" });
        return "termine";
      },
    };
  }

  async fetchOutput(_distant?: string, cheminLocalCible?: string): Promise<void> {
    // Vidéo : rien à copier. Image : un PNG factice, pour que toute la chaîne
    // (candidats, adoption, aperçu) se teste sans ComfyUI.
    if (cheminLocalCible?.toLowerCase().endsWith(".png")) {
      await writeFile(cheminLocalCible, pngFactice());
    }
  }
}
