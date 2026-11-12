import test from "node:test";
import assert from "node:assert/strict";
import { avecUpscale, estFinalNatif, resolutionDepuis, resolutionOuDefaut } from "./resolution-video";

test("résolution : les trois valeurs proposées, tolérant le flottant de la base", () => {
  assert.equal(resolutionDepuis(0.2), 0.2);
  assert.equal(resolutionDepuis(0.20000000298023224), 0.2);
  assert.equal(resolutionDepuis("0.4"), 0.4);
  assert.equal(resolutionDepuis(0.35), null);
  assert.equal(resolutionDepuis(1), null);
  assert.equal(resolutionDepuis(undefined), null);
  assert.equal(resolutionOuDefaut(null), 0.2, "illisible : la base");
});

test("résolution : l'upscale n'existe qu'à la base, au-delà le rendu final est natif", () => {
  assert.equal(avecUpscale(true, 0.2), true);
  assert.equal(avecUpscale(true, 0.3), false);
  assert.equal(avecUpscale(false, 0.2), false, "une prévisualisation n'upscale pas");
  assert.equal(estFinalNatif(true, 0.4), true);
  assert.equal(estFinalNatif(true, 0.2), false);
  assert.equal(estFinalNatif(false, 0.4), false);
});
