import assert from "node:assert/strict";
import { test } from "node:test";
import { AIDE_TEMPS_FORT, CREATIVITES, CREATIVITE_PAR_DEFAUT, CREATIVITE_TEMPS_FORT, creativiteDuPlan, estCreativite, estTempsFort, valeurTempsFort } from "./settings";

test("créativité : deux valeurs seulement, équilibrée par défaut, « extreme » = temps fort", () => {
  assert.deepEqual([...CREATIVITES], ["balanced", "extreme"]);
  assert.equal(CREATIVITE_PAR_DEFAUT, "balanced");
  assert.equal(CREATIVITE_TEMPS_FORT, "extreme");
  for (const v of ["balanced", "extreme"]) assert.ok(estCreativite(v), v);
  // « restrained » and « bold » were retired (ADR 0001): they are no longer valid values.
  for (const v of ["restrained", "bold", "folle", "", null, undefined, 3]) assert.equal(estCreativite(v), false, String(v));
});

test("temps fort : seul « extreme » en est un, tout le reste se compile en « balanced »", () => {
  assert.equal(estTempsFort("extreme"), true);
  for (const v of ["balanced", "restrained", "bold", "", null, undefined]) assert.equal(estTempsFort(v), false, String(v));
  assert.equal(creativiteDuPlan("extreme"), "extreme");
  for (const v of ["balanced", "restrained", "bold", "n'importe quoi", null, undefined]) assert.equal(creativiteDuPlan(v), "balanced", String(v));
});

test("valeurTempsFort : ce que le plan stocke (« extreme » ou null)", () => {
  assert.equal(valeurTempsFort(true), "extreme");
  assert.equal(valeurTempsFort(false), null);
  assert.equal(estTempsFort(valeurTempsFort(true)), true);
  assert.equal(estTempsFort(valeurTempsFort(false)), false);
});

test("l'aide du temps fort dit ce qu'il fait et pour quels plans", () => {
  assert.match(AIDE_TEMPS_FORT, /maximum/);
  assert.match(AIDE_TEMPS_FORT, /plans les plus forts/);
});
