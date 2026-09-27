import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ComfyUIClient, PollResult, SubmissionInput } from "./types";
import { injecterValeurs, nomFichierSortie, NODE_IDS } from "./mapping";

/**
 * Client HTTP réel vers l'API ComfyUI qui tourne sur le PC de bureau (déjà
 * exposée via NPM — voir plan d'implémentation, "Topologie"). N'utilisable
 * qu'une fois workflows/video-generation/VID_REF2VA.json ré-exporté en
 * "Save (API Format)" : le graphe actuel n'est pas soumettable en l'état.
 */
export class HttpComfyUIClient implements ComfyUIClient {
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
      body: JSON.stringify({ prompt: graphe }),
    });
    if (!res.ok) {
      throw new Error(`Soumission ComfyUI refusée (${res.status})`);
    }
    const { prompt_id } = (await res.json()) as { prompt_id: string };
    return prompt_id;
  }

  async poll(promptId: string): Promise<PollResult> {
    const res = await fetch(`${this.baseUrl}/history/${promptId}`);
    if (!res.ok) return { statut: "en_cours" };

    const historique = await res.json();
    const entree = historique[promptId];
    if (!entree) return { statut: "en_cours" };

    if (entree.status?.status_str === "error") {
      return {
        statut: "erreur",
        message: entree.status?.messages?.map(String).join(" | ") ?? "Erreur ComfyUI",
      };
    }

    const brut = JSON.parse(await readFile(this.workflowPath, "utf-8"));
    const prefixeAttendu = nomFichierSortie(brut);
    const sorties = entree.outputs?.[NODE_IDS.sortieFinale]?.gifs
      ?? entree.outputs?.[NODE_IDS.sortieFinale]?.videos;

    if (!sorties?.length) return { statut: "en_cours" };

    const fichier = sorties[0];
    return {
      statut: "termine",
      cheminSortieDistant: `${fichier.subfolder ?? ""}/${fichier.filename}`.replace(/^\//, ""),
    };
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
