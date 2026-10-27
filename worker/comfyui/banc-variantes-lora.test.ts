import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NOEUD_SIGMAS, VARIANTES_BANC, noeudsExecutes, preparerGrapheBanc, type Graphe } from "./banc-variantes";

const workflow = JSON.parse(readFileSync("workflows/video-generation/VID_REF2VA.json", "utf-8")) as Graphe;
const v = (id: string) => VARIANTES_BANC.find((x) => x.id === id)!;
const prep = (id: string) => preparerGrapheBanc(workflow, v(id), { dureeSecondes: 6, seed: "123456789" });

test("banc : les variantes de LoRA changent le fichier, la force et l'échantillonneur, et rien d'autre", () => {
  const l1 = prep("L1");
  const lora1 = l1["21"]!.inputs.lora_2 as { on: boolean; lora: string; strength: number };
  assert.equal(lora1.lora, "minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors");
  assert.equal(lora1.on, true);
  assert.equal(lora1.strength, 1);
  assert.equal(l1["22:8"]!.inputs.value, 4);
  assert.equal(l1["22:6"]!.inputs.sampler_name, workflow["22:6"]!.inputs.sampler_name, "L1 garde notre échantillonneur");

  const l2 = prep("L2");
  assert.equal(l2["22:8"]!.inputs.value, 8);
  assert.equal(l2["22:6"]!.inputs.sampler_name, "euler");
  assert.equal(l2["22:7"]!.inputs.scheduler, workflow["22:7"]!.inputs.scheduler);
  assert.equal((workflow["21"]!.inputs.lora_2 as { lora: string }).lora, "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors", "le fichier source n'est pas modifié");
});

test("banc : HyperFlow impose sa grille de sigmas fixe à l'échantillonneur principal, pas aux autres variantes", () => {
  const h1 = prep("H1");
  assert.equal(h1[NOEUD_SIGMAS]!.class_type, "ManualSigmas");
  assert.equal(h1[NOEUD_SIGMAS]!.inputs.sigmas, "1.0, 0.931506, 0.839236, 0.703462, 0.5, 0.296538, 0.160764, 0.068494, 0.0");
  assert.deepEqual(h1["125:12"]!.inputs.sigmas, [NOEUD_SIGMAS, 0]);
  assert.equal(h1["195"]!.inputs.shift_audio, 3);
  assert.equal(h1["22:6"]!.inputs.sampler_name, "euler");
  assert.deepEqual(prep("V3")["125:12"]!.inputs.sigmas, ["22:7", 0], "les autres variantes gardent le planificateur");
  assert.equal(prep("V3")[NOEUD_SIGMAS], undefined);
  assert.ok(noeudsExecutes(h1).has(NOEUD_SIGMAS));
});

test("banc : le prompt fourni remplace celui du fichier, et K2 ne change que la formule de coupe", () => {
  const prompt = "[Shot 1] A wide shot.\n[Shot 2] At 00:03.000, Hard cut to a close-up.\n[Shot 3] At 00:06.000, Hard cut to a low shot.";
  const k1 = preparerGrapheBanc(workflow, v("K1"), { dureeSecondes: 6, prompt });
  assert.equal(k1["22:11"]!.inputs.value, prompt);
  const k2 = preparerGrapheBanc(workflow, v("K2"), { dureeSecondes: 6, prompt });
  assert.equal(k2["22:11"]!.inputs.value, "[Shot 1] A wide shot.\n[Shot 2] At 00:03.000, the camera cuts to a close-up.\n[Shot 3] At 00:06.000, the camera cuts to a low shot.");
  assert.equal(prep("V3")["22:11"]!.inputs.value, workflow["22:11"]!.inputs.value, "sans prompt ni remplacement, le prompt du fichier reste");
});

test("banc : chaque variante de LoRA nomme sa source, pour le message quand le fichier manque", () => {
  for (const x of VARIANTES_BANC.filter((y) => y.lora)) assert.ok(x.loraSource, x.id);
});
