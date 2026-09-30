import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NODE_IDS, injecterValeurs } from "./mapping";
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
