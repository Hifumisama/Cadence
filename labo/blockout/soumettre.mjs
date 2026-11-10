// BROUILLON, jamais exécuté contre un ComfyUI réel. Soumet une variante (A, B ou C) d'un plan de blockout à MiniMax H3.
//
//   node soumettre.mjs --plan exemples/02_push_in_deux_sujets.json --variante B --prompt prompts/02_B.txt --seed 1234 \
//        --image chemin/CHAR_maya.png --image chemin/CHAR_tenanciere.png [--video sortie/02_push_in_deux_sujets.mp4] \
//        [--url http://machine:8188] [--envoyer]
//
// Sans --envoyer, rien ne part : le graphe est écrit dans sortie/soumission_<id>_<variante>.json pour relecture.
// L'injection recopie worker/comfyui/mapping.ts (injecterReferences) et mappingTroisEtapes.ts (injecterGeneration) ; le dépôt des
// fichiers recopie HttpComfyUIClient.uploadRef. Rien n'est importé de l'application : le labo reste détachable.
//
// POINTS DEVINÉS (à confirmer au premier essai réel) :
//  1. /upload/image accepte un mp4 : c'est ce que fait le worker pour ses vidéos de référence, mais ce chemin n'a jamais été rendu.
//  2. `<Video 1>` du prompt = entrée `ref_videos.ref_video_0` du nœud 5 (même règle slot - 1 que les images ; non vérifié en réel).
//  3. La résolution : le worker verrouille 0,4 MP sur VID_Generation.json ; ici elle suit celle de la vidéo de référence
//     (608x352 → 0,2 MP), pour que la référence et le rendu aient exactement le même cadre. On ignore si le nœud 5 redimensionne
//     ou rogne une vidéo de référence d'une autre taille.
//  4. Le nombre d'images de la référence est celui que H3 génère pour la durée (règle 17k+5) : on suppose qu'une référence de même
//     longueur est le cas le plus favorable. Le nœud accepte peut-être autre chose.
//  5. La piste audio : nos mp4 n'en ont pas, et `ref_video_audios` n'est pas câblé (comme dans le worker).
//  6. Les noms de sortie (`blockout_…`) et le dossier de latent sont propres au labo ; le nœud 302 enregistre un latent à chaque essai
//     sous output/h3_latents/blockout_<id>_<variante>_<seed>/ : à supprimer à la main après les tests.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { RACINE, chargerPlan, resolutionDe } from "./schema.mjs";

// Identifiants de nœuds de workflows/video-generation/VID_Generation.json (NODE_IDS_GENERATION de mappingTroisEtapes.ts).
const NOEUDS = { prompt: "22:11", resolution: "22:9", dureeVideo: "22:23", refNode: "5", seed: "16", apercu: "18", latentSauve: "302" };
const MAX_REFS_VISUELLES = 6; // images + vidéos (mapping.ts)
const WORKFLOW = resolve(RACINE, "../../workflows/video-generation/VID_Generation.json");

const { values: o } = parseArgs({
  options: {
    plan: { type: "string" },
    variante: { type: "string" },
    prompt: { type: "string" },
    seed: { type: "string" },
    image: { type: "string", multiple: true, default: [] },
    video: { type: "string" },
    url: { type: "string" },
    envoyer: { type: "boolean", default: false },
  },
});
const arret = (message) => {
  console.error(message);
  process.exit(1);
};
if (!o.plan || !o.prompt || !o.seed || !["A", "B", "C"].includes(o.variante ?? "")) {
  arret("Usage : node soumettre.mjs --plan <plan.json> --variante A|B|C --prompt <prompt.txt> --seed <entier> [--image <fichier>]… [--video <mp4>] [--url <ComfyUI>] [--envoyer]");
}
if (!/^\d+$/.test(o.seed)) arret("--seed : un entier positif (le même pour les trois variantes d'un plan).");

const plan = chargerPlan(o.plan);
const prompt = readFileSync(o.prompt, "utf8").trim();
const avecVideo = o.variante !== "A";
const video = avecVideo ? resolve(o.video ?? join(RACINE, "sortie", `${plan.id}.mp4`)) : null;
if (video && !existsSync(video)) arret(`Vidéo de référence absente : ${video} (lancer npm run rendre).`);
for (const image of o.image) if (!existsSync(image)) arret(`Image de référence absente : ${image}`);
if (o.image.length + (avecVideo ? 1 : 0) > MAX_REFS_VISUELLES) arret(`${MAX_REFS_VISUELLES} références image + vidéo au plus.`);

// Garde-fou du protocole : le prompt doit correspondre à la variante.
const citeVideo = prompt.includes("<Video 1>");
if (avecVideo && !citeVideo) console.warn(`Attention : variante ${o.variante} mais le prompt ne cite pas <Video 1>.`);
if (!avecVideo && citeVideo) arret("Variante A : le prompt cite <Video 1> alors qu'aucune vidéo n'est branchée.");
for (let n = 1; n <= o.image.length; n++) if (!prompt.includes(`<Picture ${n}>`)) console.warn(`Attention : <Picture ${n}> n'est pas cité dans le prompt.`);

// Nom distant préfixé : tous les fichiers d'entrée de ComfyUI partagent un dossier, on ne marche sur rien (mapping.ts, nomDistantDepuisChemin).
const nomDistant = (chemin) => `blockout_${basename(chemin)}`;
const refsImage = o.image.map((chemin, i) => ({ slot: i + 1, cheminLocal: resolve(chemin), nomDistant: nomDistant(chemin) }));
const refsVideo = video ? [{ slot: 1, cheminLocal: video, nomDistant: nomDistant(video) }] : [];

// ── Injection ───────────────────────────────────────────────────────────────────────────────────────────────────────
const graphe = JSON.parse(readFileSync(WORKFLOW, "utf8"));
const noeud = (id, role) => graphe[id] ?? arret(`Nœud ${id} (${role}) absent de ${WORKFLOW} : le workflow a changé depuis l'écriture de ce brouillon.`);

noeud(NOEUDS.dureeVideo, "durée").inputs.value = plan.duree;
noeud(NOEUDS.resolution, "résolution").inputs.megapixels = resolutionDe(plan).megapixels;
noeud(NOEUDS.prompt, "prompt").inputs.value = prompt;
noeud(NOEUDS.seed, "seed").inputs.seed = Number(o.seed);

const etiquette = `blockout_${plan.id}_${o.variante}_${o.seed}`;
noeud(NOEUDS.apercu, "brouillon").inputs.filename_prefix = etiquette;
const latent = noeud(NOEUDS.latentSauve, "sauvegarde du latent").inputs;
latent.filename_prefix = `h3_latents/${etiquette}/gen/clip`;
latent.clip_index = 1;

// Références : on repart d'un nœud 5 vierge (les références du fichier sont des valeurs de test), puis on ne câble que celles du plan.
const refNode = noeud(NOEUDS.refNode, "MiniMaxH3ReferenceToVideo");
for (const cle of Object.keys(refNode.inputs)) {
  if (cle.startsWith("ref_images.") || cle.startsWith("ref_audios.") || cle.startsWith("ref_videos.")) delete refNode.inputs[cle];
}
for (const ref of refsImage) {
  const id = `ref_img_${ref.slot}`;
  graphe[`${id}_charge`] = { class_type: "LoadImage", inputs: { image: ref.nomDistant }, _meta: { title: `Ref image ${ref.slot} : fichier (labo blockout)` } };
  graphe[id] = {
    class_type: "ImageScaleToTotalPixels",
    inputs: { image: [`${id}_charge`, 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 1 },
    _meta: { title: `Ref image ${ref.slot} (labo blockout)` },
  };
  refNode.inputs[`ref_images.ref_image_${ref.slot - 1}`] = [id, 0];
}
for (const ref of refsVideo) {
  const id = `ref_video_${ref.slot}`;
  // LoadVideo charge le fichier, GetVideoComponents en sort les images (sortie 0) ; l'audio (sortie 1) n'est pas câblé.
  graphe[id] = { class_type: "LoadVideo", inputs: { file: ref.nomDistant }, _meta: { title: `Ref vidéo ${ref.slot} (labo blockout)` } };
  graphe[`${id}_images`] = { class_type: "GetVideoComponents", inputs: { video: [id, 0] }, _meta: { title: `Ref vidéo ${ref.slot} : images (labo blockout)` } };
  refNode.inputs[`ref_videos.ref_video_${ref.slot - 1}`] = [`${id}_images`, 0];
}

// ── Relecture ou envoi ──────────────────────────────────────────────────────────────────────────────────────────────
mkdirSync(join(RACINE, "sortie"), { recursive: true });
const copie = join(RACINE, "sortie", `soumission_${plan.id}_${o.variante}.json`);
writeFileSync(copie, JSON.stringify(graphe, null, 2));
console.log(`Graphe écrit : ${copie}`);
console.log(`  ${plan.duree} s, ${resolutionDe(plan).megapixels} MP, seed ${o.seed}, ${refsImage.length} image(s), ${refsVideo.length} vidéo de référence`);

if (!o.envoyer) {
  console.log("Rien n'a été envoyé (ajouter --envoyer pour soumettre).");
  process.exit(0);
}

const url = (o.url ?? process.env.COMFYUI_URL ?? "").replace(/\/+$/, "");
if (!url) arret("Adresse de ComfyUI absente : --url http://machine:8188 ou variable COMFYUI_URL.");

for (const ref of [...refsImage, ...refsVideo]) {
  const form = new FormData();
  form.append("image", new Blob([readFileSync(ref.cheminLocal)]), ref.nomDistant);
  form.append("overwrite", "true");
  const res = await fetch(`${url}/upload/image`, { method: "POST", body: form });
  if (!res.ok) arret(`Dépôt de ${ref.nomDistant} refusé (${res.status}) ${await res.text().catch(() => "")}`);
  console.log(`Déposé : ${ref.nomDistant}`);
}

const res = await fetch(`${url}/prompt`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: graphe, client_id: randomUUID() }),
});
if (!res.ok) arret(`Soumission refusée (${res.status}) ${(await res.text().catch(() => "")).slice(0, 600)}`);
const { prompt_id } = await res.json();
console.log(`Soumis : prompt_id ${prompt_id}`);
console.log(`Le brouillon sortira du nœud ${NOEUDS.apercu} sous le nom ${etiquette}_00001.mp4 (dossier output de ComfyUI ; suivi : ${url}/history/${prompt_id}).`);
