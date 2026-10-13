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

test("controlerStructureScenario : l'état en fin de plan est exigé (renvoi au modèle sinon), aucune règle de disposition", async () => {
  const { controlerStructureScenario } = await import("./scenario-controles");
  const bon = { scenes: [{ titre: "S1", plans: [{ titre: "P1", description: "Elle attend.\n\nÉtat en fin de plan : Mai assise à gauche du feu, tournée vers lui ; feu allumé." }] }] };
  assert.deepEqual(controlerStructureScenario(bon), []);
  const mal = { scenes: [{ titre: "S1", plans: [{ titre: "P1", description: "Elle attend." }, { titre: "P2", description: "Elle part.\nEtat en fin de plan : seule." }] }] };
  const e = controlerStructureScenario(mal);
  assert.equal(e.length, 1);
  assert.match(e[0]!, /P1/);
  assert.match(e[0]!, /repères fixes/);
});
