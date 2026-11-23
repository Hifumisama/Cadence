import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  NODE_IDS_EDITION,
  NODE_IDS_TEXTE_VERS_IMAGE,
  dimensionsFormat,
  injecterEditionImages,
  injecterGenerationImage,
  instructionsAvecStyle,
  type WorkflowJson,
} from "./imageMapping";

const lireGraphe = (nom: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), `workflows/image-refs/${nom}`), "utf8")) as WorkflowJson;

/** Every link of a graph points to a node that exists. */
function liensValides(g: WorkflowJson) {
  for (const n of Object.values(g)) {
    for (const v of Object.values(n.inputs)) {
      if (Array.isArray(v) && typeof v[0] === "string") assert.ok(g[v[0]], `lien vers ${v[0]} sans nœud`);
    }
  }
}

const workflow = lireGraphe("IMG_01_TextToImage.json");

const entree = {
  prompt: "A copper sign above an arched door",
  clauseStyle: "Cinematic anime illustration.",
  aspect: "16:9" as const,
  megapixels: 1.3,
  seed: "12345",
  prefixeSortie: "cadence_DEC_x",
};

test("les nœuds du contrat existent dans IMG_01_TextToImage.json", () => {
  const ids = NODE_IDS_TEXTE_VERS_IMAGE;
  for (const id of Object.values(ids)) assert.ok(workflow[id], `nœud ${id} absent du workflow`);
  assert.equal(workflow[ids.prompt]!.class_type, "PrimitiveStringMultiline");
  assert.equal(workflow[ids.style]!.class_type, "PrimitiveStringMultiline");
  assert.equal(workflow[ids.format]!.class_type, "ResolutionSelector");
  assert.equal(workflow[ids.taille]!.class_type, "ResizeImageMaskNode");
  assert.equal(workflow[ids.taille]!.inputs.resize_type, "scale total pixels");
  assert.equal(workflow[ids.seed]!.class_type, "KSampler");
  assert.equal(workflow[ids.sortie]!.class_type, "SaveImage");
  assert.deepEqual(workflow[ids.sortie]!.inputs.images, [ids.taille, 0], "l'image enregistrée est l'image réduite");
  liensValides(workflow);
});

test("génération : H3 Image dessine à 16 MP, sans prompt enhancer", () => {
  assert.equal(workflow[NODE_IDS_TEXTE_VERS_IMAGE.format]!.inputs.megapixels, 16);
  const classes = Object.values(workflow).map((n) => n.class_type);
  assert.ok(classes.includes("MiniMaxH3ImageConditioning"));
  assert.ok(!classes.includes("TextGenerateV2"), "le prompt enhancer est revenu");
  assert.ok(!classes.includes("ComfySwitchNode"));
});

test("injection : prompt, style, format, taille enregistrée, seed et préfixe", () => {
  const g = injecterGenerationImage(workflow, entree);
  const ids = NODE_IDS_TEXTE_VERS_IMAGE;
  assert.equal(g[ids.prompt]!.inputs.value, entree.prompt);
  assert.equal(g[ids.style]!.inputs.value, entree.clauseStyle);
  assert.equal(g[ids.format]!.inputs.aspect_ratio, "16:9 (Widescreen)");
  assert.equal(g[ids.format]!.inputs.megapixels, 16, "le dessin reste à 16 MP");
  assert.equal(g[ids.taille]!.inputs["resize_type.megapixels"], 1.3);
  assert.equal(g[ids.seed]!.inputs.seed, 12345);
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, "cadence_DEC_x");
  // the original graph is not modified
  assert.notEqual(workflow[ids.prompt]!.inputs.value, entree.prompt);
});

test("un graphe dont un nœud a disparu est refusé", () => {
  const casse = structuredClone(workflow);
  delete casse[NODE_IDS_TEXTE_VERS_IMAGE.prompt];
  assert.throws(() => injecterGenerationImage(casse, entree), /introuvable/);
});

// --- Edit: IMG_Simple_Edit.json -----------------------------------------

const workflowEdition = lireGraphe("IMG_Simple_Edit.json");

const edition = {
  prompt: "The woman in <Picture 1> is <Subject 1>. The target image shows <Subject 1> with a red jacket.",
  seed: "777",
  sourcesDistantes: ["cadence_g_1.png"],
  prefixeSortie: "cadence_CHAR_maya",
};

test("les nœuds du contrat existent dans IMG_Simple_Edit.json", () => {
  const ids = NODE_IDS_EDITION;
  for (const id of Object.values(ids)) assert.ok(workflowEdition[id], `nœud ${id} absent du workflow d'édition`);
  assert.equal(workflowEdition[ids.image1]!.class_type, "LoadImage");
  assert.equal(workflowEdition[ids.conditionnement]!.class_type, "MiniMaxH3ImageConditioning");
  assert.equal(workflowEdition[ids.instructions]!.class_type, "PrimitiveStringMultiline");
  assert.deepEqual(workflowEdition[ids.conditionnement]!.inputs.prompt, [ids.instructions, 0]);
  assert.equal(workflowEdition[ids.seed]!.class_type, "KSampler");
  assert.equal(workflowEdition[ids.sortie]!.class_type, "SaveImage");
  assert.ok("image" in workflowEdition[ids.image1]!.inputs);
  assert.ok("images.image_1" in workflowEdition[ids.conditionnement]!.inputs);
  // the chain copied for images 2 to 6
  assert.equal(workflowEdition["56"]!.inputs["resize_type.megapixels"], 4);
  assert.equal(workflowEdition["48"]!.inputs["resize_type.multiple"], 32);
  // the saved image is scaled down to 1 MP
  const reduction = workflowEdition[(workflowEdition[ids.sortie]!.inputs.images as [string, number])[0]]!;
  assert.equal(reduction.class_type, "ResizeImageMaskNode");
  assert.equal(reduction.inputs["resize_type.megapixels"], 1);
  assert.ok(!Object.values(workflowEdition).some((n) => n.class_type === "TextGenerateV2"), "le prompt enhancer est revenu");
  liensValides(workflowEdition);
});

test("édition, 1 image : instructions, seed, préfixe ; la sortie suit l'image 1 ; pas de nœud en plus", () => {
  const g = injecterEditionImages(workflowEdition, edition);
  const ids = NODE_IDS_EDITION;
  assert.equal(g[ids.image1]!.inputs.image, "cadence_g_1.png");
  assert.equal(g[ids.instructions]!.inputs.value, edition.prompt);
  assert.equal(g[ids.seed]!.inputs.seed, 777);
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, "cadence_CHAR_maya");
  assert.ok(Array.isArray(g[ids.conditionnement]!.inputs.width), "la largeur reste celle de l'image 1");
  assert.equal(Object.keys(g).length, Object.keys(workflowEdition).length);
  assert.ok(!("images.image_2" in g[ids.conditionnement]!.inputs));
  // the original graph is not modified
  assert.notEqual(workflowEdition[ids.instructions]!.inputs.value, edition.prompt);
});

test("édition : le style du projet est rappelé en dernière ligne, les instructions restent intactes", () => {
  const consigne = "The woman in <Picture 1> is <Subject 1>.\nThe target image shows <Subject 1> sixty years old.";
  const clause = "A pre-rendered JRPG cutscene look: near-photoreal 3D modelling.";
  const g = injecterEditionImages(workflowEdition, { ...edition, prompt: consigne, clauseStyle: clause });
  assert.equal(g[NODE_IDS_EDITION.instructions]!.inputs.value, `${consigne}\nKeep the result in this art style: ${clause}`);
  // without a clause (old requests) or already present: nothing is added
  assert.equal(instructionsAvecStyle(consigne, ""), consigne);
  assert.equal(instructionsAvecStyle(consigne, undefined), consigne);
  assert.equal(instructionsAvecStyle(`${consigne}\n${clause}`, ` ${clause} `), `${consigne}\n${clause}`);
});

test("édition, format demandé (affiche) : largeur et hauteur explicites à 4 MP, multiples de 32", () => {
  const g = injecterEditionImages(workflowEdition, { ...edition, format: "2:3" });
  const cond = g[NODE_IDS_EDITION.conditionnement]!.inputs;
  assert.equal(cond.width, 1664);
  assert.equal(cond.height, 2496);
  const { largeur, hauteur } = dimensionsFormat("16:9", 1);
  assert.equal(largeur % 32, 0);
  assert.equal(hauteur % 32, 0);
  assert.ok(Math.abs(largeur / hauteur - 16 / 9) < 0.05);
});

test("édition, 2 à 6 images : chaque image a sa chaîne et entre dans le conditionnement", () => {
  const ids = NODE_IDS_EDITION;
  const g2 = injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: ["a.png", "b.png"] });
  assert.equal(Object.keys(g2).length, Object.keys(workflowEdition).length + 3);
  assert.equal(g2["cadence_source_2"]!.inputs.image, "b.png");
  assert.equal(g2["cadence_source_2_pixels"]!.inputs["resize_type.megapixels"], 4);
  assert.deepEqual(g2["cadence_source_2_pixels"]!.inputs.input, ["cadence_source_2", 0]);
  assert.deepEqual(g2["cadence_source_2_echelle"]!.inputs.input, ["cadence_source_2_pixels", 0]);
  assert.deepEqual(g2[ids.conditionnement]!.inputs["images.image_2"], ["cadence_source_2_echelle", 0]);
  assert.ok(!("images.image_3" in g2[ids.conditionnement]!.inputs));

  const six = ["a", "b", "c", "d", "e", "f"].map((x) => `${x}.png`);
  const g6 = injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: six });
  assert.equal(Object.keys(g6).length, Object.keys(workflowEdition).length + 15);
  assert.equal(g6[ids.image1]!.inputs.image, "a.png");
  assert.deepEqual(g6[ids.conditionnement]!.inputs["images.image_6"], ["cadence_source_6_echelle", 0]);
  liensValides(g6);
});

test("édition : 0 ou 7 sources, ou nœud manquant, sont refusés", () => {
  assert.throws(() => injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: [] }), /1 à 6/);
  const sept = ["a", "b", "c", "d", "e", "f", "g"];
  assert.throws(() => injecterEditionImages(workflowEdition, { ...edition, sourcesDistantes: sept }), /1 à 6/);
  const casse = structuredClone(workflowEdition);
  delete casse[NODE_IDS_EDITION.conditionnement];
  assert.throws(() => injecterEditionImages(casse, edition), /introuvable/);
});
