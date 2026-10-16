import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Journal d'observation du worker (JSON lignes), pour mesurer l'enchaînement des tâches,
 * les déchargements GPU et la VRAM pendant une vraie session de travail.
 *
 * Désactivé par défaut : `JOURNAL_WORKER=1` l'active (fichier `data/journal-worker.jsonl`,
 * ou `JOURNAL_WORKER_FICHIER`). Au mieux, comme le reste de la gestion GPU : une écriture
 * ou une sonde qui échoue ne gêne jamais une tâche. */

const actif = process.env.JOURNAL_WORKER === "1";
const FICHIER = resolve(process.env.JOURNAL_WORKER_FICHIER ?? "data/journal-worker.jsonl");
const INTERVALLE_SONDE_MS = 2000;

export const journalActif = () => actif;

export function noterEvenement(type: string, champs: Record<string, unknown> = {}): void {
  if (!actif) return;
  try {
    mkdirSync(dirname(FICHIER), { recursive: true });
    appendFileSync(FICHIER, JSON.stringify({ t: new Date().toISOString(), type, ...champs }) + "\n");
  } catch {
    /* le journal ne doit jamais gêner le worker */
  }
}

/** Encadre une tâche : `tache_debut` puis `tache_fin` (durée, succès, erreur). */
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

/** Échantillonne toutes les 2 s la VRAM de la carte (GET /system_stats de ComfyUI : le
 * seul point de vue sur le GPU quand le worker tourne sur une autre machine) et les
 * modèles chargés dans llama-swap (GET /running). */
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
      /* ComfyUI injoignable : pas d'échantillon */
    }
  };
  const timer = setInterval(() => void tick(), INTERVALLE_SONDE_MS);
  timer.unref?.();
}
