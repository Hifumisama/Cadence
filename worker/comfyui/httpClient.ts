import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { MEDIA_ROOT } from "../../lib/media";
import type { ComfyUIClient, EvenementSuivi, PollResult, SubmissionInput, Suivi } from "./types";
import { etatDansLaFile, type EtatDansLaFile } from "../../lib/annulation";
import { injecterValeurs, NODE_IDS } from "./mapping";
import { cheminSortieDistant, premierFichierSortie, type FichierSortie } from "./sortie";
import { ouvrirSuiviWs, type EtatHistorique } from "./wsSuivi";

/** Ce que /history rend d'un prompt, réduit à ce que le client lit. */
type HistoriqueEntree = {
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
  outputs?: Record<string, { gifs?: FichierSortie[]; videos?: FichierSortie[] } | undefined>;
};

/**
 * Client HTTP réel vers l'API ComfyUI qui tourne sur le PC de bureau (déjà
 * exposée via NPM — voir plan d'implémentation, "Topologie"). N'utilisable
 * qu'une fois workflows/video-generation/VID_REF2VA.json ré-exporté en
 * "Save (API Format)" : le graphe actuel n'est pas soumettable en l'état.
 */
export class HttpComfyUIClient implements ComfyUIClient {
  /** Identité de ce worker auprès de ComfyUI : passée à /prompt ET au WebSocket,
   * car ComfyUI ne renvoie la progression qu'au client qui a soumis. */
  private readonly clientId = randomUUID();

  constructor(
    private readonly baseUrl: string,
    private readonly workflowPath: string,
  ) {}

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

  async submit(input: SubmissionInput): Promise<string> {
    const brut = JSON.parse(await readFile(this.workflowPath, "utf-8"));
    const graphe = injecterValeurs(brut, input);

    const res = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graphe, client_id: this.clientId }),
    });
    if (!res.ok) {
      throw new Error(`Soumission ComfyUI refusée (${res.status})`);
    }
    const { prompt_id } = (await res.json()) as { prompt_id: string };
    return prompt_id;
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

  /** L'entrée de /history pour ce prompt : undefined tant que ComfyUI n'en a pas (ou répond autrement que 200). Les trois lectures de
   * l'état d'un rendu (suivi WebSocket, image, vidéo) passent par ici, avec le même délai maximal. */
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

  /** Le résultat d'un prompt : en erreur, fini (le fichier que `fichierDe` trouve dans les sorties) ou encore en cours. */
  private async lireResultat(promptId: string, fichierDe: (entree: HistoriqueEntree) => FichierSortie | null | undefined): Promise<PollResult> {
    const entree = await this.lireHistorique(promptId);
    if (!entree) return { statut: "en_cours" };
    if (entree.status?.status_str === "error") {
      return { statut: "erreur", message: entree.status?.messages?.map(String).join(" | ") ?? "Erreur ComfyUI" };
    }
    const fichier = fichierDe(entree);
    return fichier ? { statut: "termine", cheminSortieDistant: cheminSortieDistant(fichier) } : { statut: "en_cours" };
  }

  /** Image (`images`), son (`audio`, à confirmer) ou autre : voir sortie.ts. */
  pollImage(promptId: string, nodeIdSortie: string): Promise<PollResult> {
    return this.lireResultat(promptId, (e) => premierFichierSortie(e.outputs?.[nodeIdSortie]));
  }

  poll(promptId: string): Promise<PollResult> {
    return this.lireResultat(promptId, (e) => {
      const sortie = e.outputs?.[NODE_IDS.sortieFinale];
      return (sortie?.gifs ?? sortie?.videos)?.[0];
    });
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
