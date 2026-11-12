import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ErreurEntreeInvalide, FPS_GENERATION, NODE_IDS, injecterValeurs, nomDistantDepuisChemin, verifierEntree } from "./mapping";
import type { SubmissionInput } from "./types";

// Reads the REAL workflow: if a re-export changes an identifier or a field
// name, this test breaks instead of letting the worker submit a wrong graph.
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
  assert.deepEqual(g.ref_img_1!.inputs.image, ["ref_img_1_charge", 0]);
  assert.equal(g.ref_img_1_charge!.inputs.image, "CHAR_maya.png");
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.images, [NODE_IDS.basseResImages, 0]);
});

test("upscale activé : la sortie passe par la branche RIFE", () => {
  const g = injecterValeurs(workflow, { ...entree, activerUpscale: true });
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.images, [NODE_IDS.upscaleImages, 0]);
});

// --- Duration: node 22:23 -> expression 22:24 -> `length` of node 5 ---

/** The node 22:24 expression, copied into TypeScript to document it. `%` there is Python's
 * (always positive result): JavaScript's would give a negative remainder. */
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
  // trained range of the model: ~124 to ~362 frames (tooltip of `length` on node 5)
  assert.equal(nombreImages(5), 124);
  assert.equal(nombreImages(15), 362);
});

test("la durée du plan est injectée dans le nœud 22:23", () => {
  for (const s of [5, 8, 10]) {
    const g = injecterValeurs(workflow, { ...entree, dureeSecondes: s });
    assert.equal(g[NODE_IDS.dureeVideo]!.inputs.value, s);
  }
  assert.equal(workflow[NODE_IDS.dureeVideo].inputs.value, 8, "le fichier source n'est pas modifié");
});

test("durée hors 4-10 s : erreur franche, jamais de repli sur la durée du fichier", () => {
  for (const s of [0, 3, 3.99, 10.01, 16, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => injecterValeurs(workflow, { ...entree, dureeSecondes: s }), ErreurEntreeInvalide, String(s));
  }
});

// --- References ---

const img = (slot: number) => ({ slot, cheminLocal: `C:/x/IMG_${slot}.png`, nomDistant: `cadence_assets_IMG_${slot}.png` });
const aud = (slot: number, dureeSecondes?: number | null) => ({ slot, cheminLocal: `C:/x/prise_${slot}.wav`, dureeSecondes });
const vid = (slot: number) => ({ slot, cheminLocal: `C:/x/KEY_${slot}.mp4` });

test("plan sans audio : aucun lien audio, les références de l'export sont purgées", () => {
  const g = injecterValeurs(workflow, { ...entree, refsImage: [img(1)] });
  const cles = Object.keys(g[NODE_IDS.refNode]!.inputs);
  assert.deepEqual(cles.filter((c) => c.startsWith("ref_audios.")), []);
  assert.deepEqual(cles.filter((c) => c.startsWith("ref_images.")), ["ref_images.ref_image_0"]);
  assert.deepEqual(g[NODE_IDS.refNode]!.inputs["ref_images.ref_image_0"], ["ref_img_1", 0]);
  assert.equal(g.ref_img_1_charge!.inputs.image, "cadence_assets_IMG_1.png", "nom distant imposé");
});

test("six images : ref_image_0 à ref_image_5 câblés sur 6 couples LoadImage + ImageScaleToTotalPixels (noyau)", () => {
  const g = injecterValeurs(workflow, { ...entree, refsImage: [1, 2, 3, 4, 5, 6].map(img) });
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(g[NODE_IDS.refNode]!.inputs[`ref_images.ref_image_${i}`], [`ref_img_${i + 1}`, 0]);
    assert.equal(g[`ref_img_${i + 1}`]!.class_type, "ImageScaleToTotalPixels");
    assert.deepEqual(g[`ref_img_${i + 1}`]!.inputs.image, [`ref_img_${i + 1}_charge`, 0]);
    assert.equal(g[`ref_img_${i + 1}`]!.inputs.megapixels, 1);
    assert.equal(g[`ref_img_${i + 1}_charge`]!.class_type, "LoadImage");
    assert.deepEqual(Object.keys(g[`ref_img_${i + 1}_charge`]!.inputs), ["image"]);
  }
});

test("trois audios : ref_audio_0 à ref_audio_2, sur le nœud LoadAudio du noyau", () => {
  const g = injecterValeurs(workflow, { ...entree, refsAudio: [aud(1, 6.05), aud(2, 2.504), aud(3, null)] });
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(g[NODE_IDS.refNode]!.inputs[`ref_audios.ref_audio_${i}`], [`ref_audio_${i + 1}`, 0]);
    assert.equal(g[`ref_audio_${i + 1}`]!.class_type, "LoadAudio");
    assert.deepEqual(Object.keys(g[`ref_audio_${i + 1}`]!.inputs), ["audio"]);
  }
  assert.equal(g.ref_audio_1!.inputs.audio, "prise_1.wav", "à défaut de nom distant, le nom du fichier");
});

test("emplacement non contigu : le lien suit l'emplacement (<Audio 2> du prompt = ref_audio_1)", () => {
  const g = injecterValeurs(workflow, { ...entree, refsAudio: [aud(2, 3)] });
  assert.deepEqual(g[NODE_IDS.refNode]!.inputs["ref_audios.ref_audio_1"], ["ref_audio_2", 0]);
  assert.equal("ref_audios.ref_audio_0" in g[NODE_IDS.refNode]!.inputs, false);
});

test("vidéo de référence : LoadVideo puis GetVideoComponents (noyau), les images alimentent ref_videos", () => {
  const g = injecterValeurs(workflow, { ...entree, refsVideo: [vid(1)] });
  assert.deepEqual(g[NODE_IDS.refNode]!.inputs["ref_videos.ref_video_0"], ["ref_video_1_images", 0]);
  assert.equal(g.ref_video_1!.class_type, "LoadVideo");
  assert.deepEqual(Object.keys(g.ref_video_1!.inputs), ["file"]);
  assert.equal(g.ref_video_1_images!.class_type, "GetVideoComponents");
  assert.deepEqual(g.ref_video_1_images!.inputs.video, ["ref_video_1", 0]);
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
  for (const id of ["ref_img_1", "ref_img_1_charge", "ref_audio_1", "ref_video_1"]) assert.equal(workflow[id], undefined);
});

test("préfixe de sortie : posé sur la sortie finale et sur l'aperçu, sinon le fichier est laissé tel quel", () => {
  const avec = injecterValeurs(workflow, { ...entree, prefixeSortie: "cadence_p4_r2" });
  assert.equal(avec[NODE_IDS.sortieFinale]!.inputs.filename_prefix, "cadence_p4_r2");
  assert.equal(avec[NODE_IDS.sortieApercu]!.inputs.filename_prefix, "low_cadence_p4_r2");
  const sans = injecterValeurs(workflow, entree);
  assert.equal(sans[NODE_IDS.sortieFinale]!.inputs.filename_prefix, workflow[NODE_IDS.sortieFinale]!.inputs.filename_prefix);
});

// --- Resolution (0.2 / 0.3 / 0.4 MP) ---

test("la résolution est injectée dans le nœud 22:9, le fichier source n'est pas modifié", () => {
  for (const mp of [0.2, 0.3, 0.4]) {
    const g = injecterValeurs(workflow, { ...entree, megapixels: mp });
    assert.equal(g[NODE_IDS.resolution]!.inputs.megapixels, mp);
  }
  const sans = injecterValeurs(workflow, entree);
  assert.equal(sans[NODE_IDS.resolution]!.inputs.megapixels, workflow[NODE_IDS.resolution].inputs.megapixels, "absente de l'entrée : celle du fichier");
  assert.ok(Math.abs(workflow[NODE_IDS.resolution].inputs.megapixels - 0.2) < 0.001);
});

test("une résolution hors liste est refusée avant toute soumission", () => {
  for (const mp of [0.1, 0.25, 0.5, 1, 0, -0.2, Number.NaN]) {
    assert.throws(() => injecterValeurs(workflow, { ...entree, megapixels: mp }), ErreurEntreeInvalide, String(mp));
  }
});

test("final à 0,2 MP : upscale ; final à 0,3 ou 0,4 MP : natif, sans upscale mais avec l'interpolation ; aperçu : branche basse", () => {
  const upscale = injecterValeurs(workflow, { ...entree, activerUpscale: true, megapixels: 0.2 });
  assert.deepEqual(upscale[NODE_IDS.sortieFinale]!.inputs.images, [NODE_IDS.upscaleImages, 0]);
  assert.deepEqual(upscale[NODE_IDS.upscaleImages]!.inputs.images, ["189", 0], "RIFE lit la sortie de l'upscale");

  for (const mp of [0.3, 0.4]) {
    const natif = injecterValeurs(workflow, { ...entree, activerUpscale: true, megapixels: mp });
    assert.deepEqual(natif[NODE_IDS.sortieFinale]!.inputs.images, [NODE_IDS.upscaleImages, 0]);
    assert.deepEqual(natif[NODE_IDS.upscaleImages]!.inputs.images, [NODE_IDS.basseResImages, 0], "RIFE lit la première passe, pas l'upscale");
    assert.deepEqual(natif[NODE_IDS.sortieFinale]!.inputs.audio, [NODE_IDS.basseResAudio, 0]);
    assert.notEqual(natif[NODE_IDS.sortieFinale]!.inputs.frame_rate, FPS_GENERATION, "la cadence finale reste celle de l'interpolation");
  }

  const apercu = injecterValeurs(workflow, { ...entree, activerUpscale: false, megapixels: 0.2 });
  assert.deepEqual(apercu[NODE_IDS.sortieFinale]!.inputs.images, [NODE_IDS.basseResImages, 0]);
  assert.equal(apercu[NODE_IDS.sortieFinale]!.inputs.frame_rate, FPS_GENERATION);
  assert.deepEqual(workflow["165"].inputs.images, ["189", 0], "le fichier source n'est pas modifié");
});

// --- What ComfyUI would actually run (without GPU) ---

type GrapheTest = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/** The nodes ComfyUI executes: those a output node depends on (here the two « Video Combine »), following the links `[idDuNœud, sortie]`. */
function noeudsExecutes(g: GrapheTest): Set<string> {
  const vus = new Set<string>();
  const pile = Object.keys(g).filter((id) => g[id]!.class_type === "VHS_VideoCombine");
  while (pile.length) {
    const id = pile.pop()!;
    if (vus.has(id)) continue;
    vus.add(id);
    for (const v of Object.values(g[id]!.inputs)) {
      if (Array.isArray(v) && typeof v[0] === "string" && g[v[0]]) pile.push(v[0]);
    }
  }
  return vus;
}

const UPSCALE_NOEUDS = ["243", "244", "135:26", "135:29", "135:27", "189"];

test("graphe : chaque lien pointe un nœud qui existe, dans les trois modes et les trois résolutions", () => {
  for (const activerUpscale of [false, true]) {
    for (const megapixels of [0.2, 0.3, 0.4]) {
      const g = injecterValeurs(workflow, { ...entree, activerUpscale, megapixels }) as GrapheTest;
      for (const [id, n] of Object.entries(g)) {
        for (const v of Object.values(n.inputs)) {
          if (Array.isArray(v) && typeof v[0] === "string" && v.length === 2 && typeof v[1] === "number") {
            assert.ok(g[v[0]], `nœud ${id} (${activerUpscale ? "final" : "aperçu"}, ${megapixels} MP) : lien vers ${v[0]} introuvable`);
          }
        }
      }
    }
  }
});

test("graphe : l'upscale ne s'exécute qu'en final à 0,2 MP ; le final natif exécute l'interpolation mais aucun nœud d'upscale", () => {
  const upscale = noeudsExecutes(injecterValeurs(workflow, { ...entree, activerUpscale: true, megapixels: 0.2 }) as GrapheTest);
  for (const id of UPSCALE_NOEUDS) assert.ok(upscale.has(id), `final 0,2 MP : le nœud ${id} devrait s'exécuter`);

  for (const mp of [0.3, 0.4]) {
    const natif = noeudsExecutes(injecterValeurs(workflow, { ...entree, activerUpscale: true, megapixels: mp }) as GrapheTest);
    for (const id of UPSCALE_NOEUDS) assert.ok(!natif.has(id), `final natif ${mp} MP : le nœud ${id} ne doit PAS s'exécuter`);
    assert.ok(natif.has("165"), "l'interpolation (RIFE) s'exécute");
    assert.ok(natif.has("176"), "la première passe est décodée");
    assert.ok(natif.has("5") && natif.has("22:9"), "la première passe lit la résolution");
  }

  const apercu = noeudsExecutes(injecterValeurs(workflow, { ...entree, activerUpscale: false, megapixels: 0.2 }) as GrapheTest);
  for (const id of [...UPSCALE_NOEUDS, "165"]) assert.ok(!apercu.has(id), `aperçu : le nœud ${id} ne doit pas s'exécuter`);
});
