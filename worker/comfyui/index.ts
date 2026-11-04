import type { ComfyUIClient } from "./types";
import { HttpComfyUIClient } from "./httpClient";
import { StubComfyUIClient } from "./stubClient";

export function creerClientComfyUI(): ComfyUIClient {
  const mode = process.env.COMFYUI_MODE ?? "stub";
  if (mode === "http") {
    const baseUrl = process.env.COMFYUI_URL;
    if (!baseUrl) throw new Error("COMFYUI_URL requis en mode http");
    // COMFYUI_WORKFLOW_PATH n'est plus exigé : seul l'ancien chemin « une seule passe » (submit, sans appelant) le lit.
    const workflowPath = process.env.COMFYUI_WORKFLOW_PATH ?? "./workflows/video-generation/VID_REF2VA.json";
    return new HttpComfyUIClient(baseUrl, workflowPath);
  }
  return new StubComfyUIClient();
}

export type { ComfyUIClient } from "./types";
