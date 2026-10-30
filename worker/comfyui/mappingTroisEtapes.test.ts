import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ErreurEntreeInvalide } from "./mapping";
import {
  MEGAPIXELS_VIDEO,
  NODE_IDS_FINITION,
  NODE_IDS_GENERATION,
  NODE_IDS_GENERATION_SUITE,
  NODE_IDS_UPSCALE,
  cheminsLatents,
  dossierLatents,
  injecterFinition,
  injecterGeneration,
  injecterUpscale,
} from "./mappingTroisEtapes";
import type { SubmissionInput } from "./types";

// Lit les VRAIS workflows : si un ré-export change un identifiant, ce test casse au lieu de laisser le worker soumettre un graphe faux.
const lire = (fichier: string) => JSON.parse(readFileSync(`workflows/video-generation/${fichier}`, "utf-8"));
const generation = lire("VID_Generation.json");
const upscale = lire("VID_UPSCALE.json");
const finition = lire("VID_Finition.json");
const generationSuite = lire("VID_Generation_suite.json");
const finitionSuite = lire("VID_Finition_suite.json");

const entree: SubmissionInput = {
  promptAssemble: "summary: test",
  seed: "123",
  dureeSecondes: 8,
  fps: 24,
  refsImage: [{ slot: 1, cheminLocal: "C:/x/CHAR_maya.png", nomDistant: "cadence_assets_CHAR_maya.png" }],
  refsAudio: [{ slot: 1, cheminLocal: "C:/x/voix.flac", nomDistant: "cadence_voix.flac", dureeSecondes: 6.05 }],
  refsVideo: [],
  activerUpscale: true,
};
const dossier = dossierLatents(4, 2);

test("les nœuds cartographiés existent dans chacun des trois workflows", () => {
  for (const [nom, id] of Object.entries(NODE_IDS_GENERATION)) assert.ok(generation[id], `nœud ${id} (${nom}) absent de VID_Generation.json`);
  for (const [nom, id] of Object.entries(NODE_IDS_UPSCALE)) assert.ok(upscale[id], `nœud ${id} (${nom}) absent de VID_UPSCALE.json`);
  for (const [nom, id] of Object.entries(NODE_IDS_FINITION)) assert.ok(finition[id], `nœud ${id} (${nom}) absent de VID_Finition.json`);
});

test("les nœuds de latent sont de la bonne classe", () => {
  assert.equal(generation[NODE_IDS_GENERATION.latentSauve].class_type, "MiniMaxH3MotionContextSaveLatent");
  assert.equal(upscale[NODE_IDS_UPSCALE.latentCharge].class_type, "MiniMaxH3MotionContextLoadLatent");
  assert.equal(upscale[NODE_IDS_UPSCALE.latentSauve].class_type, "MiniMaxH3MotionContextSaveLatent");
  assert.equal(finition[NODE_IDS_FINITION.latentAudio].class_type, "MiniMaxH3MotionContextLoadLatent");
  assert.equal(finition[NODE_IDS_FINITION.latentImage].class_type, "MiniMaxH3MotionContextLoadLatent");
  assert.equal(finition[NODE_IDS_FINITION.sortie].class_type, "VHS_VideoCombine");
  assert.equal(generation[NODE_IDS_GENERATION.apercu].class_type, "VHS_VideoCombine");
});

test("le latent chargé pour l'upscale et la finition est lu en format standard (stock_format)", () => {
  assert.equal(upscale[NODE_IDS_UPSCALE.latentCharge].inputs.stock_format, true);
  assert.equal(finition[NODE_IDS_FINITION.latentAudio].inputs.stock_format, true);
  assert.equal(finition[NODE_IDS_FINITION.latentImage].inputs.stock_format, true);
});

test("génération : prompt, durée, résolution verrouillée, seed, référence dynamique, latent sous le dossier du rendu", () => {
  const g = injecterGeneration(generation, { ...entree, megapixels: 0.2 }, dossier);
  assert.equal(g[NODE_IDS_GENERATION.prompt]!.inputs.value, entree.promptAssemble);
  assert.equal(g[NODE_IDS_GENERATION.dureeVideo]!.inputs.value, 8);
  assert.equal(g[NODE_IDS_GENERATION.resolution]!.inputs.megapixels, MEGAPIXELS_VIDEO, "la résolution est 0,4 MP quoi qu'on demande");
  assert.equal(g[NODE_IDS_GENERATION.seed]!.inputs.seed, 123);
  assert.deepEqual(g[NODE_IDS_GENERATION.refNode]!.inputs["ref_images.ref_image_0"], ["ref_img_1", 0]);
  assert.equal(g.ref_img_1!.inputs.image, "cadence_assets_CHAR_maya.png");
  assert.equal(g[NODE_IDS_GENERATION.latentSauve]!.inputs.filename_prefix, "h3_latents/cadence_p4_r2/gen/clip");
  assert.equal(g[NODE_IDS_GENERATION.latentSauve]!.inputs.clip_index, 1);
  assert.notEqual(generation[NODE_IDS_GENERATION.prompt].inputs.value, entree.promptAssemble, "le fichier source n'est pas modifié");
});

test("génération : le préfixe de sortie ne touche que le brouillon", () => {
  const g = injecterGeneration(generation, { ...entree, prefixeSortie: "cadence_p4_r2" }, dossier);
  assert.equal(g[NODE_IDS_GENERATION.apercu]!.inputs.filename_prefix, "cadence_p4_r2");
  const sans = injecterGeneration(generation, entree, dossier);
  assert.equal(sans[NODE_IDS_GENERATION.apercu]!.inputs.filename_prefix, generation[NODE_IDS_GENERATION.apercu].inputs.filename_prefix);
});

test("upscale : même conditioning que la génération (prompt, durée, résolution, références)", () => {
  const g = injecterGeneration(generation, entree, dossier);
  const u = injecterUpscale(upscale, entree, dossier);
  for (const id of [NODE_IDS_GENERATION.prompt, NODE_IDS_GENERATION.resolution, NODE_IDS_GENERATION.dureeVideo, NODE_IDS_GENERATION.nombreImages, NODE_IDS_GENERATION.refNode]) {
    assert.deepEqual(u[id]!.inputs, g[id]!.inputs, `le nœud ${id} diffère entre la génération et l'upscale`);
  }
  assert.deepEqual(u.ref_img_1, g.ref_img_1);
  assert.deepEqual(u.ref_audio_1, g.ref_audio_1);
});

test("upscale : charge le latent de la génération, sauvegarde le sien, graine propre", () => {
  const u = injecterUpscale(upscale, entree, dossier);
  const chemins = cheminsLatents(dossier);
  assert.equal(u[NODE_IDS_UPSCALE.latentCharge]!.inputs.latent_path, chemins.genDossier);
  assert.equal(u[NODE_IDS_UPSCALE.latentCharge]!.inputs.clip_index, 1);
  assert.equal(u[NODE_IDS_UPSCALE.latentSauve]!.inputs.filename_prefix, chemins.upPrefixe);
  assert.equal(u[NODE_IDS_UPSCALE.seed]!.inputs.seed, 123);
});

test("le dossier de sauvegarde d'une étape est celui que la suivante recharge", () => {
  const c = cheminsLatents(dossier);
  assert.equal(c.genPrefixe, `${c.genDossier}/clip`);
  assert.equal(c.upPrefixe, `${c.upDossier}/clip`);
  const f = injecterFinition(finition, dossier, dossier, "cadence_p4_r2_final");
  assert.equal(f[NODE_IDS_FINITION.latentAudio]!.inputs.latent_path, c.genDossier, "l'audio vient de la première passe");
  assert.equal(f[NODE_IDS_FINITION.latentImage]!.inputs.latent_path, c.upDossier, "l'image vient du latent upscalé");
  assert.equal(f[NODE_IDS_FINITION.sortie]!.inputs.filename_prefix, "cadence_p4_r2_final");
});

test("un rendu final qui part d'une prévisualisation charge ses latents chez elle et range les siens chez lui", () => {
  const final = dossierLatents(4, 3);
  const u = injecterUpscale(upscale, entree, dossier, final);
  assert.equal(u[NODE_IDS_UPSCALE.latentCharge]!.inputs.latent_path, cheminsLatents(dossier).genDossier);
  assert.equal(u[NODE_IDS_UPSCALE.latentSauve]!.inputs.filename_prefix, cheminsLatents(final).upPrefixe);
  const f = injecterFinition(finition, dossier, final);
  assert.equal(f[NODE_IDS_FINITION.latentAudio]!.inputs.latent_path, cheminsLatents(dossier).genDossier);
  assert.equal(f[NODE_IDS_FINITION.latentImage]!.inputs.latent_path, cheminsLatents(final).upDossier);
});

test("dossierLatents : unique par plan, rendu et nouvelle tentative", () => {
  assert.equal(dossierLatents(4, 2), "cadence_p4_r2");
  assert.equal(dossierLatents(4, 2, 2), "cadence_p4_r2_t2");
  assert.notEqual(dossierLatents(4, 2), dossierLatents(4, 3));
  assert.notEqual(dossierLatents(4, 2), dossierLatents(5, 2));
});

test("durée hors bornes ou trop de références : refus avant toute soumission", () => {
  assert.throws(() => injecterGeneration(generation, { ...entree, dureeSecondes: 30 }, dossier), ErreurEntreeInvalide);
  assert.throws(() => injecterUpscale(upscale, { ...entree, dureeSecondes: 1 }, dossier), ErreurEntreeInvalide);
});

test("un nœud absent du fichier : erreur franche", () => {
  const casse = structuredClone(generation);
  delete casse[NODE_IDS_GENERATION.latentSauve];
  assert.throws(() => injecterGeneration(casse, entree, dossier), /302/);
});

// --- Plan en suite : Motion Context (latent du plan précédent) ---

test("génération « suite » : mêmes nœuds de saisie que la génération, plus le chargeur du contexte", () => {
  for (const [nom, id] of Object.entries(NODE_IDS_GENERATION_SUITE)) assert.ok(generationSuite[id], `nœud ${id} (${nom}) absent de VID_Generation_suite.json`);
  assert.equal(generationSuite[NODE_IDS_GENERATION_SUITE.latentContexte].class_type, "MiniMaxH3MotionContextLoadLatent");
  // Le contexte est lu dans le format de Motion Context ; le latent sauvegardé par la génération est celui du sampler, comme avant.
  assert.equal(generationSuite[NODE_IDS_GENERATION_SUITE.latentContexte].inputs.stock_format, false);
  assert.equal(generationSuite[NODE_IDS_GENERATION.latentSauve].inputs.latent[0], "125:12");
});

test("génération « suite » : le guider lit le conditioning de Motion Context et le brouillon est rogné du préfixe", () => {
  assert.equal(generationSuite["303"].class_type, "MiniMaxH3MotionContext");
  assert.deepEqual(generationSuite["125:14"].inputs.conditioning, ["303", 0]);
  assert.deepEqual(generationSuite[NODE_IDS_GENERATION.apercu].inputs.images, ["305", 0]);
  assert.deepEqual(generationSuite[NODE_IDS_GENERATION.apercu].inputs.audio, ["305", 1]);
  assert.equal(generationSuite["305"].class_type, "MiniMaxH3MotionContextTrim");
});

test("génération « suite » : charge le latent du plan précédent et garde le reste de l'injection", () => {
  const g = injecterGeneration(generationSuite, entree, dossier, "cadence_p3_r1");
  assert.equal(g[NODE_IDS_GENERATION_SUITE.latentContexte]!.inputs.latent_path, "h3_latents/cadence_p3_r1/gen");
  assert.equal(g[NODE_IDS_GENERATION_SUITE.latentContexte]!.inputs.clip_index, 1);
  assert.equal(g[NODE_IDS_GENERATION.latentSauve]!.inputs.filename_prefix, "h3_latents/cadence_p4_r2/gen/clip");
  assert.equal(g[NODE_IDS_GENERATION.prompt]!.inputs.value, entree.promptAssemble);
  assert.throws(() => injecterGeneration(generation, entree, dossier, "cadence_p3_r1"), /301/, "le fichier sans Motion Context refuse un dossier de contexte");
});

test("finition « suite » : retire 22 images de contexte de l'image et de l'audio avant RIFE et RTX", () => {
  assert.equal(finitionSuite["312"].class_type, "MiniMaxH3MotionContextTrim");
  assert.equal(finitionSuite["312"].inputs.trim_frames, 22);
  assert.equal(generationSuite["303"].inputs.context_length, "22", "le préfixe rogné est celui que la génération a reçu en contexte");
  assert.deepEqual(finitionSuite["165"].inputs.images, ["312", 0]);
  assert.deepEqual(finitionSuite[NODE_IDS_FINITION.sortie].inputs.audio, ["312", 1]);
  const f = injecterFinition(finitionSuite, dossier, dossier, "cadence_p4_r2_final");
  assert.equal(f[NODE_IDS_FINITION.latentImage]!.inputs.latent_path, cheminsLatents(dossier).upDossier);
});
