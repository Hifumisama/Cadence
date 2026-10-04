import test from "node:test";
import assert from "node:assert/strict";
import { attenteDepassee, cleInjoignable, suivreInjoignable } from "./disponibilite";

test("suivreInjoignable : garde le premier instant d'indisponibilité, s'efface au retour", () => {
  assert.equal(suivreInjoignable(null, false, 1000), 1000);
  assert.equal(suivreInjoignable(1000, false, 5000), 1000);
  assert.equal(suivreInjoignable(1000, true, 5000), null);
  assert.equal(suivreInjoignable(null, true, 5000), null);
});

test("attenteDepassee : seulement quand injoignable depuis assez longtemps", () => {
  assert.equal(attenteDepassee(null, 10_000, 5_000), false);
  assert.equal(attenteDepassee(1_000, 5_999, 5_000), false);
  assert.equal(attenteDepassee(1_000, 6_000, 5_000), true);
  assert.equal(attenteDepassee(1_000, 999_999, 0), false); // 0 = on attend indéfiniment
});

test("cleInjoignable", () => {
  assert.equal(cleInjoignable("llm"), "injoignable_llm");
  assert.equal(cleInjoignable("comfyui"), "injoignable_comfyui");
});
