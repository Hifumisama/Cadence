import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { NODE_IDS_TEXTE_VERS_IMAGE, injecterGenerationImage, type WorkflowJson } from "./imageMapping";

const workflow = JSON.parse(
  readFileSync(resolve(process.cwd(), "workflows/image-refs/IMG_01_TextToImage.json"), "utf8"),
) as WorkflowJson;

const entree = {
  prompt: "A copper sign above an arched door",
  clauseStyle: "Cinematic anime illustration.",
  aspect: "16:9" as const,
  megapixels: 1.3,
  seed: "12345",
  loraPersonnage: true,
  prefixeSortie: "cadence_DEC_x",
};

test("les nœuds du contrat existent dans IMG_01_TextToImage.json", () => {
  for (const id of Object.values(NODE_IDS_TEXTE_VERS_IMAGE)) {
    assert.ok(workflow[id], `nœud ${id} absent du workflow`);
  }
  assert.equal(workflow[NODE_IDS_TEXTE_VERS_IMAGE.format]!.class_type, "ResolutionSelector");
  assert.equal(workflow[NODE_IDS_TEXTE_VERS_IMAGE.seed]!.class_type, "KSampler");
  assert.equal(workflow[NODE_IDS_TEXTE_VERS_IMAGE.sortie]!.class_type, "SaveImage");
});

test("injection : prompt, style, format, seed, LoRA et préfixe", () => {
  const g = injecterGenerationImage(workflow, entree);
  const ids = NODE_IDS_TEXTE_VERS_IMAGE;
  assert.equal(g[ids.prompt]!.inputs.value, entree.prompt);
  assert.equal(g[ids.style]!.inputs.value, entree.clauseStyle);
  assert.equal(g[ids.format]!.inputs.aspect_ratio, "16:9 (Widescreen)");
  assert.equal(g[ids.format]!.inputs.megapixels, 1.3);
  assert.equal(g[ids.seed]!.inputs.seed, 12345);
  assert.equal(g[ids.lora]!.inputs.value, true);
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, "cadence_DEC_x");
  // le graphe d'origine n'est pas modifié
  assert.notEqual(workflow[ids.prompt]!.inputs.value, entree.prompt);
});

test("un graphe dont un nœud a disparu est refusé", () => {
  const casse = structuredClone(workflow);
  delete casse[NODE_IDS_TEXTE_VERS_IMAGE.prompt];
  assert.throws(() => injecterGenerationImage(casse, entree), /introuvable/);
});
