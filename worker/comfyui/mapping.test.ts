import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ErreurEntreeInvalide, FPS_GENERATION, NODE_IDS, injecterValeurs, nomDistantDepuisChemin, verifierEntree } from "./mapping";
import type { SubmissionInput } from "./types";

// Lit le VRAI workflow : si un ré-export change un identifiant ou un nom de
// champ, ce test casse au lieu de laisser le worker soumettre un graphe faux.
const workflow = JSON.parse(readFileSync("workflows/video-generation/VID_REF2VA.json", "utf-8"));

const entree: SubmissionInput = {
  promptAssemble: "summary: test",
  seed: "123",
  dureeSecondes: 8,
  fps: 24,
  refsImage: [{ slot: 1, cheminLocal: "C:/x/CHAR_maya.png" }],
  refsAudio: [],
  refsVideo: [],
  activerUpscale: false,
};

test("les nœuds cartographiés existent dans le workflow", () => {
  for (const [nom, id] of Object.entries(NODE_IDS)) {
    assert.ok(workflow[id], `nœud ${id} (${nom}) absent de VID_REF2VA.json`);
  }
});

test("injection : prompt, seeds, référence dynamique, sortie basse résolution", () => {
  const g = injecterValeurs(workflow, entree);
  assert.equal(g[NODE_IDS.prompt]!.inputs.value, entree.promptAssemble);
  assert.notEqual(workflow[NODE_IDS.prompt].inputs.value, entree.promptAssemble);
  assert.equal(g[NODE_IDS.seedPremierPass]!.inputs.seed, 123);
  assert.equal(g[NODE_IDS.seedSecondPass]!.inputs.noise_seed, 123);
  assert.deepEqual(g[NODE_IDS.refNode]!.inputs["ref_images.ref_image_0"], ["ref_img_1", 0]);
  assert.equal(g.ref_img_1!.inputs.image, "CHAR_maya.png");
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.images, [NODE_IDS.basseResImages, 0]);
});

test("upscale activé : la sortie passe par la branche RIFE", () => {
  const g = injecterValeurs(workflow, { ...entree, activerUpscale: true });
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.images, [NODE_IDS.upscaleImages, 0]);
});

// --- Durée : nœud 22:23 -> expression 22:24 -> `length` du nœud 5 ---

/** L'expression du nœud 22:24, recopiée en TypeScript pour la documenter. `%` y est celui de Python
 * (résultat toujours positif) : celui de JavaScript donnerait un reste négatif. */
function nombreImages(secondes: number): number {
  const mod = (a: number, b: number) => ((a % b) + b) % b;
  const n = Math.max(5, Math.round(secondes * 24));
  return n + mod(5 - mod(n, 17), 17);
}

test("l'expression du nœud 22:24 est celle que le test reproduit", () => {
  assert.equal(
    workflow[NODE_IDS.nombreImages].inputs.expression,
    "max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17",
  );
  assert.deepEqual(workflow[NODE_IDS.nombreImages].inputs["values.a"], [NODE_IDS.dureeVideo, 0]);
  assert.deepEqual(workflow[NODE_IDS.refNode].inputs.length, [NODE_IDS.nombreImages, 1]);
});

test("nombre d'images : forme 17k+5, arrondi par excès de moins de 17 images", () => {
  const attendu: Record<number, number> = { 5: 124, 8: 192, 12: 294, 15: 362 };
  for (const [s, images] of Object.entries(attendu)) {
    const n = nombreImages(Number(s));
    assert.equal(n, images, `${s} s`);
    assert.equal((n - 5) % 17, 0, `${s} s : forme 17k+5`);
    assert.ok(n >= Number(s) * 24 && n - Number(s) * 24 < 17, `${s} s : arrondi par excès`);
  }
  // plage entraînée du modèle : ~124 à ~362 images (infobulle de `length` sur le nœud 5)
  assert.equal(nombreImages(5), 124);
  assert.equal(nombreImages(15), 362);
});

test("la durée du plan est injectée dans le nœud 22:23", () => {
  for (const s of [5, 8, 12, 15]) {
    const g = injecterValeurs(workflow, { ...entree, dureeSecondes: s });
    assert.equal(g[NODE_IDS.dureeVideo]!.inputs.value, s);
  }
  assert.equal(workflow[NODE_IDS.dureeVideo].inputs.value, 8, "le fichier source n'est pas modifié");
});

test("durée hors 5-15 s : erreur franche, jamais de repli sur la durée du fichier", () => {
  for (const s of [0, 4, 4.99, 15.01, 16, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => injecterValeurs(workflow, { ...entree, dureeSecondes: s }), ErreurEntreeInvalide, String(s));
  }
});

// --- Références ---

const img = (slot: number) => ({ slot, cheminLocal: `C:/x/IMG_${slot}.png`, nomDistant: `cadence_assets_IMG_${slot}.png` });
const aud = (slot: number, dureeSecondes?: number | null) => ({ slot, cheminLocal: `C:/x/prise_${slot}.wav`, dureeSecondes });
const vid = (slot: number) => ({ slot, cheminLocal: `C:/x/KEY_${slot}.mp4` });

test("plan sans audio : aucun lien audio, les références de l'export sont purgées", () => {
  const g = injecterValeurs(workflow, { ...entree, refsImage: [img(1)] });
  const cles = Object.keys(g[NODE_IDS.refNode]!.inputs);
  assert.deepEqual(cles.filter((c) => c.startsWith("ref_audios.")), []);
  assert.deepEqual(cles.filter((c) => c.startsWith("ref_images.")), ["ref_images.ref_image_0"]);
  assert.deepEqual(g[NODE_IDS.refNode]!.inputs["ref_images.ref_image_0"], ["ref_img_1", 0]);
  assert.equal(g.ref_img_1!.inputs.image, "cadence_assets_IMG_1.png", "nom distant imposé");
});

test("six images : ref_image_0 à ref_image_5 câblés sur 6 LoadImageCrop", () => {
  const g = injecterValeurs(workflow, { ...entree, refsImage: [1, 2, 3, 4, 5, 6].map(img) });
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(g[NODE_IDS.refNode]!.inputs[`ref_images.ref_image_${i}`], [`ref_img_${i + 1}`, 0]);
    assert.equal(g[`ref_img_${i + 1}`]!.class_type, "LoadImageCrop");
    assert.deepEqual(Object.keys(g[`ref_img_${i + 1}`]!.inputs), ["image", "crop", "max_megapixels"]);
  }
});

test("trois audios : ref_audio_0 à ref_audio_2, durée de la prise dans start/end/duration", () => {
  const g = injecterValeurs(workflow, { ...entree, refsAudio: [aud(1, 6.05), aud(2, 2.504), aud(3, null)] });
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(g[NODE_IDS.refNode]!.inputs[`ref_audios.ref_audio_${i}`], [`ref_audio_${i + 1}`, 0]);
    assert.equal(g[`ref_audio_${i + 1}`]!.class_type, "LoadAudioUI");
  }
  assert.deepEqual(
    [g.ref_audio_1!.inputs.start_time, g.ref_audio_1!.inputs.end_time, g.ref_audio_1!.inputs.duration],
    [0, 6.05, 6.05],
  );
  assert.equal(g.ref_audio_2!.inputs.end_time, 2.51, "arrondi par excès au centième : jamais de queue coupée");
  assert.equal(g.ref_audio_3!.inputs.end_time, 0, "durée inconnue : défaut du nœud");
  assert.equal(g.ref_audio_1!.inputs.audio, "prise_1.wav", "à défaut de nom distant, le nom du fichier");
});

test("emplacement non contigu : le lien suit l'emplacement (<Audio 2> du prompt = ref_audio_1)", () => {
  const g = injecterValeurs(workflow, { ...entree, refsAudio: [aud(2, 3)] });
  assert.deepEqual(g[NODE_IDS.refNode]!.inputs["ref_audios.ref_audio_1"], ["ref_audio_2", 0]);
  assert.equal("ref_audios.ref_audio_0" in g[NODE_IDS.refNode]!.inputs, false);
});

test("vidéo de référence : LoadVideoUI avec tous ses champs obligatoires (object_info 2026-10-02)", () => {
  const g = injecterValeurs(workflow, { ...entree, refsVideo: [vid(1)] });
  assert.deepEqual(g[NODE_IDS.refNode]!.inputs["ref_videos.ref_video_0"], ["ref_video_1", 0]);
  assert.deepEqual(Object.keys(g.ref_video_1!.inputs), [
    "video", "start_time", "end_time", "duration", "start_frame", "end_frame", "duration_frames",
    "resize_method", "custom_width", "custom_height", "frame_rate", "display_mode",
    "crop_x", "crop_y", "crop_w", "crop_h",
  ]);
});

test("limites : 7 références visuelles, 4 audios, emplacements hors plage ou en double", () => {
  const cas: SubmissionInput[] = [
    { ...entree, refsImage: [1, 2, 3, 4, 5, 6, 7].map(img) },
    { ...entree, refsImage: [1, 2, 3, 4, 5].map(img), refsVideo: [vid(1), vid(2)] },
    { ...entree, refsAudio: [1, 2, 3, 4].map((s) => aud(s)) },
    { ...entree, refsImage: [img(7)] },
    { ...entree, refsImage: [img(0)] },
    { ...entree, refsAudio: [aud(1), aud(1)] },
  ];
  for (const c of cas) assert.throws(() => verifierEntree(c), ErreurEntreeInvalide);
  assert.doesNotThrow(() => verifierEntree({ ...entree, refsImage: [1, 2, 3, 4].map(img), refsVideo: [vid(1), vid(2)] }));
});

test("noms distants : préfixe cadence_, séparateurs aplatis, deux prises de même nom distinctes", () => {
  assert.equal(nomDistantDepuisChemin("assets/CHAR_maya.png"), "cadence_assets_CHAR_maya.png");
  assert.notEqual(nomDistantDepuisChemin("repliques/12/prise.wav"), nomDistantDepuisChemin("repliques/13/prise.wav"));
});

// --- Seeds, upscale, fps ---

test("seeds : les trois nœuds reçoivent la seed du plan ; sans seed, le fichier est laissé tel quel", () => {
  const g = injecterValeurs(workflow, { ...entree, seed: "987654321" });
  assert.equal(g[NODE_IDS.seedPremierPass]!.inputs.seed, 987654321);
  assert.equal(g[NODE_IDS.seedUpscale]!.inputs.seed, 987654321);
  assert.equal(g[NODE_IDS.seedSecondPass]!.inputs.noise_seed, 987654321);
  const sans = injecterValeurs(workflow, { ...entree, seed: undefined });
  assert.equal(sans[NODE_IDS.seedPremierPass]!.inputs.seed, workflow[NODE_IDS.seedPremierPass].inputs.seed);
});

test("upscale : audio et images sur la branche RIFE, cadence du fichier (48 i/s) conservée", () => {
  const g = injecterValeurs(workflow, { ...entree, activerUpscale: true });
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.audio, [NODE_IDS.upscaleAudio, 0]);
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.frame_rate, ["170", 0]);
  assert.equal(workflow["168"].inputs.value, 48);
  assert.equal(workflow[NODE_IDS.upscaleImages].inputs.source_fps, FPS_GENERATION);
});

test("sans upscale : sortie à 24 i/s (sinon la prévisualisation serait lue à 48), audio basse résolution", () => {
  const g = injecterValeurs(workflow, { ...entree, activerUpscale: false });
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.audio, [NODE_IDS.basseResAudio, 0]);
  assert.equal(g[NODE_IDS.sortieFinale]!.inputs.frame_rate, 24);
});

test("fps du plan : sans effet sur le graphe (cadence réglée par les nœuds 168/169/170)", () => {
  const a = injecterValeurs(workflow, { ...entree, fps: 24, activerUpscale: true });
  const b = injecterValeurs(workflow, { ...entree, fps: 60, activerUpscale: true });
  assert.deepEqual(a, b);
});

test("les nœuds de référence créés à la volée n'existent pas dans le fichier (ids sans collision)", () => {
  for (const id of ["ref_img_1", "ref_audio_1", "ref_video_1"]) assert.equal(workflow[id], undefined);
});

test("préfixe de sortie : posé sur la sortie finale et sur l'aperçu, sinon le fichier est laissé tel quel", () => {
  const avec = injecterValeurs(workflow, { ...entree, prefixeSortie: "cadence_p4_r2" });
  assert.equal(avec[NODE_IDS.sortieFinale]!.inputs.filename_prefix, "cadence_p4_r2");
  assert.equal(avec[NODE_IDS.sortieApercu]!.inputs.filename_prefix, "low_cadence_p4_r2");
  const sans = injecterValeurs(workflow, entree);
  assert.equal(sans[NODE_IDS.sortieFinale]!.inputs.filename_prefix, workflow[NODE_IDS.sortieFinale]!.inputs.filename_prefix);
});
