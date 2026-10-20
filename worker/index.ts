import "dotenv/config";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { assets, jobs, planPromptSections, planRefs, plans } from "../db/schema";
import { finaliserLotsOrphelins } from "../lib/agents/lots";
import { annulationDemandeeVideo, finirAnnulationVideo } from "../lib/annulation-db";
import { domaineDe } from "../lib/gpu";
import { configLlm } from "../lib/llm/config";
import { cheminAssetMedia, cheminVoixMedia } from "../lib/media";
import { assemblerPrompt } from "../lib/prompt";
import { raccordSansPlace, sectionsAvecRaccord } from "../lib/plan-raccord";
import { getAllParams } from "../lib/params";
import { annulerCoteComfyUI, surveillerAnnulation } from "./annulation";
import { attendreResultat } from "./attente";
import { creerClientComfyUI } from "./comfyui";
import { ErreurEntreeInvalide, nomDistantDepuisChemin, verifierEntree } from "./comfyui/mapping";
import type { Suivi, SubmissionInput } from "./comfyui/types";
import { creerRelaisJob } from "./progression";
import { libererAvant } from "./gpu";
import { VerrouGpu } from "./verrou-gpu";
import { demarrerSondeVram, journaliserTache, noterEvenement } from "./journal";
import { prochaineGenerationEnAttente, traiterGenerationImage } from "./images";
import { preparerRaccord } from "./raccord";
import { decharger, llmJoignable } from "./llamaSwap";
import { echouerAppelsEnAttente, prochaineTacheLlmEnAttente, traiterTacheLlm } from "./llm";
import { attenteDepassee, effacerSonde, noterSonde } from "./disponibilite";
import { piloterCreations } from "../lib/agents/creation-db";
import { projetEnCreation } from "./creation";
import { piloterDemandes } from "../lib/demandes-db";
import { choisirProchaineTache, type TacheEnAttente } from "./ordonnanceur";
import { INTERVALLE_PURGE_MS, purgerEchecs } from "./purge";
import { reprendreOrphelines } from "./reprise";

const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? "./data");
const INTERVALLE_MS = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);
const PAUSE_ENTRE_TACHES_MS = 1_000; // une tâche vient de finir : on enchaîne vite sur la suivante
const INTERVALLE_POLL_MS = 5_000;
const INTERVALLE_DEMANDES_MS = 2_000; // une demande est en cours : on regarde souvent si son étape a fini
const DUREE_MAX_POLL_MS = 30 * 60_000; // un plan H3 ne devrait jamais dépasser 30 min

const client = creerClientComfyUI();

async function prochainJobEnAttente() {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.statut, "en_attente"))
    // Le rendu d'une demande (itération) passe avant les autres vidéos : voir worker/ordonnanceur.ts.
    .orderBy(sql`(${jobs.demandeId} is null)`, jobs.createdAt)
    .limit(1);
  return job ?? null;
}

/** Ce que le worker soumet, et ce qu'il garde de l'essai : `promptFiche` est le prompt de la FICHE (sans la déclaration de l'image de raccord, que le
 * code ajoute au prompt soumis seulement) ; `raccordJobId` est l'essai du plan précédent dont la dernière image sert de première image. */
async function construireSubmissionInput(
  planId: number,
  activerUpscale: boolean,
): Promise<{ input: SubmissionInput; promptFiche: string; raccordJobId: number | null; plan: typeof plans.$inferSelect }> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);

  const [sections, refs] = await Promise.all([
    db.select().from(planPromptSections).where(eq(planPromptSections.planId, planId)),
    db
      .select({ type: planRefs.type, slot: planRefs.slot, fichier: assets.fichier, assetId: assets.id, assetType: assets.type, voixMaster: assets.voixMaster })
      .from(planRefs)
      .leftJoin(assets, eq(planRefs.assetId, assets.id))
      .where(eq(planRefs.planId, planId)),
  ]);

  const promptFiche = assemblerPrompt(sections);

  // Un fichier de MEDIA_ROOT -> chemin local + nom unique côté ComfyUI (pas de collision entre deux plans,
  // deux prises de même nom, ni avec les fichiers de l'utilisateur dans le dossier d'entrée).
  const ref = (cheminRelatif: string) => ({
    cheminLocal: join(MEDIA_ROOT, cheminRelatif),
    nomDistant: nomDistantDepuisChemin(cheminRelatif),
  });
  const refAsset = (fichier: string | null) => ref(cheminAssetMedia(fichier ?? ""));

  // Audio : les voix d'abord (la voix prime sur les bruitages), puis les bruitages sur les emplacements restants. Le prompt est la source
  // des répliques (2026-10-14) : la voix d'un personnage qui parle est une référence audio de la fiche dont l'asset est le PERSONNAGE
  // (son master) ; sans master, le modèle vidéo invente la voix (jamais bloquant).
  const audioVoix = refs
    .filter((r) => r.type === "audio" && r.assetType === "personnage")
    .flatMap((r) => (r.voixMaster && r.assetId != null ? [{ slot: r.slot, ...ref(cheminVoixMedia(r.assetId, r.voixMaster)), dureeSecondes: null as number | null }] : []));
  const emplacementsVoix = new Set(audioVoix.map((a) => a.slot));
  const audioBruitages = refs
    .filter((r) => r.type === "audio" && r.assetType !== "personnage" && r.fichier)
    .filter((r) => {
      if (!emplacementsVoix.has(r.slot)) return true;
      console.warn(`[worker] Plan ${planId} : l'emplacement <Audio ${r.slot}> est pris par une voix, le bruitage est ignoré`);
      return false;
    })
    .map((r) => ({ slot: r.slot, ...refAsset(r.fichier), dureeSecondes: null as number | null }));

  const refsImage = refs
    .filter((r) => r.type === "picture" && r.fichier)
    .map((r) => ({ slot: r.slot, ...refAsset(r.fichier) }));
  const refsVideo = refs
    .filter((r) => r.type === "video" && r.fichier)
    .map((r) => ({ slot: r.slot, ...refAsset(r.fichier) }));

  // Liaison « suite » : la dernière image du rendu du plan précédent devient la première image du premier shot (éphémère, lib/plan-raccord.ts).
  const raccord = await preparerRaccord(plan, refsImage.map((r) => r.slot), refsVideo.length);

  return {
    promptFiche,
    plan,
    raccordJobId: raccord?.sourceJobId ?? null,
    input: {
      promptAssemble: raccord ? assemblerPrompt(sectionsAvecRaccord(sections, raccord.slot)) : promptFiche,
      seed: plan.seed ?? undefined,
      dureeSecondes: plan.dureeGenerationSecondes,
      fps: plan.fps,
      refsImage: raccord ? [...refsImage, raccord.ref] : refsImage,
      refsAudio: [...audioVoix, ...audioBruitages],
      refsVideo,
      activerUpscale,
    },
  };
}

/** Le job et son plan changent d'état ENSEMBLE : jamais un job terminé dont le plan reste « en cours ». */
async function cloreJob(job: typeof jobs.$inferSelect, jobSet: Partial<typeof jobs.$inferInsert>, statutPlan: typeof plans.$inferSelect["statut"]) {
  await db.transaction(async (tx) => {
    await tx.update(jobs).set(jobSet).where(eq(jobs.id, job.id));
    await tx.update(plans).set({ statut: statutPlan }).where(eq(plans.id, job.planId));
  });
}

/** Distinction stricte (F04) : une API ComfyUI injoignable ne consomme
 * jamais une tentative — seul un vrai échec de rendu compte. Renvoie `true` si
 * le job est allé au bout (rendu, échec de rendu, rejeu), `false` s'il est resté
 * ou reparti en attente faute de ComfyUI : le worker patiente alors. */
async function traiterJob(job: typeof jobs.$inferSelect): Promise<boolean> {
  // Prise gardée par le statut : un job annulé entre-temps (annulation directe d'une
  // vidéo en attente) ne doit pas être ressuscité.
  const prise = await db
    .update(jobs)
    .set({ statut: "en_cours", startedAt: new Date() })
    .where(and(eq(jobs.id, job.id), eq(jobs.statut, "en_attente")))
    .returning({ id: jobs.id });
  if (prise.length === 0) return true;
  await db.update(plans).set({ statut: "en_cours" }).where(eq(plans.id, job.planId));

  let promptId: string | null = null;
  let surveillance: ReturnType<typeof surveillerAnnulation> | null = null;
  let suivi: Suivi | null = null;
  let relais: ReturnType<typeof creerRelaisJob> | null = null;

  /** Annulation demandée : on interrompt ComfyUI après avoir vérifié dans /queue que
   * c'est bien notre prompt, on ne récupère rien. Le job finit `echoue` / « Annulée »
   * SANS consommer de tentative ni déclencher le rejeu F04 ; le plan reprend l'état
   * de sa dernière réussite. */
  const annuler = async (): Promise<boolean> => {
    const issue = promptId ? await annulerCoteComfyUI(client, promptId) : "rien";
    console.log(`[worker] Job ${job.id} (plan ${job.planId}) annulé (${issue})`);
    await finirAnnulationVideo(job.id);
    return true;
  };

  try {
    const { input, promptFiche, raccordJobId, plan: lePlan } = await construireSubmissionInput(job.planId, job.activerUpscale);
    // Un préfixe de fichier propre à ce rendu : plus de collision de noms, ni de résultat en cache servi à un autre rendu.
    input.prefixeSortie = `cadence_p${job.planId}_r${job.numeroRendu}${job.tentative > 1 ? `_t${job.tentative}` : ""}`;
    verifierEntree(input); // durée hors 5-15 s, trop de références : échec franc (voir catch)
    // Ce qui est gardé sur le rendu : le prompt de la FICHE (de quoi comparer deux rendus et voir qu'une modification n'a pas bougé le prompt ;
    // « Repartir de là » le restaure) et, s'il y en a un, l'essai dont l'image de raccord vient.
    // Un plan « suite » sans image de raccord faute d'emplacement libre : rien ne bloque (la génération part comme avant), mais l'essai le dit.
    const raccordSansPlaceLibre = lePlan.liaison === "suite" && raccordJobId == null && raccordSansPlace(input.refsImage.length + input.refsVideo.length);
    const alertes = raccordSansPlaceLibre
      ? [...(job.alertesIteration ?? []), "Pas d'image de raccord : les références du plan occupent tous les emplacements. Retire une référence pour que la dernière image du plan précédent soit reprise."]
      : undefined;
    await db
      .update(jobs)
      .set({
        promptUtilise: promptFiche,
        raccordJobId,
        dureeUtilisee: input.dureeSecondes,
        seedUtilisee: input.seed ?? null,
        descriptionUtilisee: lePlan.description ?? null,
        ...(alertes ? { alertesIteration: alertes } : {}),
      })
      .where(eq(jobs.id, job.id));

    for (const ref of [...input.refsImage, ...input.refsAudio, ...input.refsVideo]) {
      if (ref.cheminLocal) {
        await client.uploadRef(ref.cheminLocal, ref.nomDistant ?? ref.cheminLocal.split(/[\\/]/).pop()!);
      }
    }

    // Le WebSocket s'ouvre AVANT la soumission ; il ne décide de rien (le résultat vient de /history) : il ne sert qu'à
    // montrer l'étape en cours. S'il tombe ou n'existe pas (stub), le rendu se déroule sans progression.
    relais = creerRelaisJob(job.id);
    const relaisActif = relais;
    suivi = await client.ouvrirSuivi((e) => relaisActif.surEvenement(e)).catch(() => null);
    promptId = await client.submit(input);
    await db.update(jobs).set({ comfyuiPromptId: promptId }).where(eq(jobs.id, job.id));

    // La sonde du drapeau réveille l'attente entre deux interrogations de /history :
    // une annulation n'attend pas les 5 s du rythme normal.
    surveillance = surveillerAnnulation(() => annulationDemandeeVideo(job.id));
    const idPrompt = promptId;
    const resultat = await attendreResultat({
      suivi,
      promptId: idPrompt,
      delaiMs: DUREE_MAX_POLL_MS,
      intervalleMs: INTERVALLE_POLL_MS,
      lire: () => client.poll(idPrompt),
      surveillance,
    });
    if (resultat === "annulee") return await annuler();
    if (resultat === "delai") {
      await gererEchecReel(job, "Délai de génération dépassé (30 min)");
      return true;
    }
    if (resultat.statut === "erreur") {
      await gererEchecReel(job, resultat.message);
      return true;
    }

    const dossierPlan = join(MEDIA_ROOT, "plans", String(job.planId));
    await mkdir(dossierPlan, { recursive: true });
    const nomFichier = resultat.cheminSortieDistant.split("/").pop()!;
    const cheminLocalCible = join(dossierPlan, nomFichier);
    await client.fetchOutput(resultat.cheminSortieDistant, cheminLocalCible);

    const cheminRelatif = `plans/${job.planId}/${nomFichier}`;
    // "previsualise" vs "termine" : le statut du plan reflète si la
    // dernière réussite était une prévisualisation (sans upscale) ou un
    // rendu final — voir db/schema.ts, planStatutEnum.
    const statutPlan = job.activerUpscale ? "termine" : "previsualise";
    await cloreJob(job, { statut: "termine", cheminSortie: cheminRelatif, finishedAt: new Date() }, statutPlan);
    console.log(`[worker] Job ${job.id} (plan ${job.planId}) -> ${statutPlan} (${cheminRelatif})`);
    return true;
  } catch (err) {
    // Entrée que rien ne rendra valable en réessayant : échec définitif, sans rejeu ni attente.
    if (err instanceof ErreurEntreeInvalide) {
      await cloreJob(job, { statut: "echoue", erreur: err.message, finishedAt: new Date() }, "echoue");
      console.error(`[worker] Job ${job.id} (plan ${job.planId}) refusé avant soumission : ${err.message}`);
      return true;
    }
    // Une exception ici (réseau coupé en cours de route, ComfyUI qui plante
    // avant d'avoir répondu) est traitée comme une indisponibilité, pas comme
    // un échec de rendu : le job repart en_attente sans consommer de tentative.
    // Une annulation demandée prime : ce n'est pas une indisponibilité à rejouer.
    if (await annulationDemandeeVideo(job.id).catch(() => false)) return await annuler();
    console.warn(`[worker] Job ${job.id} interrompu (probable indisponibilité) :`, err);
    await db
      .update(jobs)
      .set({ statut: "en_attente", startedAt: null })
      .where(eq(jobs.id, job.id));
    return false;
  } finally {
    surveillance?.arreter();
    suivi?.fermer();
    await relais?.nettoyer();
  }
}

async function gererEchecReel(job: typeof jobs.$inferSelect, message: string) {
  const params = await getAllParams();
  const tentativesMax = Number(params.tentatives_max);

  if (job.tentative < tentativesMax) {
    await cloreJob(job, { statut: "en_attente", tentative: job.tentative + 1, erreur: message, startedAt: null }, "rejoue");
    console.log(`[worker] Job ${job.id} échoué (tentative ${job.tentative}/${tentativesMax}), rejeu : ${message}`);
  } else {
    await cloreJob(job, { statut: "echoue", erreur: message, finishedAt: new Date() }, "echoue");
    console.error(`[worker] Job ${job.id} signalé en échec après ${tentativesMax} tentatives : ${message}`);
  }
}

/** ComfyUI a pu garder des modèles en mémoire depuis la dernière libération (vrai au démarrage : inconnu). Une tâche de
 * création, qui prend la carte seule, ne le libère que dans ce cas. */
let comfyuiPeutEtreCharge = true;

const urlLlm = () => configLlm().url;

/** Les tâches qui ne tiennent pas à côté de l'autre voie (l'upscale monte à 13 Go) prennent le verrou exclusif. */
const verrou = new VerrouGpu();

const journalLiberation = (message: string) => {
  console.log(message);
  noterEvenement("liberation", { message });
};

export type Voie = "comfyui" | "llm";

/** Une tâche par appel sur la voie donnée : une boucle par voie, ComfyUI et LLM travaillent en même temps (la VRAM de la carte les
 * accueille ensemble ; seules l'upscale et la création d'un projet prennent la carte seule). Le choix (image, puis LLM, puis vidéo ; FIFO ; sans préemption ; même domaine à
 * égalité) vit dans ordonnanceur.ts. Un domaine injoignable ne bloque pas l'autre : ses tâches restent en attente,
 * on prend ce qui peut tourner. Renvoie `true` si une tâche a été traitée. */
async function traiterProchaineTache(voie: Voie): Promise<boolean> {
  const avecComfyui = voie === "comfyui";
  const avecLlm = voie === "llm";
  const [gen, job, run] = await Promise.all([
    avecComfyui ? prochaineGenerationEnAttente() : null,
    avecComfyui ? prochainJobEnAttente() : null,
    avecLlm ? prochaineTacheLlmEnAttente() : null,
  ]);

  const comfyuiAttend = gen != null || job != null;
  const [comfyuiOk, llmOk] = await Promise.all([
    comfyuiAttend ? client.healthcheck() : Promise.resolve(false),
    run ? llmJoignable(urlLlm(), fetch, configLlm().routeSante).catch(() => false) : Promise.resolve(false),
  ]);

  // Disponibilité notée pour l'en-tête (pastille « injoignable ») ; sans rien en attente, rien à signaler.
  const [, depuisLlm] = await Promise.all([
    avecComfyui ? (comfyuiAttend ? noterSonde("comfyui", comfyuiOk) : effacerSonde("comfyui")) : null,
    avecLlm ? (run ? noterSonde("llm", llmOk) : effacerSonde("llm")) : null,
  ]);
  // Un serveur LLM muet depuis trop longtemps : les appels en attente échouent (relançables), ils ne bloquent
  // plus la conversation. ComfyUI garde son attente (une vidéo ou une image se remet en file à la main).
  const { injoignableMaxMs } = configLlm();
  if (run && !llmOk && attenteDepassee(depuisLlm, Date.now(), injoignableMaxMs)) {
    const n = await echouerAppelsEnAttente(
      `Serveur LLM injoignable depuis plus de ${Math.round(injoignableMaxMs / 60_000)} min (${urlLlm()}) : relance quand il répond.`,
    );
    console.log(`[worker] Serveur LLM injoignable depuis trop longtemps — ${n} appel(s) en attente passé(s) en échec`);
  }

  const candidates: TacheEnAttente[] = [];
  if (gen && comfyuiOk) candidates.push({ genre: "image", id: gen.id, createdAt: gen.createdAt });
  if (run && llmOk) candidates.push({ genre: "llm", id: run.id, createdAt: run.createdAt, demande: run.demandeId != null });
  if (job && comfyuiOk) candidates.push({ genre: "video", id: job.id, createdAt: job.createdAt, demande: job.demandeId != null });
  if (candidates.length === 0) {
    // Rien de lançable : on garde le message d'indisponibilité de chaque domaine.
    if (comfyuiAttend) console.log("[worker] ComfyUI injoignable — les tâches d'images et de vidéo restent en attente");
    if (run) console.log("[worker] Serveur LLM injoignable — les appels d'agent restent en attente");
    return false;
  }

  const choix = choisirProchaineTache(candidates);
  if (!choix) return false;
  const domaine = domaineDe(choix.genre);
  const upscale = choix.genre === "video" && job!.activerUpscale;
  // La création d'un projet (2026-10-19) : le gros modèle de l'installateur tient en VRAM, ComfyUI ne doit pas être chargé. Ses appels
  // prennent la carte seule (les tâches en cours finissent, rien ne démarre à côté) et ComfyUI est libéré avant le premier.
  const creation = choix.genre === "llm" && (await projetEnCreation(run!.projectId));

  noterEvenement("choix", { genre: choix.genre, id: choix.id, voie, enAttente: candidates.map((c) => `${c.genre}:${c.id}`) });
  return await verrou.avec(upscale || creation, async () => {
    // Même GPU : seul l'upscale décharge le LLM (il ne tient pas à côté), et la création décharge ComfyUI. Au mieux, jamais bloquant.
    const debutLiberation = Date.now();
    const liberateurs = { comfyui: () => client.libererMemoire(), llm: () => decharger(urlLlm()) };
    const liberee = upscale
      ? await libererAvant(null, "comfyui", liberateurs, journalLiberation)
      : creation && comfyuiPeutEtreCharge
        ? await libererAvant(null, "llm", liberateurs, journalLiberation)
        : null;
    if (liberee === "comfyui") comfyuiPeutEtreCharge = false;
    if (liberee) noterEvenement("liberation_duree", { liberee, dureeMs: Date.now() - debutLiberation });

    const fait = await journaliserTache(choix.genre, choix.id, domaine, async () =>
      choix.genre === "image"
        ? await traiterGenerationImage(client, gen!, MEDIA_ROOT)
        : choix.genre === "llm"
          ? await traiterTacheLlm(run!)
          : await traiterJob(job!),
    );
    if (domaine === "comfyui") comfyuiPeutEtreCharge = true;
    return fait;
  });
}

async function boucle() {
  console.log(`[worker] Cadence worker démarré (mode ComfyUI : ${process.env.COMFYUI_MODE ?? "stub"})`);
  demarrerSondeVram(process.env.COMFYUI_URL, urlLlm());
  noterEvenement("demarrage");
  // Une seule fois, avant la première prise : ce qui était « en cours » appartenait
  // à un worker mort (voir worker/reprise.ts).
  try {
    const { images, videos, llm, annulees } = await reprendreOrphelines(MEDIA_ROOT);
    if (images || videos || llm || annulees) {
      console.log(`[worker] Reprise : ${images} image(s) et ${llm} appel(s) LLM interrompu(s), ${videos} vidéo(s) remise(s) en file, ${annulees} annulation(s) terminée(s)`);
    }
    // Un lot dont la tâche en cours vient d'être interrompue n'attend plus rien d'elle : son statut
    // (prête avec un échec à relancer, ou échouée) est rattrapé ici.
    const lots = await finaliserLotsOrphelins();
    if (lots) console.log(`[worker] Reprise : ${lots} lot(s) d'agent rattrapé(s)`);
  } catch (err) {
    console.error("[worker] Reprise des tâches interrompues impossible :", err);
  }

  // Purge des échecs de plus de 24 h : une fois au démarrage, puis toutes les heures.
  let dernierePurge = 0;
  const purger = async () => {
    dernierePurge = Date.now();
    try {
      const { images, videos, llm } = await purgerEchecs(MEDIA_ROOT);
      if (images || videos || llm) console.log(`[worker] Purge : ${images} génération(s), ${videos} job(s) annulé(s) et ${llm} appel(s) LLM de plus de 24 h supprimés`);
    } catch (err) {
      console.error("[worker] Purge des échecs impossible :", err);
    }
  };
  await purger();

  // Les boucles : une par voie (ComfyUI, LLM). L'installateur et la purge ne touchent jamais le GPU : ils ont leur propre boucle et ne
  // retardent aucune tâche.
  const voies: Voie[] = ["comfyui", "llm"];
  await Promise.all([
    ...voies.map(async (v) => {
      while (true) {
        let fait = false;
        try {
          fait = await traiterProchaineTache(v);
        } catch (err) {
          console.error(`[worker] Erreur de boucle (${v}) :`, err);
        }
        await new Promise((r) => setTimeout(r, fait ? PAUSE_ENTRE_TACHES_MS : INTERVALLE_MS));
      }
    }),
    (async () => {
      while (true) {
        if (Date.now() - dernierePurge >= INTERVALLE_PURGE_MS) await purger();
        let fait = false;
        // L'installateur : une transition au plus par création en cours (lancer une étape, appliquer, relancer les échecs).
        try {
          if (await piloterCreations()) fait = true;
        } catch (err) {
          console.error("[worker] Installateur :", err);
        }
        // Les demandes (itérer un plan…) : une transition au plus par demande en cours. Tant qu'il y en a, on repasse vite : chaque
        // étape qui finit doit lancer la suivante sans attendre le grand intervalle (pas de trou visible entre deux étapes).
        let demandesActives = 0;
        try {
          const r = await piloterDemandes();
          demandesActives = r.actives;
          if (r.touchees > 0) fait = true;
        } catch (err) {
          console.error("[worker] Demandes :", err);
        }
        await new Promise((r) => setTimeout(r, fait ? PAUSE_ENTRE_TACHES_MS : demandesActives > 0 ? INTERVALLE_DEMANDES_MS : INTERVALLE_MS));
      }
    })(),
  ]);
}

boucle();
