import assert from "node:assert/strict";
import { test } from "node:test";
import { ASPECTS, ASPECTS_COMFYUI, estAspect, formatParDefaut, loraParDefaut, nouvelleSeed, raisonNonGenerable } from "./asset-generation";

test("format par défaut : décor en 16:9, le reste en carré", () => {
  assert.deepEqual(formatParDefaut("decor"), { aspect: "16:9", megapixels: 1.3 });
  assert.deepEqual(formatParDefaut("personnage"), { aspect: "1:1", megapixels: 1 });
  assert.ok(ASPECTS.every((a) => estAspect(a) && ASPECTS_COMFYUI[a].startsWith(a)));
  assert.ok(!estAspect("5:4"));
});

test("LoRA de fiche personnage : personnages seulement", () => {
  assert.equal(loraParDefaut("personnage"), true);
  assert.equal(loraParDefaut("decor"), false);
});

test("génération impossible : voix, édition, prompt vide", () => {
  const ok = { type: "decor", promptGeneration: "A hall", methodeGeneration: null };
  assert.equal(raisonNonGenerable(ok), null);
  assert.equal(raisonNonGenerable({ ...ok, methodeGeneration: "generation" }), null);
  assert.match(raisonNonGenerable({ ...ok, type: "voix" }) ?? "", /casting vocal/);
  assert.match(raisonNonGenerable({ ...ok, methodeGeneration: "edition" }) ?? "", /pas encore branchée/);
  assert.match(raisonNonGenerable({ ...ok, promptGeneration: "  " }) ?? "", /prompt/);
});

test("seed : entier positif sûr", () => {
  const s = Number(nouvelleSeed());
  assert.ok(Number.isSafeInteger(s) && s >= 0);
});
