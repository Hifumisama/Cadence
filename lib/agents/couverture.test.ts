import { test } from "node:test";
import assert from "node:assert/strict";
import { couvertureSuffisante, lireCouverture, manquesEssentiels, type Couverture } from "./couverture";

const complete: Couverture = { coeur: "dit", basculementFin: "dit", ton: "dit", reglesMonde: "inconnu", personnagesLieux: "deduit", styleRythme: "dit", dureeForme: "dit" };

test("couverture : l'essentiel dit suffit, le reste peut manquer", () => {
  assert.equal(couvertureSuffisante(complete), true);
  assert.deepEqual(manquesEssentiels(complete), []);
});

test("couverture : un essentiel seulement déduit ou inconnu bloque, avec son libellé", () => {
  const m = manquesEssentiels({ ...complete, ton: "deduit", dureeForme: "inconnu" });
  assert.equal(m.length, 2);
  assert.match(m.join(" "), /ton et le genre/);
  assert.match(m.join(" "), /durée/);
  assert.equal(couvertureSuffisante({ ...complete, ton: "deduit" }), false);
});

test("couverture : sans grille, tout l'essentiel manque", () => {
  assert.equal(manquesEssentiels(null).length, 5);
  assert.equal(couvertureSuffisante(null), false);
});

test("lireCouverture : forme invalide refusée", () => {
  assert.deepEqual(lireCouverture(complete), complete);
  assert.equal(lireCouverture({ ...complete, ton: "peut-être" }), null);
  assert.equal(lireCouverture({ coeur: "dit" }), null);
  assert.equal(lireCouverture("oui"), null);
  assert.equal(lireCouverture(null), null);
});
