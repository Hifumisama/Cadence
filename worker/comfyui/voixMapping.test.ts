import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { WorkflowJson } from "./imageMapping";
import { NODE_IDS_VOIX, injecterGenerationVoix } from "./voixMapping";

// Lit le VRAI workflow : si un ré-export change un identifiant, ce test casse au
// lieu de laisser le worker soumettre un graphe faux.
const workflow = JSON.parse(
  readFileSync(resolve(process.cwd(), "workflows/audio/VOX_Generate_Voice_Simplified.json"), "utf8"),
) as WorkflowJson;

const entree = {
  instruction: "A calm native French speaker, a low and even voice.",
  texteReference: "Welcome adventurer, and be my guest.",
  langue: "English",
  temperature: 1.1,
  seed: "123456",
  prefixeSortie: "audio/cadence_VOICE_maya",
};

test("les nœuds du contrat existent dans VOX_Generate_Voice_Simplified.json", () => {
  for (const id of Object.values(NODE_IDS_VOIX)) assert.ok(workflow[id], `nœud ${id} absent du workflow`);
  assert.equal(workflow[NODE_IDS_VOIX.moteur]!.class_type, "Qwen3TTSEngineNode");
  assert.equal(workflow[NODE_IDS_VOIX.concepteur]!.class_type, "UnifiedVoiceDesignerNode");
  assert.equal(workflow[NODE_IDS_VOIX.sortie]!.class_type, "PreviewAudio");
  for (const champ of ["temperature", "language"]) assert.ok(champ in workflow[NODE_IDS_VOIX.moteur]!.inputs, `champ ${champ}`);
  for (const champ of ["reference_text", "voice_instruction", "seed", "TTS_engine"]) assert.ok(champ in workflow[NODE_IDS_VOIX.concepteur]!.inputs, `champ ${champ}`);
});

test("injection : instruction, texte, langue, température, seed ; la sortie devient un SaveAudioMP3", () => {
  const g = injecterGenerationVoix(workflow, entree);
  const ids = NODE_IDS_VOIX;
  assert.equal(g[ids.moteur]!.inputs.temperature, 1.1);
  assert.equal(g[ids.moteur]!.inputs.language, "English");
  assert.equal(g[ids.concepteur]!.inputs.voice_instruction, entree.instruction);
  assert.equal(g[ids.concepteur]!.inputs.reference_text, entree.texteReference);
  assert.equal(g[ids.concepteur]!.inputs.seed, 123456);
  assert.deepEqual(g[ids.concepteur]!.inputs.TTS_engine, ["1", 0], "le câblage du moteur est conservé");
  assert.equal(g[ids.sortie]!.class_type, "SaveAudioMP3");
  assert.deepEqual(g[ids.sortie]!.inputs.audio, workflow[ids.sortie]!.inputs.audio, "la sortie reste branchée sur la même source");
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, "audio/cadence_VOICE_maya");
  // Le graphe d'origine n'est pas modifié.
  assert.equal(workflow[ids.sortie]!.class_type, "PreviewAudio");
  assert.notEqual(workflow[ids.concepteur]!.inputs.reference_text, entree.texteReference);
});

test("créativité hors des bornes 0,8 à 1,2 : refus", () => {
  assert.throws(() => injecterGenerationVoix(workflow, { ...entree, temperature: 0.7 }), /hors limites/);
  assert.throws(() => injecterGenerationVoix(workflow, { ...entree, temperature: 1.3 }), /hors limites/);
  assert.doesNotThrow(() => injecterGenerationVoix(workflow, { ...entree, temperature: 0.8 }));
  assert.doesNotThrow(() => injecterGenerationVoix(workflow, { ...entree, temperature: 1.2 }));
});

test("un nœud absent est une erreur franche", () => {
  const casse = structuredClone(workflow);
  delete casse[NODE_IDS_VOIX.concepteur];
  assert.throws(() => injecterGenerationVoix(casse, entree), /introuvable/);
});

test("seed : jamais au-delà de la plage 32 bits du moteur vocal (sinon HTTP 400 de ComfyUI)", () => {
  const champ = (g: WorkflowJson) => Object.values(g).find((n) => n.class_type === "UnifiedVoiceDesignerNode" || n.class_type === "UnifiedTTSTextNode")!.inputs.seed as number;
  assert.equal(champ(injecterGenerationVoix(workflow, { ...entree, seed: "123456" })), 123456);
  assert.ok(champ(injecterGenerationVoix(workflow, { ...entree, seed: "281474976710655" })) <= 4294967295, "seed 48 bits d'une ancienne demande");
  assert.ok(champ(injecterGenerationVoix(workflow, { ...entree, seed: "4294967295" })) <= 4294967295);
});

test("langue : toujours un nom anglais du moteur, quelle que soit la valeur reçue", () => {
  const langue = (l: string) => injecterGenerationVoix(workflow, { ...entree, langue: l })[NODE_IDS_VOIX.moteur]!.inputs.language;
  assert.equal(langue("Français"), "French");
  assert.equal(langue("fr"), "French");
  assert.equal(langue("anglais"), "English");
  assert.equal(langue("English"), "English");
  assert.equal(langue("Auto"), "Auto");
  assert.equal(langue("klingon"), "Auto");
});
