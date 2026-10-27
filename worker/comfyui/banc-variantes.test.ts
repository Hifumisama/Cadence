import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NODE_IDS } from "./mapping";
import { NOEUD_RTX, VARIANTES_BANC, VARIANTES_PAR_DEFAUT, codesAveugles, noeudsExecutes, preparerGrapheBanc, type Graphe, type VarianteBanc } from "./banc-variantes";

const workflow = JSON.parse(readFileSync("workflows/video-generation/VID_REF2VA.json", "utf-8")) as Graphe;
const v = (id: string): VarianteBanc => VARIANTES_BANC.find((x) => x.id === id)!;
const prep = (id: string) => preparerGrapheBanc(workflow, v(id), { dureeSecondes: 6, seed: "123456789" });
const UPSCALE = ["243", "244", "135:26", "189"];

test("banc : les variantes par défaut existent, et les identifiants sont uniques", () => {
  for (const id of VARIANTES_PAR_DEFAUT) assert.ok(v(id), id);
  assert.equal(new Set(VARIANTES_BANC.map((x) => x.id)).size, VARIANTES_BANC.length);
});

test("banc : durée, graine et résolution sont posées, le fichier source n'est pas modifié", () => {
  const g = prep("V3");
  assert.equal(g[NODE_IDS.dureeVideo]!.inputs.value, 6);
  assert.equal(g[NODE_IDS.resolution]!.inputs.megapixels, 0.4);
  assert.equal(g[NODE_IDS.seedPremierPass]!.inputs.seed, 123456789);
  assert.equal(g[NODE_IDS.seedSecondPass]!.inputs.noise_seed, 123456789);
  assert.ok(Math.abs((workflow[NODE_IDS.resolution]!.inputs.megapixels as number) - 0.2) < 0.001);
});

test("banc : V1 et V5 passent par l'upscale latent (V5 : à 0,3 MP, facteur 1,5) ; les autres, jamais", () => {
  const v1 = prep("V1");
  assert.equal(v1["243"]!.inputs["mode.scale"], 2);
  for (const id of UPSCALE) assert.ok(noeudsExecutes(v1).has(id), `V1 : ${id}`);
  const v5 = prep("V5");
  assert.equal(v5[NODE_IDS.resolution]!.inputs.megapixels, 0.3);
  assert.equal(v5["243"]!.inputs["mode.scale"], 1.5);
  for (const id of UPSCALE) assert.ok(noeudsExecutes(v5).has(id), `V5 : ${id}`);
  for (const id of ["V2", "V3", "V4", "V6", "S1", "S2", "A1"]) {
    const exe = noeudsExecutes(prep(id));
    for (const n of UPSCALE) assert.ok(!exe.has(n), `${id} : ${n} ne doit pas s'exécuter`);
    assert.ok(exe.has("165"), `${id} : interpolation`);
  }
});

test("banc : V4 monte les étapes et baisse la force du turbo", () => {
  const g = prep("V4");
  assert.equal(g["22:8"]!.inputs.value, 8);
  assert.equal((g["21"]!.inputs.lora_2 as { strength: number }).strength, 0.8);
  assert.equal((workflow["21"]!.inputs.lora_2 as { strength: number }).strength, 1, "le fichier source n'est pas modifié");
  assert.equal(workflow["22:8"]!.inputs.value, 6);
});

test("banc : les variantes d'échantillonneur et de décalage audio ne changent que cela", () => {
  assert.equal(prep("S1")["22:6"]!.inputs.sampler_name, "euler");
  assert.equal(prep("S1")["22:7"]!.inputs.scheduler, workflow["22:7"]!.inputs.scheduler);
  const s2 = prep("S2");
  assert.equal(s2["22:6"]!.inputs.sampler_name, "res_multistep");
  assert.equal(s2["22:7"]!.inputs.scheduler, "simple");
  assert.equal(prep("A1")["195"]!.inputs.shift_audio, 3);
  assert.equal(prep("V3")["195"]!.inputs.shift_audio, workflow["195"]!.inputs.shift_audio);
});

test("banc : V6 insère l'agrandissement par pixels entre l'interpolation et la sortie", () => {
  const g = prep("V6");
  assert.equal(g[NOEUD_RTX]!.class_type, "RTXVideoSuperResolution");
  assert.deepEqual(g[NOEUD_RTX]!.inputs.images, [NODE_IDS.upscaleImages, 0]);
  assert.equal(g[NOEUD_RTX]!.inputs["resize_type.scale"], 2);
  assert.deepEqual(g[NODE_IDS.sortieFinale]!.inputs.images, [NOEUD_RTX, 0]);
  assert.ok(noeudsExecutes(g).has(NOEUD_RTX));
  assert.equal(prep("V3")[NOEUD_RTX], undefined);
});

test("banc : tous les liens de chaque variante pointent un nœud qui existe", () => {
  for (const x of VARIANTES_BANC) {
    const g = prep(x.id);
    for (const [id, n] of Object.entries(g)) {
      for (const val of Object.values(n.inputs)) {
        if (Array.isArray(val) && val.length === 2 && typeof val[0] === "string" && typeof val[1] === "number") assert.ok(g[val[0]], `${x.id} : nœud ${id} → ${val[0]} introuvable`);
      }
    }
  }
});

test("banc : un nœud absent du workflow donne une erreur claire, pas un réglage silencieusement perdu", () => {
  const sans = structuredClone(workflow) as Graphe;
  delete sans["22:8"];
  assert.throws(() => preparerGrapheBanc(sans, v("V4"), { dureeSecondes: 5 }), /22:8/);
});

test("banc : les codes aveugles sont une permutation de lettres, stable pour une graine", () => {
  const ids = ["V1", "V2", "V3", "V4"];
  const c = codesAveugles(ids, 7);
  assert.deepEqual(Object.values(c).sort(), ["A", "B", "C", "D"]);
  assert.deepEqual(codesAveugles(ids, 7), c);
  assert.notDeepEqual(codesAveugles(ids, 8), c);
});
