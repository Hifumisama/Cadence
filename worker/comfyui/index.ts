import type { ComfyUIClient } from "./types";
import { HttpComfyUIClient } from "./httpClient";
import { StubComfyUIClient } from "./stubClient";

export function creerClientComfyUI(): ComfyUIClient {
  const mode = process.env.COMFYUI_MODE ?? "stub";
  if (mode === "http") {
    const baseUrl = process.env.COMFYUI_URL;
    const workflowPath = process.env.COMFYUI_WORKFLOW_PATH;
    if (!baseUrl || !workflowPath) {
      throw new Error("COMFYUI_URL et COMFYUI_WORKFLOW_PATH requis en mode http");
    }
    return new HttpComfyUIClient(baseUrl, workflowPath);
  }
  return new StubComfyUIClient();
}

export type { ComfyUIClient } from "./types";
