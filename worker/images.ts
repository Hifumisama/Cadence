import { access, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { assetGenerationSources, assetGenerations, assets } from "../db/schema";
import {
  CANDIDATS_GARDES,
  DUREE_TEST_VIDEO_SECONDES,
  METHODE_REPLIQUE,
  METHODE_TEST_AUDIO,
  METHODE_TEST_VIDEO,
  METHODE_VOIX,
  TEMPERATURE_VOIX_DEFAUT,
  estAspect,
  estMethodeSon,
  nomReferenceVoixDistante,
  nomSourceDistante,
  parametresTestAudio,
  parametresTestVideo,
} from "../lib/asset-generation";
import { annulationDemandeeImage, finirAnnulationImage } from "../lib/annulation-db";
import { adopterCandidat } from "../lib/generation-adoption";
import { balayerImportsOrphelins, supprimerGenerationEtFichiers } from "../lib/generation-sources";
import { cheminAssetMedia, cheminGenerationMedia, cheminRepliqueMedia, cheminSourceImportMedia } from "../lib/media";
import { poserPriseGeneree } from "../lib/replique-prise";
import { annulerCoteComfyUI, surveillerAnnulation } from "./annulation";
import type { ComfyUIClient } from "./comfyui";
import { NODE_IDS_AUDIO, injecterGenerationAudio } from "./comfyui/audioMapping";
import { ErreurEntreeInvalide, NODE_IDS, injecterValeurs, nomDistantDepuisChemin, verifierEntree } from "./comfyui/mapping";
import { NODE_IDS_VOIX, injecterGenerationVoix } from "./comfyui/voixMapping";
import { NODE_IDS_REPLIQUE, injecterGenerationReplique } from "./comfyui/repliqueMapping";
import {
  NODE_IDS_EDITION,
  NODE_IDS_TEXTE_VERS_IMAGE,
  injecterEditionImages,
  injecterGenerationImage,
  type WorkflowJson,
} from "./comfyui/imageMapping";
import type { RefMedia, Suivi, SubmissionInput } from "./comfyui/types";
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
const CHEMIN_WORKFLOW_REPLIQUE = () =>
  resolve(process.env.COMFYUI_WORKFLOW_REPLIQUE_PATH ?? "./workflows/audio/VOX_Generate_Replique_Simplified.json");
// Le test vidéo d'une voix passe par le même graphe que les plans (VID_REF2VA) : même variable que la tâche vidéo.
const CHEMIN_WORKFLOW_VIDEO = () =>
  resolve(process.env.COMFYUI_WORKFLOW_PATH ?? "./workflows/video-generation/VID_REF2VA.json");
// Une vidéo (H3) dure bien plus qu'une image : même plafond que les plans.
const DUREE_MAX_POLL_VIDEO_MS = 30 * 60_000;

/** Prises générées gardées par réplique dans la file (les lignes seulement : la prise courante est dans `repliques`). */
const GENERATIONS_REPLIQUE_GARDEES = 3;

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
    const replique = gen.methode === METHODE_REPLIQUE;
    const testAudio = gen.methode === METHODE_TEST_AUDIO;
    const testVideo = gen.methode === METHODE_TEST_VIDEO;
    // Une voix, une prise de réplique ou l'audio d'un test est un son pour tout ce qui suit (pas d'aperçu, fichier audio, pas de vignette).
    const audio = estMethodeSon(gen.methode);
    let graphe: WorkflowJson;
    if (replique) {
      if (gen.repliqueId == null || gen.texteReference == null || gen.temperature == null) {
        throw new Error("Réplique, texte ou créativité absents de la génération de réplique");
      }
      // La voix clonée est la référence de l'asset voix (assets/<fichier>) : sans elle, rien à cloner.
      if (!asset.fichier) throw new Error(`La voix ${asset.code} n'a pas de référence à cloner : génère-la d'abord au casting vocal.`);
      const local = join(mediaRoot, cheminAssetMedia(asset.fichier));
      try {
        await access(local);
      } catch {
        throw new Error(`Référence de la voix ${asset.code} introuvable sur le stockage (${asset.fichier})`);
      }
      const distant = nomReferenceVoixDistante(asset.code, (await stat(local)).mtimeMs, extname(asset.fichier).toLowerCase());
      await client.uploadRef(local, distant);
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW_REPLIQUE(), "utf-8")) as WorkflowJson;
      graphe = injecterGenerationReplique(brut, {
        texte: gen.texteReference,
        langue: gen.langueReference ?? "Auto",
        temperature: gen.temperature,
        seed: gen.seed,
        referenceDistante: distant,
        prefixeSortie: `audio/cadence_replique_${gen.repliqueId}`,
      });
    } else if (testAudio) {
      const p = parametresTestAudio(gen.parametres);
      if (!p) throw new ErreurEntreeInvalide("Voix de référence absente de la demande de test audio");
      const local = join(mediaRoot, p.reference);
      try {
        await access(local);
      } catch {
        throw new ErreurEntreeInvalide(`La voix de référence est introuvable sur le stockage (${p.reference})`);
      }
      const distant = nomDistantDepuisChemin(p.reference);
      await client.uploadRef(local, distant);
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW_REPLIQUE(), "utf-8")) as WorkflowJson;
      graphe = injecterGenerationReplique(brut, {
        texte: gen.prompt,
        langue: gen.langueReference ?? "French",
        temperature: TEMPERATURE_VOIX_DEFAUT,
        seed: gen.seed,
        referenceDistante: distant,
        prefixeSortie: `audio/cadence_test_${asset.code}`,
      });
    } else if (testVideo) {
      const p = parametresTestVideo(gen.parametres);
      if (!p) throw new ErreurEntreeInvalide("Références absentes de la demande de test vidéo");
      const ref = (cheminRelatif: string, slot: number): RefMedia => ({ slot, cheminLocal: join(mediaRoot, cheminRelatif), nomDistant: nomDistantDepuisChemin(cheminRelatif) });
      // Même numérotation que le prompt (lib/voix.ts:promptTestVoix) : le personnage est <Picture 1>, le décor le suivant.
      const refsImage: RefMedia[] = [];
      if (p.personnage) refsImage.push(ref(p.personnage, refsImage.length + 1));
      if (p.decor) refsImage.push(ref(p.decor, refsImage.length + 1));
      const entree: SubmissionInput = {
        promptAssemble: gen.prompt,
        seed: gen.seed,
        prefixeSortie: `cadence_test_${asset.code}_${gen.id}`,
        dureeSecondes: gen.dureeSecondes ?? DUREE_TEST_VIDEO_SECONDES,
        fps: 24,
        refsImage,
        refsAudio: p.audio ? [{ ...ref(p.audio, 1), dureeSecondes: null }] : [],
        refsVideo: [],
        activerUpscale: p.upscale,
      };
      verifierEntree(entree);
      for (const r of [...entree.refsImage, ...entree.refsAudio]) {
        try {
          await access(r.cheminLocal);
        } catch {
          throw new ErreurEntreeInvalide(`Une référence du test est introuvable sur le stockage (${r.cheminLocal})`);
        }
        await client.uploadRef(r.cheminLocal, r.nomDistant!);
      }
      const brut = JSON.parse(await readFile(CHEMIN_WORKFLOW_VIDEO(), "utf-8")) as WorkflowJson;
      graphe = injecterValeurs(brut, entree) as WorkflowJson;
    } else if (voix) {
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
    const noeudSortie = replique || testAudio ? NODE_IDS_REPLIQUE.sortie : testVideo ? NODE_IDS.sortieFinale : voix ? NODE_IDS_VOIX.sortie : audio ? NODE_IDS_AUDIO.sortie : edition ? NODE_IDS_EDITION.sortie : NODE_IDS_TEXTE_VERS_IMAGE.sortie;

    // Le WebSocket s'ouvre AVANT la soumission (sinon un prompt court finit avant
    // qu'on l'écoute). Il ne décide de rien : le résultat vient de /history, la
    // boucle ci-dessous, et si le WebSocket tombe on y retombe sans progression.
    relais = creerRelais({ genId: gen.id, genUuid: gen.uuid, assetId: gen.assetId, mediaRoot, graphe });
    // Un son n'a pas d'aperçu : les images de latent que le sampler pourrait
    // envoyer ne montreraient rien d'utile, on ne garde que la progression.
    const relaisActif = relais;
    suivi = await client.ouvrirSuivi((e) => {
      if ((audio || testVideo) && e.type === "apercu") return;
      relaisActif.surEvenement(e);
    });

    promptId = await client.submitGraph(graphe);
    await db.update(assetGenerations).set({ comfyuiPromptId: promptId }).where(eq(assetGenerations.id, gen.id));

    // L'attente du résultat et la sonde du drapeau d'annulation courent ensemble :
    // la plus rapide gagne.
    surveillance = surveillerAnnulation(() => annulationDemandeeImage(gen.id));
    const delaiMax = testVideo ? DUREE_MAX_POLL_VIDEO_MS : DUREE_MAX_POLL_MS;
    const issue = await Promise.race([suivi.attendre(promptId, delaiMax), surveillance.promesse]);
    if (issue === "annulee") return await annuler();

    const debut = Date.now();
    while (Date.now() - debut < delaiMax) {
      if (await annulationDemandeeImage(gen.id)) return await annuler();
      const r = await client.pollImage(promptId, noeudSortie);
      if (r.statut === "en_cours") {
        await new Promise((res) => setTimeout(res, INTERVALLE_POLL_MS));
        continue;
      }
      if (r.statut === "erreur") throw new Error(r.message);

      if (replique) {
        // Une prise de réplique ne devient pas un candidat de l'asset : elle est posée directement sur sa réplique.
        const nomPrise = `${gen.uuid}${extname(r.cheminSortieDistant).toLowerCase() || ".flac"}`;
        const cibleRep = join(mediaRoot, cheminRepliqueMedia(gen.repliqueId!, nomPrise));
        await mkdir(dirname(cibleRep), { recursive: true });
        await client.fetchOutput(r.cheminSortieDistant, cibleRep);
        const pose = await poserPriseGeneree(gen.repliqueId!, nomPrise, gen.texteReference ?? "", mediaRoot);
        if (!pose.ok) throw new Error(pose.erreur);
        await db.update(assetGenerations).set({ statut: "termine", fichier: null, finishedAt: new Date() }).where(eq(assetGenerations.id, gen.id));
        console.log(`[worker] Prise de réplique ${gen.repliqueId} (${asset.code}) posée : ${nomPrise}${pose.dureeSecondes != null ? ` · ${pose.dureeSecondes} s` : ""}`);
        await purgerAnciennesGenerationsReplique(gen.repliqueId!);
        return true;
      }

      const nom = `${gen.uuid}${audio ? extname(r.cheminSortieDistant).toLowerCase() || ".mp3" : testVideo ? extname(r.cheminSortieDistant).toLowerCase() || ".mp4" : ".png"}`;
      const cible = join(mediaRoot, cheminGenerationMedia(gen.assetId, nom));
      await mkdir(join(mediaRoot, "generations", String(gen.assetId)), { recursive: true });
      await client.fetchOutput(r.cheminSortieDistant, cible);
      await db
        .update(assetGenerations)
        .set({ statut: "termine", fichier: nom, finishedAt: new Date() })
        .where(eq(assetGenerations.id, gen.id));
      console.log(`[worker] Génération ${gen.id} (${asset.code}${testVideo ? ", test vidéo" : replique ? ", réplique" : testAudio ? ", test audio" : voix ? ", voix" : audio ? ", son" : ""}) terminée : ${nom}`);
      // Générée par un lot : le résultat est adopté tout seul (il devient l'image de l'asset).
      if (gen.adoptionAuto) {
        const r = await adopterCandidat(gen.id, mediaRoot);
        console.log(r.ok ? `[worker] Génération ${gen.id} adoptée automatiquement (${asset.code})` : `[worker] Adoption automatique impossible (${asset.code}) : ${r.erreur}`);
      }
      await purgerAnciens(gen.assetId, gen.methode, mediaRoot);
      return true;
    }
    throw new Error(`Délai de génération dépassé (${testVideo ? 30 : 10} min)`);
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

/** Les lignes de génération d'une réplique s'accumulent à chaque essai : on ne garde que les dernières terminées (il n'y a pas de
 * fichier à retirer, la prise courante vit dans `repliques`). */
async function purgerAnciennesGenerationsReplique(repliqueId: number): Promise<void> {
  const termines = await db
    .select({ id: assetGenerations.id })
    .from(assetGenerations)
    .where(and(eq(assetGenerations.repliqueId, repliqueId), eq(assetGenerations.statut, "termine")))
    .orderBy(desc(assetGenerations.createdAt), desc(assetGenerations.id));
  for (const vieux of termines.slice(GENERATIONS_REPLIQUE_GARDEES)) {
    await db.delete(assetGenerations).where(eq(assetGenerations.id, vieux.id));
  }
}

/** Ne garde que les derniers candidats terminés DE LA MÊME MÉTHODE (les essais d'un test audio ne chassent pas ceux de la voix de
 * référence) : ce sont des essais, pas un historique (F01). Les échecs et les demandes en cours ne comptent pas. */
async function purgerAnciens(assetId: number, methode: string, mediaRoot: string): Promise<void> {
  const termines = await db
    .select()
    .from(assetGenerations)
    .where(and(eq(assetGenerations.assetId, assetId), eq(assetGenerations.methode, methode), isNull(assetGenerations.repliqueId), inArray(assetGenerations.statut, ["termine"])))
    .orderBy(desc(assetGenerations.createdAt));
  for (const vieux of termines.slice(CANDIDATS_GARDES)) {
    await supprimerGenerationEtFichiers(vieux, mediaRoot);
  }
  await balayerImportsOrphelins(assetId, mediaRoot);
}
