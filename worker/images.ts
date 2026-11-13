import { access, mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { assetGenerationSources, assetGenerations, assets, creationsProjet } from "../db/schema";
import { CANDIDATS_GARDES, estAspect, nomSourceDistante } from "../lib/assets/asset-generation";
import { TYPE_AFFICHE } from "../lib/posters/posters";
import { annulationDemandeeImage, finirAnnulationImage } from "../lib/tasks/cancellation-db";
import { adopterCandidat } from "../lib/assets/generation-adoption";
import { balayerImportsOrphelins, supprimerGenerationEtFichiers } from "../lib/assets/generation-sources";
import { cheminAssetMedia, cheminGenerationMedia, cheminSourceImportMedia } from "../lib/media";
import { annulerCoteComfyUI, surveillerAnnulation } from "./cancellation";
import { cheminCanevasAffiche } from "./canvas-poster";
import type { ComfyUIClient } from "./comfyui";
import {
  NODE_IDS_EDITION,
  NODE_IDS_TEXTE_VERS_IMAGE,
  injecterEditionImages,
  injecterGenerationImage,
  type WorkflowJson,
} from "./comfyui/imageMapping";
import type { Suivi } from "./comfyui/types";
import { attendreResultat } from "./waiting";
import { creerRelais } from "./progress";

// Asset generation task: text-to-image (Krea 2 Turbo, IMG_01_TextToImage,
// method « generation »), from 1 to 3 images (Qwen Image Edit 2511,
// IMG_Simple_Edit, method « edition »). A generation is
// not replayed automatically: a failure is shown with its message and
// the user restarts it (unlike H3 clips, an image is redone in a
// few seconds). An unreachable ComfyUI API consumes nothing: the request
// stays pending (same rule as F04).

const INTERVALLE_POLL_MS = 2_000;
const DUREE_MAX_POLL_MS = 10 * 60_000;
const CHEMIN_WORKFLOW = () =>
  resolve(process.env.COMFYUI_WORKFLOW_IMAGE_PATH ?? "./workflows/image-refs/IMG_01_TextToImage.json");
const CHEMIN_WORKFLOW_EDITION = () =>
  resolve(process.env.COMFYUI_WORKFLOW_EDITION_PATH ?? "./workflows/image-refs/IMG_Simple_Edit.json");
type Generation = typeof assetGenerations.$inferSelect;

/** Sends the generation's sources to ComfyUI's input folder and returns
 * their remote names, in order. A source gone from the storage is a
 * clear error (the asset may have been replaced or deleted since launch). */
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

/** Sources of an edit. For a poster from the old path (without instruction; an attempt on the sheet sets its own canvas), a blank 2:3 canvas becomes image 1: Qwen's output follows the format of
 * image 1, and without it a 16:9 character sheet would give a 16:9 poster. The character (the recorded source)
 * becomes image 2. */
async function sourcesEdition(client: ComfyUIClient, gen: Generation, mediaRoot: string, affiche: boolean): Promise<string[]> {
  const sources = await envoyerSources(client, gen, mediaRoot);
  if (!affiche) return sources;
  if (sources.length > 2) throw new Error("Une affiche éditée prend 2 images au plus (le canevas occupe la première des 3 places)");
  const local = await cheminCanevasAffiche(join(mediaRoot, "_canevas"));
  const distant = nomSourceDistante(gen.uuid, 0, ".png");
  await client.uploadRef(local, distant);
  return [distant, ...sources];
}

/** A project's images wait for the end of its creation (2026-10-19): while the LLM writes, generating them at the same time
 * slows both down (measured on « Le dernier train »: an H3 clip at 2.4 tokens/s instead of ~60 during the first images,
 * about 3 min lost out of 25). `WORKER_IMAGES_PENDANT_CREATION=1` restores the overlap. */
const IMAGES_PENDANT_CREATION = process.env.WORKER_IMAGES_PENDANT_CREATION === "1";

/** The oldest pending request (FIFO), or null. The worker compares it to the
 * next video (worker/scheduler.ts) before choosing. */
export async function prochaineGenerationEnAttente(): Promise<Generation | null> {
  const [gen] = await db
    .select({ g: assetGenerations })
    .from(assetGenerations)
    .innerJoin(assets, eq(assets.id, assetGenerations.assetId))
    .where(
      and(
        eq(assetGenerations.statut, "en_attente"),
        IMAGES_PENDANT_CREATION
          ? undefined
          : sql`not exists (select 1 from ${creationsProjet} where ${creationsProjet.projectId} = ${assets.projectId} and ${creationsProjet.statut} = 'en_cours')`,
      ),
    )
    .orderBy(assetGenerations.createdAt, assetGenerations.id)
    .limit(1);
  return gen?.g ?? null;
}

/** Processes a request. Returns `true` if it was taken (succeeded or failed),
 * `false` if ComfyUI is unreachable: it then stays pending and the worker
 * waits before retrying. */
export async function traiterGenerationImage(client: ComfyUIClient, gen: Generation, mediaRoot: string): Promise<boolean> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) {
    // Should not happen (cascade deletion); above all do not leave it
    // at the head of the queue: it would block all the tasks behind it.
    await db
      .update(assetGenerations)
      .set({ statut: "echoue", erreur: "Asset introuvable", finishedAt: new Date() })
      .where(eq(assetGenerations.id, gen.id));
    return true;
  }

  // Taking guarded by the status: a request cancelled in the meantime (direct cancellation of a
  // pending task) must not be revived.
  const prise = await db
    .update(assetGenerations)
    .set({ statut: "en_cours", startedAt: new Date(), erreur: null })
    .where(and(eq(assetGenerations.id, gen.id), eq(assetGenerations.statut, "en_attente")))
    .returning({ id: assetGenerations.id });
  if (prise.length === 0) return true;

  let suivi: Suivi | null = null;
  let relais: ReturnType<typeof creerRelais> | null = null;
  let promptId: string | null = null;
  let surveillance: ReturnType<typeof surveillerAnnulation> | null = null;

  /** Cancellation requested during execution: we interrupt ComfyUI (after having
   * checked in /queue that it is indeed our prompt), we retrieve nothing, the
   * generation becomes « annulée ». Never counted as a failure. */
  const annuler = async (): Promise<boolean> => {
    const issue = promptId ? await annulerCoteComfyUI(client, promptId) : "rien";
    console.log(`[worker] Génération ${gen.id} (${asset.code}) annulée (${issue})`);
    await finirAnnulationImage(gen.id);
    return true;
  };

  try {
    const edition = gen.methode === "edition";
    let graphe: WorkflowJson;
    if (edition) {
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW_EDITION(), "utf-8")) as WorkflowJson;
      graphe = injecterEditionImages(brut, {
        prompt: gen.prompt,
        clauseStyle: gen.clauseStyle, // the short clause, set on demand (styleDesEditions); "" for old requests
        seed: gen.seed,
        lightning: gen.lightning ?? true,
        sourcesDistantes: await sourcesEdition(client, gen, mediaRoot, asset.type === TYPE_AFFICHE && gen.consigne == null),
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
        prefixeSortie: `cadence_${asset.code}`,
      });
    }
    const noeudSortie = edition ? NODE_IDS_EDITION.sortie : NODE_IDS_TEXTE_VERS_IMAGE.sortie;

    // The WebSocket opens BEFORE the submission (otherwise a short prompt finishes before
    // we listen). It decides nothing: the result comes from /history, the
    // loop below, and if the WebSocket drops we fall back to it without progress.
    relais = creerRelais({ genId: gen.id, genUuid: gen.uuid, assetId: gen.assetId, mediaRoot, graphe });
    const relaisActif = relais;
    suivi = await client.ouvrirSuivi((e) => relaisActif.surEvenement(e));

    promptId = await client.submitGraph(graphe);
    await db.update(assetGenerations).set({ comfyuiPromptId: promptId }).where(eq(assetGenerations.id, gen.id));

    // The wait for the result and the cancellation flag probe run together:
    // the fastest wins.
    surveillance = surveillerAnnulation(() => annulationDemandeeImage(gen.id));
    const idPrompt = promptId;
    const r = await attendreResultat({
      suivi,
      promptId: idPrompt,
      delaiMs: DUREE_MAX_POLL_MS,
      intervalleMs: INTERVALLE_POLL_MS,
      lire: () => client.pollImage(idPrompt, noeudSortie),
      surveillance,
    });
    if (r === "annulee") return await annuler();
    if (r === "delai") throw new Error(`Délai de génération dépassé (10 min)`);
    if (r.statut === "erreur") throw new Error(r.message);

    {
      const nom = `${gen.uuid}.png`;
      const cible = join(mediaRoot, cheminGenerationMedia(gen.assetId, nom));
      await mkdir(join(mediaRoot, "generations", String(gen.assetId)), { recursive: true });
      await client.fetchOutput(r.cheminSortieDistant, cible);
      await db
        .update(assetGenerations)
        .set({ statut: "termine", fichier: nom, finishedAt: new Date() })
        .where(eq(assetGenerations.id, gen.id));
      console.log(`[worker] Génération ${gen.id} (${asset.code}) terminée : ${nom}`);
      // Generated by a batch: the result is adopted on its own (it becomes the asset's image).
      if (gen.adoptionAuto) {
        const r = await adopterCandidat(gen.id, mediaRoot);
        console.log(r.ok ? `[worker] Génération ${gen.id} adoptée automatiquement (${asset.code})` : `[worker] Adoption automatique impossible (${asset.code}) : ${r.erreur}`);
      }
      await purgerAnciens(gen.assetId, gen.methode, mediaRoot);
      return true;
    }
  } catch (err) {
    // Cancellation requested then error (ComfyUI interrupted, network): it is a
    // cancellation, not a failure.
    if (await annulationDemandeeImage(gen.id).catch(() => false)) return await annuler();
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Génération ${gen.id} échouée : ${message}`);
    await db
      .update(assetGenerations)
      .set({ statut: "echoue", erreur: message, finishedAt: new Date() })
      .where(eq(assetGenerations.id, gen.id));
  } finally {
    surveillance?.arreter();
    suivi?.fermer();
    await relais?.nettoyer();
  }
  return true;
}

/** Keeps only the latest finished candidates OF THE SAME METHOD (generation and edition do not chase each other out): they are attempts, not a history (F01). Failures and requests in progress do not count. */
async function purgerAnciens(assetId: number, methode: string, mediaRoot: string): Promise<void> {
  const termines = await db
    .select()
    .from(assetGenerations)
    .where(and(eq(assetGenerations.assetId, assetId), eq(assetGenerations.methode, methode), inArray(assetGenerations.statut, ["termine"])))
    .orderBy(desc(assetGenerations.createdAt));
  for (const vieux of termines.slice(CANDIDATS_GARDES)) {
    await supprimerGenerationEtFichiers(vieux, mediaRoot);
  }
  await balayerImportsOrphelins(assetId, mediaRoot);
}
