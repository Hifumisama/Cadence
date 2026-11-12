import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations, jobs } from "../db/schema";
import { cheminGenerationMedia } from "../lib/media";
import { limiteur } from "./comfyui/limiter";
import type { EvenementSuivi } from "./comfyui/types";

// Relay of the progress of an image generation to the database: the
// browser does not talk to ComfyUI, the page reads these columns (refreshed every
// 3 s). Rate limited: ComfyUI can emit several events per
// second, the screen does not need them.

const INTERVALLE_PROGRESSION_MS = 1_000;
const INTERVALLE_APERCU_MS = 1_000;

const EXTENSION = { jpeg: "jpg", png: "png", webp: "webp", inconnu: "bin" } as const;

/** Readable label of a node: its title in the graph, otherwise its type. */
function libelleNoeud(graphe: Record<string, unknown>, noeud: string): string {
  const n = graphe[noeud] as { class_type?: string; _meta?: { title?: string } } | undefined;
  return (n?._meta?.title ?? n?.class_type ?? noeud).slice(0, 80);
}

export function creerRelais(opts: {
  genId: number;
  genUuid: string;
  assetId: number;
  mediaRoot: string;
  graphe: Record<string, unknown>;
}) {
  const { genId, genUuid, assetId, mediaRoot, graphe } = opts;
  const peutEcrireProgression = limiteur(INTERVALLE_PROGRESSION_MS);
  const peutEcrireApercu = limiteur(INTERVALLE_APERCU_MS);
  let etape: string | null = null;
  let fichierApercu: string | null = null;
  // Writes are chained: never two concurrent UPDATEs on the row.
  let file: Promise<unknown> = Promise.resolve();
  const enfiler = (tache: () => Promise<unknown>) => {
    file = file.then(tache).catch(() => undefined);
  };

  return {
    surEvenement(e: EvenementSuivi) {
      if (e.type === "noeud") {
        etape = libelleNoeud(graphe, e.noeud);
      } else if (e.type === "progression") {
        if (e.noeud) etape = libelleNoeud(graphe, e.noeud);
        if (!peutEcrireProgression()) return;
        const patch = { progressionValeur: e.valeur, progressionMax: e.max, etapeLibelle: etape };
        enfiler(() => db.update(assetGenerations).set(patch).where(eq(assetGenerations.id, genId)));
      } else if (e.type === "apercu") {
        if (!peutEcrireApercu()) return;
        const nom = `${genUuid}.apercu.${EXTENSION[e.format]}`;
        enfiler(async () => {
          await mkdir(join(mediaRoot, "generations", String(assetId)), { recursive: true });
          await writeFile(join(mediaRoot, cheminGenerationMedia(assetId, nom)), e.octets);
          fichierApercu = nom;
          await db.update(assetGenerations).set({ apercuFichier: nom, apercuAt: new Date() }).where(eq(assetGenerations.id, genId));
        });
      }
    },

    /** End of task (successful or not): the preview and the bar are no longer needed. */
    async nettoyer() {
      await file;
      if (fichierApercu) await unlink(join(mediaRoot, cheminGenerationMedia(assetId, fichierApercu))).catch(() => undefined);
      await db
        .update(assetGenerations)
        .set({ progressionValeur: null, progressionMax: null, etapeLibelle: null, apercuFichier: null, apercuAt: null })
        .where(eq(assetGenerations.id, genId))
        .catch(() => undefined);
    },
  };
}

/** The steps of a video render that the screen can name (the node identifiers of the three graphs, see worker/comfyui/mappingThreeSteps.ts);
 * the other nodes do not change the displayed step. */
const ETAPES_VIDEO: Record<string, string> = {
  "5": "Lecture des références",
  "125:12": "Génération de la vidéo (MiniMax H3)",
  "243": "Agrandissement du latent",
  "135:26": "Raffinement de l'upscale",
  "176": "Décodage de la vidéo",
  "18": "Encodage du brouillon",
  "165": "Interpolation des images",
  "311": "Super-résolution",
  "34": "Encodage de la vidéo finale",
};
const libelleEtapeVideo = (noeud: string): string | null => ETAPES_VIDEO[noeud] ?? null;

/** Relay of the progress of a VIDEO RENDER to the database (the page and the header read these columns). No image preview. At most one write per
 * second. A render chains several prompts (generation, upscale, finishing): `definirEtape` puts « 2/3 · » in front of the label of each. */
export function creerRelaisJob(jobId: number) {
  const peutEcrire = limiteur(INTERVALLE_PROGRESSION_MS);
  let prefixe = "";
  let etape: string | null = null;
  let file: Promise<unknown> = Promise.resolve();
  const enfiler = (tache: () => Promise<unknown>) => {
    file = file.then(tache).catch(() => undefined);
  };
  const libelle = (l: string) => `${prefixe}${l}`.slice(0, 80);
  return {
    /** The prompt `rang` out of `total` starts: the label is empty until the first node that can name itself. */
    definirEtape(rang: number, total: number) {
      prefixe = total > 1 ? `${rang}/${total} · ` : "";
      etape = null;
    },
    surEvenement(e: EvenementSuivi) {
      if (e.type === "noeud") {
        const l = libelleEtapeVideo(e.noeud);
        if (l && libelle(l) !== etape) {
          etape = libelle(l);
          const libelleCourant = etape;
          enfiler(() => db.update(jobs).set({ etapeLibelle: libelleCourant, progressionValeur: null, progressionMax: null }).where(eq(jobs.id, jobId)));
        }
      } else if (e.type === "progression") {
        const l = libelleEtapeVideo(e.noeud);
        if (l) etape = libelle(l);
        if (!peutEcrire()) return;
        const patch = { progressionValeur: e.valeur, progressionMax: e.max, etapeLibelle: etape };
        enfiler(() => db.update(jobs).set(patch).where(eq(jobs.id, jobId)));
      }
    },
    async nettoyer() {
      await file;
      await db.update(jobs).set({ progressionValeur: null, progressionMax: null, etapeLibelle: null }).where(eq(jobs.id, jobId)).catch(() => undefined);
    },
  };
}
