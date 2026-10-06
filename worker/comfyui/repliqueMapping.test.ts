import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { WorkflowJson } from "./imageMapping";
import { NODE_IDS_REPLIQUE, injecterGenerationReplique } from "./repliqueMapping";

// Lit le VRAI workflow : si un ré-export change un identifiant, ce test casse au lieu de laisser le worker soumettre un graphe faux.
const workflow = JSON.parse(
  readFileSync(resolve(process.cwd(), "workflows/audio/VOX_Generate_Replique_Simplified.json"), "utf8"),
) as WorkflowJson;

const entree = {
  texte: "Le monde était unifié, maintenu dans l'équilibre délicat des quatre nations.",
  langue: "French",
  temperature: 1.2,
  seed: "987654",
  referenceDistante: "cadence_voixref_VOICE_iris_1700000000.mp3",
  prefixeSortie: "audio/cadence_replique_12",
};

test("les nœuds du contrat existent dans VOX_Generate_Replique_Simplified.json", () => {
  for (const id of Object.values(NODE_IDS_REPLIQUE)) assert.ok(workflow[id], `nœud ${id} absent du workflow`);
  assert.equal(workflow[NODE_IDS_REPLIQUE.moteur]!.class_type, "Qwen3TTSEngineNode");
  assert.equal(workflow[NODE_IDS_REPLIQUE.texte]!.class_type, "UnifiedTTSTextNode");
  assert.equal(workflow[NODE_IDS_REPLIQUE.reference]!.class_type, "LoadAudio");
  assert.equal(workflow[NODE_IDS_REPLIQUE.sortie]!.class_type, "PreviewAudio");
  for (const champ of ["temperature", "language"]) assert.ok(champ in workflow[NODE_IDS_REPLIQUE.moteur]!.inputs, `champ ${champ}`);
  for (const champ of ["text", "seed", "TTS_engine", "opt_narrator", "enable_audio_cache"]) assert.ok(champ in workflow[NODE_IDS_REPLIQUE.texte]!.inputs, `champ ${champ}`);
  assert.ok("audio" in workflow[NODE_IDS_REPLIQUE.reference]!.inputs);
});

test("injection : texte, langue, température, seed, voix de référence ; la sortie devient un SaveAudio (FLAC)", () => {
  const g = injecterGenerationReplique(workflow, entree);
  const ids = NODE_IDS_REPLIQUE;
  assert.equal(g[ids.moteur]!.inputs.temperature, 1.2);
  assert.equal(g[ids.moteur]!.inputs.language, "French");
  assert.equal(g[ids.texte]!.inputs.text, entree.texte);
  assert.equal(g[ids.texte]!.inputs.seed, 987654);
  assert.equal(g[ids.texte]!.inputs.enable_audio_cache, false, "le cache audio est coupé : une autre voix de référence ne doit pas resservir une ancienne prise");
  assert.deepEqual(g[ids.texte]!.inputs.TTS_engine, ["1", 0], "le câblage du moteur est conservé");
  assert.deepEqual(g[ids.texte]!.inputs.opt_narrator, ["5", 0], "la voix de référence reste branchée sur le nœud de texte");
  assert.equal(g[ids.reference]!.inputs.audio, entree.referenceDistante);
  assert.equal(g[ids.sortie]!.class_type, "SaveAudio");
  assert.deepEqual(g[ids.sortie]!.inputs.audio, workflow[ids.sortie]!.inputs.audio, "la sortie reste branchée sur la même source");
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, "audio/cadence_replique_12");
  // Le graphe d'origine n'est pas modifié, et les réglages exportés (instruct…) restent ceux des essais directs.
  assert.equal(workflow[ids.sortie]!.class_type, "PreviewAudio");
  assert.equal(g[ids.moteur]!.inputs.instruct, workflow[ids.moteur]!.inputs.instruct);
});

test("créativité hors des bornes, texte vide, nœud absent : refus francs", () => {
  assert.throws(() => injecterGenerationReplique(workflow, { ...entree, temperature: 1.3 }), /hors limites/);
  assert.throws(() => injecterGenerationReplique(workflow, { ...entree, texte: "   " }), /vide/);
  const casse = structuredClone(workflow);
  delete casse[NODE_IDS_REPLIQUE.reference];
  assert.throws(() => injecterGenerationReplique(casse, entree), /introuvable/);
});
