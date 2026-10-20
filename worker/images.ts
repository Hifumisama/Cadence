import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { assetGenerationSources, assetGenerations, assets, creationsProjet } from "../db/schema";
import {
  CANDIDATS_GARDES,
  DUREE_TEST_VIDEO_SECONDES,
  METHODE_MASTER_VOIX,
  estAspect,
  estMethodeSon,
  nomSourceDistante,
  videoDeMaster,
  parametresMasterVoix,
} from "../lib/asset-generation";
import { TYPE_AFFICHE } from "../lib/affiches";
import { annulationDemandeeImage, finirAnnulationImage } from "../lib/annulation-db";
import { adopterCandidat } from "../lib/generation-adoption";
import { extraireAudioDeVideo } from "../lib/extraction-audio";
import { balayerImportsOrphelins, supprimerGenerationEtFichiers } from "../lib/generation-sources";
import { cheminAssetMedia, cheminGenerationMedia, cheminSourceImportMedia } from "../lib/media";
import { annulerCoteComfyUI, surveillerAnnulation } from "./annulation";
import { cheminCanevasAffiche } from "./canevas-affiche";
import type { ComfyUIClient } from "./comfyui";
import { NODE_IDS_AUDIO, injecterGenerationAudio } from "./comfyui/audioMapping";
import { ErreurEntreeInvalide, injecterValeurs, nomDistantDepuisChemin, verifierEntree } from "./comfyui/mapping";
import { NODE_IDS_MASTER } from "./comfyui/masterMapping";
import { mp3Factice } from "./comfyui/stubAudio";
import {
  NODE_IDS_EDITION,
  NODE_IDS_TEXTE_VERS_IMAGE,
  injecterEditionImages,
  injecterGenerationImage,
  type WorkflowJson,
} from "./comfyui/imageMapping";
import type { RefMedia, Suivi, SubmissionInput } from "./comfyui/types";
import { attendreResultat } from "./attente";
import { creerRelais } from "./progression";

// Tâche de génération d'asset : text-to-image (Krea 2 Turbo, IMG_01_TextToImage,
// méthode « generation »), à partir de 1 à 3 images (Qwen Image Edit 2511,
// IMG_Simple_Edit, méthode « edition »), son (Stable Audio 3,
// SFX_Generate_Sounds, méthode « audio »). Une génération n'est
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
// Le test vidéo d'une voix passe par le même graphe que les plans (VID_REF2VA) : même variable que la tâche vidéo.
const CHEMIN_WORKFLOW_VIDEO = () =>
  resolve(process.env.COMFYUI_WORKFLOW_PATH ?? "./workflows/video-generation/VID_REF2VA.json");
// Le master de voix : variante du graphe vidéo qui sort aussi la voix nettoyée (workflows/audio/VID_Create_Voice_Master.json).
const CHEMIN_WORKFLOW_MASTER = () =>
  resolve(process.env.COMFYUI_WORKFLOW_MASTER_PATH ?? "./workflows/audio/VID_Create_Voice_Master.json");
// Une vidéo (H3) dure bien plus qu'une image : même plafond que les plans.
const DUREE_MAX_POLL_VIDEO_MS = 30 * 60_000;

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

/** Sources d'une édition. Pour une affiche, un canevas vide 2:3 passe en image 1 : la sortie de Qwen suit le format de
 * l'image 1, et sans lui une fiche personnage 16:9 donnerait une affiche 16:9. Le personnage (la source enregistrée)
 * devient l'image 2. */
async function sourcesEdition(client: ComfyUIClient, gen: Generation, mediaRoot: string, affiche: boolean): Promise<string[]> {
  const sources = await envoyerSources(client, gen, mediaRoot);
  if (!affiche) return sources;
  if (sources.length > 2) throw new Error("Une affiche éditée prend 2 images au plus (le canevas occupe la première des 3 places)");
  const local = await cheminCanevasAffiche(join(mediaRoot, "_canevas"));
  const distant = nomSourceDistante(gen.uuid, 0, ".png");
  await client.uploadRef(local, distant);
  return [distant, ...sources];
}

/** Les images d'un projet attendent la fin de sa création (2026-10-19) : pendant que le LLM écrit, les générer en même temps
 * ralentit les deux (mesuré sur « Le dernier train » : un plan H3 à 2,4 jetons/s au lieu de ~60 pendant les premières images,
 * environ 3 min perdues sur 25). `WORKER_IMAGES_PENDANT_CREATION=1` rétablit le recouvrement. */
const IMAGES_PENDANT_CREATION = process.env.WORKER_IMAGES_PENDANT_CREATION === "1";

/** La plus ancienne demande en attente (FIFO), ou null. Le worker la compare à la
 * prochaine vidéo (worker/ordonnanceur.ts) avant de choisir. */
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

/** Traite une demande. Renvoie `true` si elle a été prise (réussie ou échouée),
 * `false` si ComfyUI est injoignable : elle reste alors en attente et le worker
 * patiente avant de réessayer. */
export async function traiterGenerationImage(client: ComfyUIClient, gen: Generation, mediaRoot: string): Promise<boolean> {
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
    const masterVoix = gen.methode === METHODE_MASTER_VOIX;
    // Une voix, une prise de réplique ou l'audio d'un test est un son pour tout ce qui suit (pas d'aperçu, fichier audio, pas de vignette).
    const audio = estMethodeSon(gen.methode);
    // Master de voix SANS workflow dédié (VID_Create_Voice_Master.json absent) : on soumet le graphe vidéo des plans et l'audio est extrait du mp4.
    let masterDedie = false;
    let graphe: WorkflowJson;
    if (masterVoix) {
      const p = parametresMasterVoix(gen.parametres);
      if (!p) throw new ErreurEntreeInvalide("Paramètres absents de la demande de master de voix");
      // Aucun audio fourni : le modèle invente la voix d'après le prompt (timbre décrit + réplique). Sans image, la voix off n'a pas de visage.
      const refsImage: RefMedia[] = [];
      if (p.personnage) refsImage.push({ slot: 1, cheminLocal: join(mediaRoot, p.personnage), nomDistant: nomDistantDepuisChemin(p.personnage) });
      const entree: SubmissionInput = {
        promptAssemble: gen.prompt,
        seed: gen.seed,
        prefixeSortie: `cadence_master_${asset.code}_${gen.id}`,
        dureeSecondes: gen.dureeSecondes ?? DUREE_TEST_VIDEO_SECONDES,
        fps: 24,
        refsImage,
        refsAudio: [],
        refsVideo: [],
        activerUpscale: false,
      };
      verifierEntree(entree);
      for (const r of entree.refsImage) {
        try {
          await access(r.cheminLocal);
        } catch {
          throw new ErreurEntreeInvalide(`L'image du personnage est introuvable sur le stockage (${r.cheminLocal})`);
        }
        await client.uploadRef(r.cheminLocal, r.nomDistant!);
      }
      const dedie = await access(CHEMIN_WORKFLOW_MASTER()).then(() => true, () => false);
      masterDedie = dedie;
      const brut = JSON.parse(await readFile(dedie ? CHEMIN_WORKFLOW_MASTER() : CHEMIN_WORKFLOW_VIDEO(), "utf-8")) as WorkflowJson;
      if (dedie) {
        for (const id of [NODE_IDS_MASTER.sortieAudio, NODE_IDS_MASTER.sortieVideo]) {
          if (!brut[id]) throw new ErreurEntreeInvalide(`Le nœud ${id} (sortie du master) est absent du workflow : ajuste NODE_IDS_MASTER (worker/comfyui/masterMapping.ts).`);
        }
        // La vidéo (nœud 18) n'enregistre rien par défaut (sortie « temp ») : on le force, le worker relit le dossier `output`.
        brut[NODE_IDS_MASTER.sortieVideo]!.inputs.save_output = true;
        brut[NODE_IDS_MASTER.sortieAudio]!.inputs.filename_prefix = `audio/${entree.prefixeSortie}`;
      }
      graphe = injecterValeurs(brut, entree) as WorkflowJson;
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
        sourcesDistantes: await sourcesEdition(client, gen, mediaRoot, asset.type === TYPE_AFFICHE),
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
    const noeudSortie = masterVoix ? (masterDedie ? NODE_IDS_MASTER.sortieAudio : NODE_IDS_MASTER.sortieRepli) : audio ? NODE_IDS_AUDIO.sortie : edition ? NODE_IDS_EDITION.sortie : NODE_IDS_TEXTE_VERS_IMAGE.sortie;

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
    const idPrompt = promptId;
    const r = await attendreResultat({
      suivi,
      promptId: idPrompt,
      delaiMs: masterVoix ? DUREE_MAX_POLL_VIDEO_MS : DUREE_MAX_POLL_MS,
      intervalleMs: INTERVALLE_POLL_MS,
      lire: () => client.pollImage(idPrompt, noeudSortie),
      surveillance,
    });
    if (r === "annulee") return await annuler();
    if (r === "delai") throw new Error(`Délai de génération dépassé (${masterVoix ? 30 : 10} min)`);
    if (r.statut === "erreur") throw new Error(r.message);

    {

      const stub = (process.env.COMFYUI_MODE ?? "stub") !== "http";
      const extMaster = masterDedie && !stub ? extname(r.cheminSortieDistant).toLowerCase() || ".flac" : ".mp3";
      const nom = `${gen.uuid}${masterVoix ? extMaster : audio ? extname(r.cheminSortieDistant).toLowerCase() || ".mp3" : ".png"}`;
      const cible = join(mediaRoot, cheminGenerationMedia(gen.assetId, nom));
      await mkdir(join(mediaRoot, "generations", String(gen.assetId)), { recursive: true });
      if (masterVoix) {
        const cibleVideo = join(mediaRoot, cheminGenerationMedia(gen.assetId, videoDeMaster(nom)));
        if (masterDedie) {
          // La voix nettoyée est enregistrée par son nœud ; la vidéo de test (petit rendu) est lue à part, son absence n'invalide pas la voix.
          if (stub) await writeFile(cible, mp3Factice());
          else await client.fetchOutput(r.cheminSortieDistant, cible);
          const v = await client.pollImage(promptId, NODE_IDS_MASTER.sortieVideo).catch(() => null);
          if (v?.statut === "termine") await client.fetchOutput(v.cheminSortieDistant, cibleVideo).catch(() => console.warn(`[worker] Master ${gen.id} (${asset.code}) : la vidéo de test n'a pas pu être récupérée`));
        } else {
          // Repli : la sortie est la vidéo, rangée à sa place, et la voix en est extraite (non nettoyée). Le client simulé n'a pas de piste audio.
          await client.fetchOutput(r.cheminSortieDistant, cibleVideo);
          await writeFile(cible, stub ? mp3Factice() : await extraireAudioDeVideo(cibleVideo));
        }
      } else await client.fetchOutput(r.cheminSortieDistant, cible);
      await db
        .update(assetGenerations)
        .set({ statut: "termine", fichier: nom, finishedAt: new Date() })
        .where(eq(assetGenerations.id, gen.id));
      console.log(`[worker] Génération ${gen.id} (${asset.code}${masterVoix ? ", master de voix" : audio ? ", son" : ""}) terminée : ${nom}`);
      // Générée par un lot : le résultat est adopté tout seul (il devient l'image de l'asset).
      if (gen.adoptionAuto) {
        const r = await adopterCandidat(gen.id, mediaRoot);
        console.log(r.ok ? `[worker] Génération ${gen.id} adoptée automatiquement (${asset.code})` : `[worker] Adoption automatique impossible (${asset.code}) : ${r.erreur}`);
      }
      await purgerAnciens(gen.assetId, gen.methode, mediaRoot);
      return true;
    }
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

/** Ne garde que les derniers candidats terminés DE LA MÊME MÉTHODE (les essais d'un test audio ne chassent pas ceux de la voix de
 * référence) : ce sont des essais, pas un historique (F01). Les échecs et les demandes en cours ne comptent pas. */
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
