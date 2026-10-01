import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations } from "../db/schema";
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
