import { mkdir, readFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations, assets } from "../db/schema";
import { CANDIDATS_GARDES, estAspect } from "../lib/asset-generation";
import { cheminGenerationMedia } from "../lib/media";
import type { ComfyUIClient } from "./comfyui";
import { NODE_IDS_TEXTE_VERS_IMAGE, injecterGenerationImage, type WorkflowJson } from "./comfyui/imageMapping";

// Tâche d'images d'asset : text-to-image (Krea 2 Turbo, IMG_01_TextToImage).
// L'édition (Qwen Image Edit) viendra sur le même modèle. Une génération n'est
// pas rejouée automatiquement : un échec s'affiche avec son message et
// l'utilisateur relance (contrairement aux plans H3, une image se refait en
// quelques secondes). Une API ComfyUI injoignable ne consomme rien : la demande
// reste en attente (même règle que F04).

const INTERVALLE_POLL_MS = 2_000;
const DUREE_MAX_POLL_MS = 10 * 60_000;
const CHEMIN_WORKFLOW = () =>
  resolve(process.env.COMFYUI_WORKFLOW_IMAGE_PATH ?? "./workflows/image-refs/IMG_01_TextToImage.json");

export async function traiterProchaineGenerationImage(client: ComfyUIClient, mediaRoot: string): Promise<void> {
  const [gen] = await db
    .select()
    .from(assetGenerations)
    .where(and(eq(assetGenerations.statut, "en_attente"), eq(assetGenerations.methode, "generation")))
    .orderBy(assetGenerations.createdAt)
    .limit(1);
  if (!gen) return;

  if (!(await client.healthcheck())) {
    console.log(`[worker] ComfyUI injoignable — génération ${gen.id} reste en_attente`);
    return;
  }

  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) return;

  await db.update(assetGenerations).set({ statut: "en_cours", startedAt: new Date(), erreur: null }).where(eq(assetGenerations.id, gen.id));

  try {
    if (!estAspect(gen.aspect)) throw new Error(`Format inconnu : ${gen.aspect}`);
    const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW(), "utf-8")) as WorkflowJson;
    const graphe = injecterGenerationImage(brut, {
      prompt: gen.prompt,
      clauseStyle: gen.clauseStyle,
      aspect: gen.aspect,
      megapixels: gen.megapixels,
      seed: gen.seed,
      loraPersonnage: gen.loraPersonnage,
      prefixeSortie: `cadence_${asset.code}`,
    });

    const promptId = await client.submitGraph(graphe);
    await db.update(assetGenerations).set({ comfyuiPromptId: promptId }).where(eq(assetGenerations.id, gen.id));

    const debut = Date.now();
    while (Date.now() - debut < DUREE_MAX_POLL_MS) {
      const r = await client.pollImage(promptId, NODE_IDS_TEXTE_VERS_IMAGE.sortie);
      if (r.statut === "en_cours") {
        await new Promise((res) => setTimeout(res, INTERVALLE_POLL_MS));
        continue;
      }
      if (r.statut === "erreur") throw new Error(r.message);

      const nom = `${gen.uuid}.png`;
      const cible = join(mediaRoot, cheminGenerationMedia(gen.assetId, nom));
      await mkdir(join(mediaRoot, "generations", String(gen.assetId)), { recursive: true });
      await client.fetchOutput(r.cheminSortieDistant, cible);
      await db
        .update(assetGenerations)
        .set({ statut: "termine", fichier: nom, finishedAt: new Date() })
        .where(eq(assetGenerations.id, gen.id));
      console.log(`[worker] Génération ${gen.id} (${asset.code}) terminée : ${nom}`);
      await purgerAnciens(gen.assetId, mediaRoot);
      return;
    }
    throw new Error("Délai de génération dépassé (10 min)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Génération ${gen.id} échouée : ${message}`);
    await db
      .update(assetGenerations)
      .set({ statut: "echoue", erreur: message, finishedAt: new Date() })
      .where(eq(assetGenerations.id, gen.id));
  }
}

/** Ne garde que les derniers candidats terminés : ce sont des essais, pas un
 * historique (F01). Les échecs et les demandes en cours ne comptent pas. */
async function purgerAnciens(assetId: number, mediaRoot: string): Promise<void> {
  const termines = await db
    .select()
    .from(assetGenerations)
    .where(and(eq(assetGenerations.assetId, assetId), inArray(assetGenerations.statut, ["termine"])))
    .orderBy(desc(assetGenerations.createdAt));
  for (const vieux of termines.slice(CANDIDATS_GARDES)) {
    if (vieux.fichier) await unlink(join(mediaRoot, cheminGenerationMedia(assetId, vieux.fichier))).catch(() => undefined);
    await db.delete(assetGenerations).where(eq(assetGenerations.id, vieux.id));
  }
}
