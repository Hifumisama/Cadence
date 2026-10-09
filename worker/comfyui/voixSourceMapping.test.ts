import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { WorkflowJson } from "./imageMapping";
import { NODE_IDS_VOIX_SOURCE, extraireTranscription, injecterExtractionVoix } from "./voixSourceMapping";

// Lit le VRAI workflow : si un ré-export change un identifiant, ce test casse au lieu de laisser le worker soumettre un graphe faux.
const workflow = JSON.parse(readFileSync(resolve(process.cwd(), "workflows/audio/VOX_Get_Audio_and_ASR.json"), "utf8")) as WorkflowJson;

const entree = { fichierDistant: "cadence_source_abc.mp4", debut: 12, fin: 38, video: true, langue: "French", prefixeSortie: "audio/cadence_source_VOICE_maya" };

test("les nœuds du contrat existent dans VOX_Get_Audio_and_ASR.json", () => {
  const ids = NODE_IDS_VOIX_SOURCE;
  for (const id of Object.values(ids)) assert.ok(workflow[id], `nœud ${id} absent du workflow`);
  assert.equal(workflow[ids.audio]!.class_type, "LoadAudioUI");
  assert.equal(workflow[ids.video]!.class_type, "LoadVideoUI");
  assert.equal(workflow[ids.commutateur]!.class_type, "ComfySwitchNode");
  assert.equal(workflow[ids.asr]!.class_type, "UnifiedASRTranscribeNode");
  assert.equal(workflow[ids.sortieAudio]!.class_type, "SaveAudioAdvanced");
  assert.equal(workflow[ids.sortieTexte]!.class_type, "ShowText|pysssss");
  for (const champ of ["audio", "start_time", "end_time", "duration"]) assert.ok(champ in workflow[ids.audio]!.inputs, `chargeur audio : ${champ}`);
  for (const champ of ["video", "start_time", "end_time", "duration", "start_frame", "end_frame", "duration_frames", "frame_rate"]) {
    assert.ok(champ in workflow[ids.video]!.inputs, `chargeur vidéo : ${champ}`);
  }
  assert.ok("switch" in workflow[ids.commutateur]!.inputs);
  assert.ok("language" in workflow[ids.asr]!.inputs);
  assert.ok("filename_prefix" in workflow[ids.sortieAudio]!.inputs);
});

test("injection : le même fichier aux deux chargeurs, la fenêtre en secondes et en images, le commutateur, la langue", () => {
  const g = injecterExtractionVoix(workflow, entree);
  const ids = NODE_IDS_VOIX_SOURCE;
  assert.equal(g[ids.audio]!.inputs.audio, entree.fichierDistant);
  assert.equal(g[ids.video]!.inputs.video, entree.fichierDistant);
  for (const id of [ids.audio, ids.video]) {
    assert.equal(g[id]!.inputs.start_time, 12);
    assert.equal(g[id]!.inputs.end_time, 38);
    assert.equal(g[id]!.inputs.duration, 26);
  }
  // 24 i/s dans l'export : 12 s = image 288, 38 s = image 912.
  assert.equal(g[ids.video]!.inputs.start_frame, 288);
  assert.equal(g[ids.video]!.inputs.end_frame, 912);
  assert.equal(g[ids.video]!.inputs.duration_frames, 624);
  assert.equal(g[ids.commutateur]!.inputs.switch, true);
  assert.equal(g[ids.asr]!.inputs.language, "French");
  assert.equal(g[ids.sortieAudio]!.inputs.filename_prefix, "audio/cadence_source_VOICE_maya");
  assert.deepEqual(g[ids.asr]!.inputs.audio, workflow[ids.asr]!.inputs.audio, "le câblage est conservé");
  // Le graphe d'origine n'est pas modifié.
  assert.notEqual(workflow[ids.audio]!.inputs.audio, entree.fichierDistant);
});

test("un audio : le commutateur reste sur la branche audio", () => {
  assert.equal(injecterExtractionVoix(workflow, { ...entree, video: false })[NODE_IDS_VOIX_SOURCE.commutateur]!.inputs.switch, false);
});

test("le nœud d'affichage ne garde que son câblage (pas l'exemple de transcription de l'export)", () => {
  const g = injecterExtractionVoix(workflow, entree);
  assert.deepEqual(Object.keys(g[NODE_IDS_VOIX_SOURCE.sortieTexte]!.inputs), ["text"]);
  assert.deepEqual(g[NODE_IDS_VOIX_SOURCE.sortieTexte]!.inputs.text, workflow[NODE_IDS_VOIX_SOURCE.sortieTexte]!.inputs.text);
});

test("fenêtre : jamais plus de 30 secondes", () => {
  assert.throws(() => injecterExtractionVoix(workflow, { ...entree, debut: 0, fin: 45 }), /30 secondes au maximum/);
  assert.throws(() => injecterExtractionVoix(workflow, { ...entree, debut: 5, fin: 5.5 }), /au moins/);
  assert.doesNotThrow(() => injecterExtractionVoix(workflow, { ...entree, debut: 0, fin: 30 }));
});

test("un nœud absent est une erreur franche", () => {
  const casse = structuredClone(workflow);
  delete casse[NODE_IDS_VOIX_SOURCE.asr];
  assert.throws(() => injecterExtractionVoix(casse, entree), /introuvable/);
});

test("transcription : le champ text du JSON de l'ASR, sinon le texte brut", () => {
  assert.equal(extraireTranscription('{"text": "debout mes trésors, la vie est belle", "language": "French", "segments": []}'), "debout mes trésors, la vie est belle");
  assert.equal(extraireTranscription("  Bonjour\n  tout le monde "), "Bonjour tout le monde");
  assert.equal(extraireTranscription(""), "");
  assert.equal(extraireTranscription('{"language": "French"}'), '{"language": "French"}'); // JSON sans texte : rendu tel quel, à corriger à la main
});
