import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { MEDIA_ROOT } from "../../lib/media";
import type { ComfyUIClient, EvenementSuivi, PollResult, Suivi } from "./types";
import { etatDansLaFile, type EtatDansLaFile } from "../../lib/tasks/cancellation";

import { cheminSortieDistant, premierFichierSortie, type FichierSortie } from "./output";
import { ouvrirSuiviWs, type EtatHistorique } from "./wsTracking";

/** What /history returns for a prompt, reduced to what the client reads. */
type HistoriqueEntree = {
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
  outputs?: Record<string, { gifs?: FichierSortie[]; videos?: FichierSortie[] } | undefined>;
};

/**
 * Real HTTP client to the ComfyUI API running on the desktop PC (already
 * exposed via NPM). The graph is assembled by the caller (`submitGraph`).
 */
export class HttpComfyUIClient implements ComfyUIClient {
  /** This worker's identity with ComfyUI: passed to /prompt AND to the WebSocket,
   * since ComfyUI only returns progress to the client that submitted. */
  private readonly clientId = randomUUID();

  constructor(private readonly baseUrl: string) {}

  async healthcheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async uploadRef(cheminLocal: string, nomDistant: string): Promise<void> {
    const buffer = await readFile(cheminLocal);
    const form = new FormData();
    form.append("image", new Blob([buffer]), nomDistant);
    form.append("overwrite", "true");
    const res = await fetch(`${this.baseUrl}/upload/image`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Upload de ${nomDistant} refusé (${res.status})`);
    }
  }

  async submitGraph(graphe: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graphe, client_id: this.clientId }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Soumission ComfyUI refusée (${res.status}) ${detail.slice(0, 300)}`);
    }
    const { prompt_id } = (await res.json()) as { prompt_id: string };
    return prompt_id;
  }

  async ouvrirSuivi(surEvenement: (e: EvenementSuivi) => void): Promise<Suivi> {
    return ouvrirSuiviWs({
      baseUrl: this.baseUrl,
      clientId: this.clientId,
      surEvenement,
      etatHistorique: (id) => this.etatHistorique(id),
      dossierDebug: process.env.COMFYUI_WS_DEBUG === "1" ? join(MEDIA_ROOT, "_debug") : undefined,
    });
  }

  /** The /history entry for this prompt: undefined as long as ComfyUI has none (or answers with something other than 200). The three reads of
   * a render's state (WebSocket tracking, image, video) go through here, with the same maximum delay. */
  private async lireHistorique(promptId: string): Promise<HistoriqueEntree | undefined> {
    const res = await fetch(`${this.baseUrl}/history/${promptId}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    return (await res.json())[promptId] ?? undefined;
  }

  private async etatHistorique(promptId: string): Promise<EtatHistorique> {
    const entree = await this.lireHistorique(promptId);
    if (!entree) return "en_cours";
    if (entree.status?.status_str === "error") return "erreur";
    if (entree.status?.completed === true) return "termine";
    return "en_cours";
  }

  /** The result of a prompt: in error, finished (the file that `fichierDe` finds in the outputs) or still running. */
  private async lireResultat(promptId: string, fichierDe: (entree: HistoriqueEntree) => FichierSortie | null | undefined): Promise<PollResult> {
    const entree = await this.lireHistorique(promptId);
    if (!entree) return { statut: "en_cours" };
    if (entree.status?.status_str === "error") {
      return { statut: "erreur", message: entree.status?.messages?.map(String).join(" | ") ?? "Erreur ComfyUI" };
    }
    const fichier = fichierDe(entree);
    return fichier ? { statut: "termine", cheminSortieDistant: cheminSortieDistant(fichier) } : { statut: "en_cours" };
  }

  /** Image (`images`), sound (`audio`, to be confirmed) or other: see output.ts. */
  pollImage(promptId: string, nodeIdSortie: string): Promise<PollResult> {
    return this.lireResultat(promptId, (e) => premierFichierSortie(e.outputs?.[nodeIdSortie]));
  }

  async pollFin(promptId: string): Promise<PollResult> {
    const entree = await this.lireHistorique(promptId);
    if (!entree) return { statut: "en_cours" };
    if (entree.status?.status_str === "error") {
      return { statut: "erreur", message: entree.status?.messages?.map(String).join(" | ") ?? "Erreur ComfyUI" };
    }
    return entree.status?.completed === true ? { statut: "termine", cheminSortieDistant: "" } : { statut: "en_cours" };
  }

  async etatDansLaFile(promptId: string): Promise<EtatDansLaFile> {
    try {
      const res = await fetch(`${this.baseUrl}/queue`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return "inconnu";
      return etatDansLaFile(await res.json(), promptId);
    } catch {
      return "inconnu";
    }
  }

  async interrompre(promptId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/interrupt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_id: promptId }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async retirerDeLaFile(promptId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete: [promptId] }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async libererMemoire(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/free`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async fetchOutput(cheminSortieDistant: string, cheminLocalCible: string): Promise<void> {
    const [subfolder, filename] = [
      cheminSortieDistant.includes("/") ? cheminSortieDistant.split("/").slice(0, -1).join("/") : "",
      basename(cheminSortieDistant),
    ];
    const url = new URL(`${this.baseUrl}/view`);
    url.searchParams.set("filename", filename);
    if (subfolder) url.searchParams.set("subfolder", subfolder);
    url.searchParams.set("type", "output");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Récupération de ${filename} refusée (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(cheminLocalCible, buffer);
  }
}
