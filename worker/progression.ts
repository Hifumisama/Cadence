import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations, jobs } from "../db/schema";
import { cheminGenerationMedia } from "../lib/media";
import { limiteur } from "./comfyui/limiteur";
import type { EvenementSuivi } from "./comfyui/types";

// Relais de la progression d'une génération d'images vers la base : le
// navigateur ne parle pas à ComfyUI, la page lit ces colonnes (rafraîchie toutes
// les 3 s). Débit limité : ComfyUI peut émettre plusieurs événements par
// seconde, l'écran n'en a pas besoin.

const INTERVALLE_PROGRESSION_MS = 1_000;
const INTERVALLE_APERCU_MS = 1_000;

const EXTENSION = { jpeg: "jpg", png: "png", webp: "webp", inconnu: "bin" } as const;

/** Libellé lisible d'un nœud : son titre dans le graphe, à défaut son type. */
export function libelleNoeud(graphe: Record<string, unknown>, noeud: string): string {
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
  // Les écritures s'enchaînent : jamais deux UPDATE concurrents sur la ligne.
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

    /** Fin de tâche (réussie ou non) : l'aperçu et la barre n'ont plus lieu d'être. */
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

/** Les étapes d'un rendu vidéo que l'écran sait nommer (les identifiants de nœuds du graphe VID_REF2VA, voir
 * worker/comfyui/mapping.ts) ; les autres nœuds ne changent pas l'étape affichée. */
const ETAPES_VIDEO: Record<string, string> = {
  "5": "Génération de la vidéo (MiniMax H3)",
  "165": "Interpolation des images",
  "176": "Décodage de la vidéo",
  "18": "Encodage de l'aperçu",
  "34": "Encodage de la vidéo finale",
};
export const libelleEtapeVideo = (noeud: string): string | null => ETAPES_VIDEO[noeud] ?? null;

/** Relais de la progression d'un RENDU VIDÉO vers la base (la page et le header lisent ces colonnes). Pas d'aperçu : la
 * génération H3 est un nœud d'API distant, il n'y a pas de latent à montrer. Au plus une écriture par seconde. */
export function creerRelaisJob(jobId: number) {
  const peutEcrire = limiteur(INTERVALLE_PROGRESSION_MS);
  let etape: string | null = null;
  let file: Promise<unknown> = Promise.resolve();
  const enfiler = (tache: () => Promise<unknown>) => {
    file = file.then(tache).catch(() => undefined);
  };
  return {
    surEvenement(e: EvenementSuivi) {
      if (e.type === "noeud") {
        const l = libelleEtapeVideo(e.noeud);
        if (l && l !== etape) {
          etape = l;
          enfiler(() => db.update(jobs).set({ etapeLibelle: l, progressionValeur: null, progressionMax: null }).where(eq(jobs.id, jobId)));
        }
      } else if (e.type === "progression") {
        const l = libelleEtapeVideo(e.noeud);
        if (l) etape = l;
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
