import type { ComfyUIClient } from "./types";
import { HttpComfyUIClient } from "./httpClient";
import { StubComfyUIClient } from "./stubClient";

export function creerClientComfyUI(): ComfyUIClient {
  const mode = process.env.COMFYUI_MODE ?? "stub";
  if (mode === "http") {
    const baseUrl = process.env.COMFYUI_URL;
    if (!baseUrl) throw new Error("COMFYUI_URL requis en mode http");
    return new HttpComfyUIClient(baseUrl);
  }
  return new StubComfyUIClient();
}

export type { ComfyUIClient } from "./types";
