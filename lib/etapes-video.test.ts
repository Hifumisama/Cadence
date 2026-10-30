import assert from "node:assert/strict";
import { test } from "node:test";
import { etapesDuRendu, raisonSourceInvalide } from "./etapes-video";

test("une prévisualisation est la génération seule", () => {
  assert.deepEqual(etapesDuRendu(false, true), ["generation"]);
  assert.deepEqual(etapesDuRendu(false, false), ["generation"]);
});

test("un rendu final part du latent s'il est valable, sinon il régénère d'abord", () => {
  assert.deepEqual(etapesDuRendu(true, true), ["upscale", "finition"]);
  assert.deepEqual(etapesDuRendu(true, false), ["generation", "upscale", "finition"]);
});

test("raisons pour lesquelles une prévisualisation ne sert pas de source", () => {
  const ok = { statut: "termine", latentDossier: "cadence_p1_r1" };
  assert.equal(raisonSourceInvalide(ok, false), null);
  assert.equal(raisonSourceInvalide(null, false), "pas_de_source");
  assert.equal(raisonSourceInvalide({ ...ok, statut: "en_cours" }, false), "pas_termine");
  assert.equal(raisonSourceInvalide({ ...ok, latentDossier: null }, false), "pas_de_latent");
  assert.equal(raisonSourceInvalide(ok, true), "fiche_modifiee");
});
