import type { ComfyUIClient, PollResult, SubmissionInput } from "./types";

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

  async fetchOutput(): Promise<void> {
    // no-op — rien à copier en mode stub
  }
}
