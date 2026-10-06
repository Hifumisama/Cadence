import { test } from "node:test";
import assert from "node:assert/strict";
import { controlerDureeScenario, dureeTotaleScenario } from "./scenario-controles";

const scenes = (...durees: number[]) => ({ scenes: [{ plans: durees.map((d) => ({ dureeSecondes: d })) }] });

test("durée totale : somme des plans de toutes les scènes", () => {
  assert.deepEqual(dureeTotaleScenario({ scenes: [{ plans: [{ dureeSecondes: 10 }] }, { plans: [{ dureeSecondes: 8 }, { dureeSecondes: 12 }] }] }), { secondes: 30, nbPlans: 3 });
});

test("durée : dans la tolérance de ±20 %, aucune erreur", () => {
  assert.deepEqual(controlerDureeScenario(scenes(10, 10, 10, 10, 10, 10), 60), []);
  assert.deepEqual(controlerDureeScenario(scenes(10, 10, 10, 10, 10, 10, 10), 60), []); // 70 s = +17 %
});

test("durée : un total double de la cible est une erreur chiffrée", () => {
  const e = controlerDureeScenario(scenes(12, 12, 12, 12, 12, 12, 12, 12, 12, 12), 60);
  assert.equal(e.length, 1);
  assert.match(e[0]!, /10 plans font 120 s/);
  assert.match(e[0]!, /entre 48 et 72 s/);
  assert.match(e[0]!, /Trop long/);
});

test("durée : trop court", () => {
  const e = controlerDureeScenario(scenes(10, 10), 60);
  assert.match(e[0]!, /Trop court de 28 s/);
});

test("durée : pas de cible ou pas de plan, rien à contrôler", () => {
  assert.deepEqual(controlerDureeScenario(scenes(10), null), []);
  assert.deepEqual(controlerDureeScenario({ scenes: [] }, 60), []);
});
