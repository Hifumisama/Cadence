import { access, mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { assetGenerationSources, assetGenerations, assets } from "../db/schema";
import { CANDIDATS_GARDES, estAspect, nomSourceDistante } from "../lib/asset-generation";
import { balayerImportsOrphelins, supprimerGenerationEtFichiers } from "../lib/generation-sources";
import { cheminAssetMedia, cheminGenerationMedia, cheminSourceImportMedia } from "../lib/media";
import type { ComfyUIClient } from "./comfyui";
import {
  NODE_IDS_EDITION,
  NODE_IDS_TEXTE_VERS_IMAGE,
  injecterEditionImages,
  injecterGenerationImage,
  type WorkflowJson,
} from "./comfyui/imageMapping";
import type { Suivi } from "./comfyui/types";
import { creerRelais } from "./progression";

// Tâche d'images d'asset : text-to-image (Krea 2 Turbo, IMG_01_TextToImage,
// méthode « generation ») ou à partir de 1 à 3 images (Qwen Image Edit 2511,
// IMG_Simple_Edit, méthode « edition »). Une génération n'est
// pas rejouée automatiquement : un échec s'affiche avec son message et
// l'utilisateur relance (contrairement aux plans H3, une image se refait en
// quelques secondes). Une API ComfyUI injoignable ne consomme rien : la demande
// reste en attente (même règle que F04).

const INTERVALLE_POLL_MS = 2_000;
const DUREE_MAX_POLL_MS = 10 * 60_000;
const CHEMIN_WORKFLOW = () =>
  resolve(process.env.COMFYUI_WORKFLOW_IMAGE_PATH ?? "./workflows/image-refs/IMG_01_TextToImage.json");
const CHEMIN_WORKFLOW_EDITION = () =>
  resolve(process.env.COMFYUI_WORKFLOW_EDITION_PATH ?? "./workflows/image-refs/IMG_Simple_Edit.json");

type Generation = typeof assetGenerations.$inferSelect;

/** Envoie les sources de la génération au dossier d'entrée de ComfyUI et renvoie
 * leurs noms distants, dans l'ordre. Une source disparue du stockage est une
 * erreur franche (l'asset a pu être remplacé ou supprimé depuis le lancement). */
async function envoyerSources(client: ComfyUIClient, gen: Generation, mediaRoot: string): Promise<string[]> {
  const sources = await db
    .select()
    .from(assetGenerationSources)
    .where(eq(assetGenerationSources.generationId, gen.id))
    .orderBy(assetGenerationSources.position);
  if (sources.length === 0) throw new Error("Aucune image source enregistrée pour cette édition");

  const noms: string[] = [];
  for (const src of sources) {
    const relatif = src.origine === "asset" ? cheminAssetMedia(src.fichier) : cheminSourceImportMedia(gen.assetId, src.fichier);
    const local = join(mediaRoot, relatif);
    try {
      await access(local);
    } catch {
      throw new Error(`Image source ${src.position} introuvable sur le stockage (${src.fichier})`);
    }
    const distant = nomSourceDistante(gen.uuid, src.position, extname(src.fichier).toLowerCase() || ".png");
    await client.uploadRef(local, distant);
    noms.push(distant);
  }
  return noms;
}

/** La plus ancienne demande en attente (FIFO), ou null. Le worker la compare à la
 * prochaine vidéo (worker/ordonnanceur.ts) avant de choisir. */
export async function prochaineGenerationEnAttente(): Promise<Generation | null> {
  const [gen] = await db
    .select()
    .from(assetGenerations)
    .where(eq(assetGenerations.statut, "en_attente"))
    .orderBy(assetGenerations.createdAt, assetGenerations.id)
    .limit(1);
  return gen ?? null;
}

/** Traite une demande. Renvoie `true` si elle a été prise (réussie ou échouée),
 * `false` si ComfyUI est injoignable : elle reste alors en attente et le worker
 * patiente avant de réessayer. */
export async function traiterGenerationImage(client: ComfyUIClient, gen: Generation, mediaRoot: string): Promise<boolean> {
  if (!(await client.healthcheck())) {
    console.log(`[worker] ComfyUI injoignable — génération ${gen.id} reste en_attente`);
    return false;
  }

  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) {
    // Ne devrait pas arriver (suppression en cascade) ; surtout ne pas la laisser
    // en tête de file : elle bloquerait toutes les tâches derrière elle.
    await db
      .update(assetGenerations)
      .set({ statut: "echoue", erreur: "Asset introuvable", finishedAt: new Date() })
      .where(eq(assetGenerations.id, gen.id));
    return true;
  }

  await db.update(assetGenerations).set({ statut: "en_cours", startedAt: new Date(), erreur: null }).where(eq(assetGenerations.id, gen.id));

  let suivi: Suivi | null = null;
  let relais: ReturnType<typeof creerRelais> | null = null;
  try {
    const edition = gen.methode === "edition";
    let graphe: WorkflowJson;
    if (edition) {
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW_EDITION(), "utf-8")) as WorkflowJson;
      graphe = injecterEditionImages(brut, {
        prompt: gen.prompt,
        seed: gen.seed,
        lightning: gen.lightning ?? true,
        sourcesDistantes: await envoyerSources(client, gen, mediaRoot),
        prefixeSortie: `cadence_${asset.code}`,
      });
    } else {
      if (!estAspect(gen.aspect)) throw new Error(`Format inconnu : ${gen.aspect}`);
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW(), "utf-8")) as WorkflowJson;
      graphe = injecterGenerationImage(brut, {
        prompt: gen.prompt,
        clauseStyle: gen.clauseStyle,
        aspect: gen.aspect,
        megapixels: gen.megapixels,
        seed: gen.seed,
        loraPersonnage: gen.loraPersonnage,
        prefixeSortie: `cadence_${asset.code}`,
      });
    }
    const noeudSortie = edition ? NODE_IDS_EDITION.sortie : NODE_IDS_TEXTE_VERS_IMAGE.sortie;

    // Le WebSocket s'ouvre AVANT la soumission (sinon un prompt court finit avant
    // qu'on l'écoute). Il ne décide de rien : le résultat vient de /history, la
    // boucle ci-dessous, et si le WebSocket tombe on y retombe sans progression.
    relais = creerRelais({ genId: gen.id, genUuid: gen.uuid, assetId: gen.assetId, mediaRoot, graphe });
    suivi = await client.ouvrirSuivi(relais.surEvenement);

    const promptId = await client.submitGraph(graphe);
    await db.update(assetGenerations).set({ comfyuiPromptId: promptId }).where(eq(assetGenerations.id, gen.id));

    const debut = Date.now();
    await suivi.attendre(promptId, DUREE_MAX_POLL_MS);
    while (Date.now() - debut < DUREE_MAX_POLL_MS) {
      const r = await client.pollImage(promptId, noeudSortie);
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
      return true;
    }
    throw new Error("Délai de génération dépassé (10 min)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Génération ${gen.id} échouée : ${message}`);
    await db
      .update(assetGenerations)
      .set({ statut: "echoue", erreur: message, finishedAt: new Date() })
      .where(eq(assetGenerations.id, gen.id));
  } finally {
    suivi?.fermer();
    await relais?.nettoyer();
  }
  return true;
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
    await supprimerGenerationEtFichiers(vieux, mediaRoot);
  }
  await balayerImportsOrphelins(assetId, mediaRoot);
}
