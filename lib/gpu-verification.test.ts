import assert from "node:assert/strict";
import { test } from "node:test";
import { analyserWorkflow, optionsDuChamp, type Graphe, type ObjectInfo } from "./gpu-verification";

const info: ObjectInfo = {
  UNETLoader: { input: { required: { unet_name: [["a.safetensors", "b.safetensors"]] } } },
  VAELoader: { input: { required: { vae_name: ["COMBO", { options: ["vae.safetensors"] }] } } },
  KSampler: { input: { required: { seed: ["INT", {}] } } },
};

test("optionsDuChamp lit les deux formats de champ à choix", () => {
  assert.deepEqual(optionsDuChamp([["x.pt", "y.pt"]]), ["x.pt", "y.pt"]);
  assert.deepEqual(optionsDuChamp(["COMBO", { options: ["z.pt"] }]), ["z.pt"]);
  assert.equal(optionsDuChamp(["INT", {}]), null);
  assert.equal(optionsDuChamp(undefined), null);
});

test("un workflow dont tout est présent est ok", () => {
  const g: Graphe = {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "a.safetensors" } },
    "2": { class_type: "VAELoader", inputs: { vae_name: "vae.safetensors" } },
    "3": { class_type: "KSampler", inputs: { seed: 42, model: ["1", 0] } },
  };
  assert.equal(analyserWorkflow("ok", g, info).ok, true);
});

test("signale les nodes absents (une fois chacun) et les fichiers de modèle absents", () => {
  const g: Graphe = {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "inconnu.safetensors" } },
    "2": { class_type: "NodeCustom", inputs: {} },
    "3": { class_type: "NodeCustom", inputs: {} },
  };
  const r = analyserWorkflow("ko", g, info);
  assert.equal(r.ok, false);
  assert.deepEqual(r.noeudsAbsents, ["NodeCustom"]);
  assert.deepEqual(r.fichiersAbsents, [{ classe: "UNETLoader", champ: "unet_name", valeur: "inconnu.safetensors" }]);
});

test("ignore les valeurs qui ne sont pas des fichiers de modèle", () => {
  const g: Graphe = { "1": { class_type: "KSampler", inputs: { sampler_name: "euler", seed: 1 } } };
  assert.equal(analyserWorkflow("x", g, info).ok, true);
});
