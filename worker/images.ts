import { access, mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { assetGenerationSources, assetGenerations, assets } from "../db/schema";
import { CANDIDATS_GARDES, METHODE_AUDIO, METHODE_VOIX, estAspect, nomSourceDistante } from "../lib/asset-generation";
import { annulationDemandeeImage, finirAnnulationImage } from "../lib/annulation-db";
import { adopterCandidat } from "../lib/generation-adoption";
import { balayerImportsOrphelins, supprimerGenerationEtFichiers } from "../lib/generation-sources";
import { cheminAssetMedia, cheminGenerationMedia, cheminSourceImportMedia } from "../lib/media";
import { annulerCoteComfyUI, surveillerAnnulation } from "./annulation";
import type { ComfyUIClient } from "./comfyui";
import { NODE_IDS_AUDIO, injecterGenerationAudio } from "./comfyui/audioMapping";
import { NODE_IDS_VOIX, injecterGenerationVoix } from "./comfyui/voixMapping";
import {
  NODE_IDS_EDITION,
  NODE_IDS_TEXTE_VERS_IMAGE,
  injecterEditionImages,
  injecterGenerationImage,
  type WorkflowJson,
} from "./comfyui/imageMapping";
import type { Suivi } from "./comfyui/types";
import { creerRelais } from "./progression";

// Tâche de génération d'asset : text-to-image (Krea 2 Turbo, IMG_01_TextToImage,
// méthode « generation »), à partir de 1 à 3 images (Qwen Image Edit 2511,
// IMG_Simple_Edit, méthode « edition »), son (Stable Audio 3,
// SFX_Generate_Sounds, méthode « audio ») ou voix de référence (Qwen3-TTS Voice Design,
// VOX_Generate_Voice_Simplified, méthode « voix »). Une génération n'est
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
const CHEMIN_WORKFLOW_AUDIO = () =>
  resolve(process.env.COMFYUI_WORKFLOW_AUDIO_PATH ?? "./workflows/audio/SFX_Generate_Sounds.json");
const CHEMIN_WORKFLOW_VOIX = () =>
  resolve(process.env.COMFYUI_WORKFLOW_VOIX_PATH ?? "./workflows/audio/VOX_Generate_Voice_Simplified.json");

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

  // Prise gardée par le statut : une demande annulée entre-temps (annulation d'une
  // tâche en attente, directe) ne doit pas être ressuscitée.
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

  /** Annulation demandée pendant l'exécution : on interrompt ComfyUI (après avoir
   * vérifié dans /queue que c'est bien notre prompt), on ne récupère rien, la
   * génération devient « annulée ». Jamais comptée comme un échec. */
  const annuler = async (): Promise<boolean> => {
    const issue = promptId ? await annulerCoteComfyUI(client, promptId) : "rien";
    console.log(`[worker] Génération ${gen.id} (${asset.code}) annulée (${issue})`);
    await finirAnnulationImage(gen.id);
    return true;
  };

  try {
    const edition = gen.methode === "edition";
    const voix = gen.methode === METHODE_VOIX;
    // Une voix est un son pour tout ce qui suit (pas d'aperçu, fichier audio, pas de vignette).
    const audio = gen.methode === METHODE_AUDIO || voix;
    let graphe: WorkflowJson;
    if (voix) {
      if (gen.texteReference == null || gen.temperature == null) throw new Error("Texte de référence ou créativité absents de la génération de voix");
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW_VOIX(), "utf-8")) as WorkflowJson;
      graphe = injecterGenerationVoix(brut, {
        instruction: gen.prompt,
        texteReference: gen.texteReference,
        langue: gen.langueReference ?? "English",
        temperature: gen.temperature,
        seed: gen.seed,
        prefixeSortie: `audio/cadence_${asset.code}`,
      });
    } else if (audio) {
      if (gen.dureeSecondes == null) throw new Error("Durée absente de la génération audio");
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW_AUDIO(), "utf-8")) as WorkflowJson;
      graphe = injecterGenerationAudio(brut, {
        prompt: gen.prompt,
        dureeSecondes: gen.dureeSecondes,
        seed: gen.seed,
        prefixeSortie: `audio/cadence_${asset.code}`,
      });
    } else if (edition) {
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
    const noeudSortie = voix ? NODE_IDS_VOIX.sortie : audio ? NODE_IDS_AUDIO.sortie : edition ? NODE_IDS_EDITION.sortie : NODE_IDS_TEXTE_VERS_IMAGE.sortie;

    // Le WebSocket s'ouvre AVANT la soumission (sinon un prompt court finit avant
    // qu'on l'écoute). Il ne décide de rien : le résultat vient de /history, la
    // boucle ci-dessous, et si le WebSocket tombe on y retombe sans progression.
    relais = creerRelais({ genId: gen.id, genUuid: gen.uuid, assetId: gen.assetId, mediaRoot, graphe });
    // Un son n'a pas d'aperçu : les images de latent que le sampler pourrait
    // envoyer ne montreraient rien d'utile, on ne garde que la progression.
    const relaisActif = relais;
    suivi = await client.ouvrirSuivi((e) => {
      if (audio && e.type === "apercu") return;
      relaisActif.surEvenement(e);
    });

    promptId = await client.submitGraph(graphe);
    await db.update(assetGenerations).set({ comfyuiPromptId: promptId }).where(eq(assetGenerations.id, gen.id));

    // L'attente du résultat et la sonde du drapeau d'annulation courent ensemble :
    // la plus rapide gagne.
    surveillance = surveillerAnnulation(() => annulationDemandeeImage(gen.id));
    const issue = await Promise.race([suivi.attendre(promptId, DUREE_MAX_POLL_MS), surveillance.promesse]);
    if (issue === "annulee") return await annuler();

    const debut = Date.now();
    while (Date.now() - debut < DUREE_MAX_POLL_MS) {
      if (await annulationDemandeeImage(gen.id)) return await annuler();
      const r = await client.pollImage(promptId, noeudSortie);
      if (r.statut === "en_cours") {
        await new Promise((res) => setTimeout(res, INTERVALLE_POLL_MS));
        continue;
      }
      if (r.statut === "erreur") throw new Error(r.message);

      const nom = `${gen.uuid}${audio ? extname(r.cheminSortieDistant).toLowerCase() || ".mp3" : ".png"}`;
      const cible = join(mediaRoot, cheminGenerationMedia(gen.assetId, nom));
      await mkdir(join(mediaRoot, "generations", String(gen.assetId)), { recursive: true });
      await client.fetchOutput(r.cheminSortieDistant, cible);
      await db
        .update(assetGenerations)
        .set({ statut: "termine", fichier: nom, finishedAt: new Date() })
        .where(eq(assetGenerations.id, gen.id));
      console.log(`[worker] Génération ${gen.id} (${asset.code}${voix ? ", voix" : audio ? ", son" : ""}) terminée : ${nom}`);
      // Générée par un lot : le résultat est adopté tout seul (il devient l'image de l'asset).
      if (gen.adoptionAuto) {
        const r = await adopterCandidat(gen.id, mediaRoot);
        console.log(r.ok ? `[worker] Génération ${gen.id} adoptée automatiquement (${asset.code})` : `[worker] Adoption automatique impossible (${asset.code}) : ${r.erreur}`);
      }
      await purgerAnciens(gen.assetId, mediaRoot);
      return true;
    }
    throw new Error("Délai de génération dépassé (10 min)");
  } catch (err) {
    // Annulation demandée puis erreur (ComfyUI interrompu, réseau) : c'est une
    // annulation, pas un échec.
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
