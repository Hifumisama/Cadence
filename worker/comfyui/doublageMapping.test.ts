import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { NODE_IDS_DOUBLAGE, injecterDoublage } from "./doublageMapping";
import type { WorkflowJson } from "./imageMapping";

// Lit le VRAI workflow : si un ré-export change un identifiant, ce test casse au lieu de laisser le worker soumettre un graphe faux.
const workflow = JSON.parse(readFileSync(resolve(process.cwd(), "workflows/audio/VOX_Doublage_voix_API_Mode.json"), "utf8")) as WorkflowJson;

const entree = { priseDistante: "cadence_doublage_abc.wav", referenceDistante: "cadence_voixref_VOICE_maya_1.flac", prefixeSortie: "audio/cadence_doublage_42" };

test("les nœuds du contrat existent dans VOX_Doublage_voix_API_Mode.json", () => {
  const ids = NODE_IDS_DOUBLAGE;
  for (const id of Object.values(ids)) assert.ok(workflow[id], `nœud ${id} absent du workflow`);
  assert.equal(workflow[ids.changeur]!.class_type, "UnifiedVoiceChangerNode");
  assert.equal(workflow[ids.prise]!.class_type, "LoadAudio");
  assert.equal(workflow[ids.reference]!.class_type, "LoadAudio");
  assert.equal(workflow[ids.sortie]!.class_type, "PreviewAudio");
  // La voix cible vient d'un chargeur ordinaire, pas de CharacterVoicesNode.
  assert.ok(!Object.values(workflow).some((n) => n.class_type === "CharacterVoicesNode"));
  assert.deepEqual(workflow[ids.changeur]!.inputs.source_audio, [ids.prise, 0]);
  assert.deepEqual(workflow[ids.changeur]!.inputs.narrator_target, [ids.reference, 0]);
});

test("injection : la prise, la référence ; la sortie devient un SaveAudio", () => {
  const g = injecterDoublage(workflow, entree);
  const ids = NODE_IDS_DOUBLAGE;
  assert.equal(g[ids.prise]!.inputs.audio, entree.priseDistante);
  assert.equal(g[ids.reference]!.inputs.audio, entree.referenceDistante);
  assert.equal(g[ids.sortie]!.class_type, "SaveAudio");
  assert.deepEqual(g[ids.sortie]!.inputs.audio, workflow[ids.sortie]!.inputs.audio, "la sortie reste branchée sur la même source");
  assert.equal(g[ids.sortie]!.inputs.filename_prefix, entree.prefixeSortie);
  // Le graphe d'origine n'est pas modifié.
  assert.equal(workflow[ids.sortie]!.class_type, "PreviewAudio");
  assert.notEqual(workflow[ids.prise]!.inputs.audio, entree.priseDistante);
});

test("un nœud absent est une erreur franche", () => {
  const casse = structuredClone(workflow);
  delete casse[NODE_IDS_DOUBLAGE.reference];
  assert.throws(() => injecterDoublage(casse, entree), /introuvable/);
});
