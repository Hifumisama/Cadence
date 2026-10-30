import assert from "node:assert/strict";
import { test } from "node:test";
import { continuiteEffective, etapesDuRendu, raccordImageARejouer, raisonSourceInvalide } from "./etapes-video";

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

test("continuité : une colonne vide avec un raccord enregistré est un raccord par image (rendus d'avant la colonne)", () => {
  assert.equal(continuiteEffective({ continuite: "latent", raccordJobId: 9 }), "latent");
  assert.equal(continuiteEffective({ continuite: "image", raccordJobId: 9 }), "image");
  assert.equal(continuiteEffective({ continuite: null, raccordJobId: 9 }), "image");
  assert.equal(continuiteEffective({ continuite: null, raccordJobId: null }), null);
});

test("l'upscale ne rejoue une image de raccord que si la prévisualisation en avait une", () => {
  assert.equal(raccordImageARejouer({ continuite: "image", raccordJobId: 9 }), 9);
  assert.equal(raccordImageARejouer({ continuite: "latent", raccordJobId: 9 }), null, "le contexte était un latent : pas d'image dans le conditioning");
  assert.equal(raccordImageARejouer({ continuite: null, raccordJobId: null }), null);
});
