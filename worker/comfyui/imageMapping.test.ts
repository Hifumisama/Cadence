import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  NODE_IDS_EDITION,
  NODE_IDS_TEXTE_VERS_IMAGE,
  injecterEditionImages,
  injecterGenerationImage,
  type WorkflowJson,
} from "./imageMapping";

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

// --- Édition : IMG_Simple_Edit.json -----------------------------------------

const workflowEdition = JSON.parse(
  readFileSync(resolve(process.cwd(), "workflows/image-refs/IMG_Simple_Edit.json"), "utf8"),
) as WorkflowJson;

const edition = {
  prompt: "Make the jacket red, keep the face",
  seed: "777",
  lightning: true,
  sourcesDistantes: ["cadence_g_1.png"],
  prefixeSortie: "cadence_CHAR_maya",
};

test("les nœuds du contrat existent dans IMG_Simple_Edit.json", () => {
  for (const id of Object.values(NODE_IDS_EDITION)) {
    assert.ok(workflowEdition[id], `nœud ${id} absent du workflow d'édition`);
  }
  const ids = NODE_IDS_EDITION;
  assert.equal(workflowEdition[ids.image1]!.class_type, "LoadImage");
  assert.equal(workflowEdition[ids.encodeurPositif]!.class_type, "TextEncodeQwenImageEditPlus");
  assert.equal(workflowEdition[ids.encodeurNegatif]!.class_type, "TextEncodeQwenImageEditPlus");
  assert.equal(workflowEdition[ids.seed]!.class_type, "KSampler");
  assert.equal(workflowEdition[ids.lightning]!.class_type, "PrimitiveBoolean");
  assert.equal(workflowEdition[ids.sortie]!.class_type, "SaveImageAdvanced");
  // les champs écrits existent bien dans l'export
  assert.ok("image" in workflowEdition[ids.image1]!.inputs);
  assert.ok("prompt" in workflowEdition[ids.encodeurPositif]!.inputs);
  assert.ok("seed" in workflowEdition[ids.seed]!.inputs);
  assert.ok("value" in workflowEdition[ids.lightning]!.inputs);
  assert.ok("filename_prefix" in workflowEdition[ids.sortie]!.inputs);
});

test("édition, 1 image : prompt, seed, Lightning, préfixe ; pas de nœud en plus", () => {
  const g = injecterEditionImages(workflowEdition, edition);
  const ids = NODE_IDS_EDITION;
  assert.equal(g[ids.image1]!.inputs.image, "cadence_g_1.png");
  assert.equal(g[ids.encodeurPositif]!.inputs.prompt, edition.prompt);
  assert.equal(g[ids.encodeurNegatif]!.inputs.prompt, "");
  assert.equal(g[ids.seed]!.inputs.seed, 777);
  assert.equal(g[ids.lightning]!.inputs.value, true);
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, "cadence_CHAR_maya");
  assert.equal(Object.keys(g).length, Object.keys(workflowEdition).length);
  assert.ok(!("image2" in g[ids.encodeurPositif]!.inputs));
  // le graphe d'origine n'est pas modifié
  assert.notEqual(workflowEdition[ids.encodeurPositif]!.inputs.prompt, edition.prompt);
});

test("édition, Qualité : Lightning désactivé", () => {
  const g = injecterEditionImages(workflowEdition, { ...edition, lightning: false });
  assert.equal(g[NODE_IDS_EDITION.lightning]!.inputs.value, false);
});

test("édition, 2 et 3 images : nœuds créés et câblés sur les deux encodeurs", () => {
  const ids = NODE_IDS_EDITION;
  const g2 = injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: ["a.png", "b.png"] });
  assert.equal(Object.keys(g2).length, Object.keys(workflowEdition).length + 2);
  assert.equal(g2["cadence_source_2"]!.class_type, "LoadImage");
  assert.equal(g2["cadence_source_2"]!.inputs.image, "b.png");
  assert.equal(g2["cadence_source_2_echelle"]!.class_type, "FluxKontextImageScale");
  assert.deepEqual(g2["cadence_source_2_echelle"]!.inputs.image, ["cadence_source_2", 0]);
  for (const enc of [ids.encodeurPositif, ids.encodeurNegatif]) {
    assert.deepEqual(g2[enc]!.inputs.image2, ["cadence_source_2_echelle", 0]);
    assert.ok(!("image3" in g2[enc]!.inputs));
  }

  const g3 = injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: ["a.png", "b.png", "c.png"] });
  assert.equal(Object.keys(g3).length, Object.keys(workflowEdition).length + 4);
  assert.equal(g3[ids.image1]!.inputs.image, "a.png");
  for (const enc of [ids.encodeurPositif, ids.encodeurNegatif]) {
    assert.deepEqual(g3[enc]!.inputs.image3, ["cadence_source_3_echelle", 0]);
  }
  // chaque lien du graphe créé pointe vers un nœud qui existe
  for (const n of Object.values(g3)) {
    for (const v of Object.values(n.inputs)) {
      if (Array.isArray(v) && typeof v[0] === "string") assert.ok(g3[v[0]], `lien vers ${v[0]} sans nœud`);
    }
  }
});

test("édition : 0 ou 4 sources, ou nœud manquant, sont refusés", () => {
  assert.throws(() => injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: [] }), /1 à 3/);
  assert.throws(
    () => injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: ["a", "b", "c", "d"] }),
    /1 à 3/,
  );
  const casse = structuredClone(workflowEdition);
  delete casse[NODE_IDS_EDITION.encodeurPositif];
  assert.throws(() => injecterEditionImages(casse, edition), /introuvable/);
});
