import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { NODE_IDS_AUDIO, injecterGenerationAudio } from "./audioMapping";
import type { WorkflowJson } from "./imageMapping";

// Lit le VRAI workflow : si un ré-export change un identifiant, ce test casse au
// lieu de laisser le worker soumettre un graphe faux.
const workflow = JSON.parse(
  readFileSync(resolve(process.cwd(), "workflows/audio/SFX_Generate_Sounds.json"), "utf8"),
) as WorkflowJson;

const entree = {
  prompt: "Heavy oak door creaking open slowly, echoing through a stone interior.",
  dureeSecondes: 4,
  seed: "987654",
  prefixeSortie: "audio/cadence_SFX_porte",
};

test("les nœuds du contrat existent dans SFX_Generate_Sounds.json", () => {
  for (const id of Object.values(NODE_IDS_AUDIO)) {
    assert.ok(workflow[id], `nœud ${id} absent du workflow`);
  }
  assert.equal(workflow[NODE_IDS_AUDIO.prompt]!.class_type, "PrimitiveStringMultiline");
  assert.equal(workflow[NODE_IDS_AUDIO.duree]!.class_type, "PrimitiveFloat");
  assert.equal(workflow[NODE_IDS_AUDIO.seed]!.class_type, "KSampler");
  assert.equal(workflow[NODE_IDS_AUDIO.reprompt]!.class_type, "PrimitiveBoolean");
  assert.equal(workflow[NODE_IDS_AUDIO.sortie]!.class_type, "SaveAudioMP3");
});

test("injection : prompt, durée, seed, réécriture désactivée, préfixe", () => {
  const g = injecterGenerationAudio(workflow, entree);
  const ids = NODE_IDS_AUDIO;
  assert.equal(g[ids.prompt]!.inputs.value, entree.prompt);
  assert.equal(g[ids.duree]!.inputs.value, 4);
  assert.equal(g[ids.seed]!.inputs.seed, 987654);
  assert.equal(g[ids.reprompt]!.inputs.value, false);
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, "audio/cadence_SFX_porte");
  // Le graphe d'origine n'est pas modifié.
  assert.notEqual(workflow[ids.prompt]!.inputs.value, entree.prompt);
});

test("la réécriture est coupée même si le fichier l'active", () => {
  const actif = structuredClone(workflow);
  actif[NODE_IDS_AUDIO.reprompt]!.inputs.value = true;
  const g = injecterGenerationAudio(actif, entree);
  assert.equal(g[NODE_IDS_AUDIO.reprompt]!.inputs.value, false);
});

test("durée décimale acceptée, durée hors limites refusée", () => {
  assert.equal(injecterGenerationAudio(workflow, { ...entree, dureeSecondes: 2.5 })[NODE_IDS_AUDIO.duree]!.inputs.value, 2.5);
  assert.throws(() => injecterGenerationAudio(workflow, { ...entree, dureeSecondes: 0 }), /hors limites/);
  assert.throws(() => injecterGenerationAudio(workflow, { ...entree, dureeSecondes: 61 }), /hors limites/);
  assert.throws(() => injecterGenerationAudio(workflow, { ...entree, dureeSecondes: Number.NaN }), /hors limites/);
});

test("un graphe dont un nœud a disparu est refusé", () => {
  const casse = structuredClone(workflow);
  delete casse[NODE_IDS_AUDIO.duree];
  assert.throws(() => injecterGenerationAudio(casse, entree), /52:36 introuvable/);
});
