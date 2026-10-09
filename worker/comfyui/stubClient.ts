import { writeFile } from "node:fs/promises";
import type { EtatDansLaFile } from "../../lib/annulation";
import type { ComfyUIClient, EvenementSuivi, PollResult, SubmissionInput, Suivi } from "./types";
import { mp3Factice } from "./stubAudio";
import { pngFactice } from "./stubPng";

/** Une boîte `ftyp` : de quoi avoir un fichier .mp4 reconnaissable, pas une vidéo qui se lit. */
const mp4Factice = () => Buffer.from("00000018667479706d70343200000000" + "6d70343269736f6d", "hex");

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

  async submitGraph(graphe?: Record<string, unknown>): Promise<string> {
    // Un graphe qui sauvegarde de l'audio (SaveAudioMP3) donne un son factice.
    const classes = Object.values(graphe ?? {}).map((n) => (n as { class_type?: string }).class_type ?? "");
    const audio = classes.some((c) => c === "SaveAudioMP3" || c === "SaveAudio" || c === "SaveAudioAdvanced");
    // Un graphe vidéo (test vidéo d'une voix : VHS_VideoCombine) donne un fichier vidéo factice.
    const video = classes.includes("VHS_VideoCombine");
    const promptId = `stub-${audio ? "aud" : video ? "vid" : "img"}-${Date.now()}`;
    this.enCours.set(promptId, Date.now());
    return promptId;
  }

  async pollImage(promptId: string): Promise<PollResult> {
    const debut = this.enCours.get(promptId) ?? 0;
    if (Date.now() - debut < 2000) return { statut: "en_cours" };
    return { statut: "termine", cheminSortieDistant: `stub/${promptId}.${promptId.startsWith("stub-aud-") ? "mp3" : promptId.startsWith("stub-vid-") ? "mp4" : "png"}` };
  }

  /** Une transcription factice, au format de l'ASR (JSON texte + segments), pour tester l'extraction d'une voix sans ComfyUI. */
  async lireTexteSortie(): Promise<string | null> {
    return JSON.stringify({ text: "Bonjour, ceci est une transcription factice. Corrige-la au mot près avant de l'utiliser.", language: "French", segments: [] });
  }

  /** Rejoue ~2 s de progression (8 étapes, un aperçu à mi-parcours) : de quoi
   * tester la barre et l'aperçu de l'interface sans ComfyUI. */
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

  /** Les prompts simulés « tournent » tant qu'on ne les a pas interrompus. */
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
    // Vidéo : rien à copier. Image : un PNG factice, pour que toute la chaîne
    // (candidats, adoption, aperçu) se teste sans ComfyUI.
    if (cheminLocalCible?.toLowerCase().endsWith(".png")) {
      await writeFile(cheminLocalCible, pngFactice());
    } else if (cheminLocalCible?.toLowerCase().endsWith(".mp3")) {
      await writeFile(cheminLocalCible, mp3Factice());
    } else if (cheminLocalCible?.toLowerCase().endsWith(".mp4") && /[\\/]generations[\\/]/.test(cheminLocalCible)) {
      // Un candidat de test vidéo doit exister sur le disque pour être adopté (les rendus des plans, eux, restent sans fichier).
      await writeFile(cheminLocalCible, mp4Factice());
    }
  }
}
