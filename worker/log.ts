import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Observation log of the worker (JSON lines), to measure the chaining of tasks,
 * the GPU unloads and the VRAM during a real working session.
 *
 * Disabled by default: `JOURNAL_WORKER=1` enables it (file `data/journal-worker.jsonl`,
 * or `JOURNAL_WORKER_FICHIER`). Best effort, like the rest of the GPU management: a write
 * or a probe that fails never disturbs a task. */

const actif = process.env.JOURNAL_WORKER === "1";
const FICHIER = resolve(process.env.JOURNAL_WORKER_FICHIER ?? "data/journal-worker.jsonl");
const INTERVALLE_SONDE_MS = 2000;

export function noterEvenement(type: string, champs: Record<string, unknown> = {}): void {
  if (!actif) return;
  try {
    mkdirSync(dirname(FICHIER), { recursive: true });
    appendFileSync(FICHIER, JSON.stringify({ t: new Date().toISOString(), type, ...champs }) + "\n");
  } catch {
    /* the log must never disturb the worker */
  }
}

/** Brackets a task: `tache_debut` then `tache_fin` (duration, success, error). */
export async function journaliserTache<T>(genre: string, id: number, domaine: string, travail: () => Promise<T>): Promise<T> {
  if (!actif) return travail();
  const debut = Date.now();
  noterEvenement("tache_debut", { genre, id, domaine });
  try {
    const r = await travail();
    noterEvenement("tache_fin", { genre, id, domaine, dureeMs: Date.now() - debut, fait: r });
    return r;
  } catch (e) {
    noterEvenement("tache_fin", { genre, id, domaine, dureeMs: Date.now() - debut, erreur: (e as Error).message });
    throw e;
  }
}

/** Samples the card's VRAM every 2 s (GET /system_stats of ComfyUI: the
 * only point of view on the GPU when the worker runs on another machine) and the
 * models loaded in llama-swap (GET /running). */
export function demarrerSondeVram(comfyuiUrl: string | undefined, llmUrl: string): void {
  if (!actif || !comfyuiUrl) return;
  let dernierSwap = 0;
  let modeles = "";
  const tick = async () => {
    try {
      const j: any = await (await fetch(`${comfyuiUrl}/system_stats`, { signal: AbortSignal.timeout(4000) })).json();
      const d = j.devices?.[0];
      if (Date.now() - dernierSwap > 5000) {
        dernierSwap = Date.now();
        try {
          const r: any = await (await fetch(`${llmUrl}/running`, { signal: AbortSignal.timeout(3000) })).json();
          modeles = (r.running ?? []).map((m: any) => m.model).join("+");
        } catch {
          modeles = "?";
        }
      }
      if (d) {
        noterEvenement("vram", {
          usedGo: +((d.vram_total - d.vram_free) / 2 ** 30).toFixed(2),
          torchLibreGo: +((d.torch_vram_free ?? 0) / 2 ** 30).toFixed(2),
          ramLibreGo: +((j.system?.ram_free ?? 0) / 2 ** 30).toFixed(1),
          llm: modeles,
        });
      }
    } catch {
      /* ComfyUI unreachable: no sample */
    }
  };
  const timer = setInterval(() => void tick(), INTERVALLE_SONDE_MS);
  timer.unref?.();
}
