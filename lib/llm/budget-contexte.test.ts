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
  b.liberer(1);
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
