import test from "node:test";
import assert from "node:assert/strict";
import { BudgetContexte, contexteTotalDepuisEnv, estimerContexte } from "./budget-contexte";

test("budget : sans total, tout passe", () => {
  const b = new BudgetContexte(null);
  assert.ok(b.reserver(1, 50_000) && b.reserver(2, 50_000));
});

test("budget : un appel seul passe toujours, même démesuré", () => {
  const b = new BudgetContexte(10_000);
  assert.ok(b.reserver(1, 40_000));
  assert.equal(b.reserver(2, 100), false, "mais rien ne se joint à lui");
});

test("budget : un appel qui ne tient pas à côté des autres attend, et passe quand la place se libère", () => {
  const b = new BudgetContexte(30_000);
  assert.ok(b.reserver(1, 14_000));
  assert.ok(b.reserver(2, 14_000));
  assert.equal(b.reserver(3, 14_000), false);
  assert.equal(b.utilise(), 28_000);
  b.liberer(1, false);
  assert.ok(b.reserver(3, 14_000));
});

test("budget : de petits appels se cumulent jusqu'au total", () => {
  const b = new BudgetContexte(10_000);
  assert.ok(b.reserver(1, 4_000) && b.reserver(2, 4_000));
  assert.equal(b.reserver(3, 4_000), false);
  assert.ok(b.reserver(4, 2_000));
});

test("estimation : skill + entrée (4 caractères par jeton) + sortie attendue du skill", () => {
  assert.equal(estimerContexte("plan-h3", 8000, "x".repeat(4000)), 8000 + 1000 + 3500);
  assert.equal(estimerContexte("inconnu", 100, {}), 100 + 1 + 2000);
});

test("LLM_CONTEXTE_TOTAL : un nombre positif, sinon pas de limite", () => {
  assert.equal(contexteTotalDepuisEnv({ LLM_CONTEXTE_TOTAL: "65536" }), 65536);
  assert.equal(contexteTotalDepuisEnv({}), null);
  assert.equal(contexteTotalDepuisEnv({ LLM_CONTEXTE_TOTAL: "abc" }), null);
  assert.equal(contexteTotalDepuisEnv({ LLM_CONTEXTE_TOTAL: "0" }), null);
});

test("budget : un slot au repos garde le contexte de son dernier appel, donc on ne remplit pas tout à côté", () => {
  const b = new BudgetContexte(44_000, 3);
  assert.ok(b.reserver(1, 14_000));
  b.liberer(1); // slot au repos : 14 000 retenus
  assert.ok(b.reserver(2, 14_000));
  b.liberer(2);
  assert.ok(b.reserver(3, 14_000));
  b.liberer(3); // trois slots retiennent 14 000 chacun
  assert.ok(b.reserver(4, 14_000), "seul, il passe toujours");
  assert.equal(b.utilise(), 14_000 + 14_000 + 14_000, "lui plus deux retenus");
  assert.equal(b.reserver(5, 14_000), false, "un deuxième ne tient plus : 42 000 + 14 000 > 44 000");
  b.liberer(4);
  assert.ok(b.reserver(5, 14_000));
});

test("budget : un appel jamais parti ne laisse rien dans le cache", () => {
  const b = new BudgetContexte(20_000, 2);
  assert.ok(b.reserver(1, 9_000));
  b.liberer(1, false);
  assert.equal(b.utilise(), 0);
});
