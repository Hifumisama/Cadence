import test from "node:test";
import assert from "node:assert/strict";
import { ESSAIS_MAX_PAR_SCENE, origineDeScene, prochaineScene } from "./fiches-fond";
import type { PlanPourFiche } from "./types";

let n = 0;
const plan = (over: Partial<PlanPourFiche> = {}): PlanPourFiche => ({
  uuid: `p${++n}`,
  titre: "Plan",
  rang: n,
  episodeId: 1,
  episodeLibelle: "Épisode 1 · Pilote",
  sceneId: 10,
  sceneTitre: "Scène",
  dureeSecondes: 8,
  aDesSections: false,
  nbRefs: 0,
  aUnRendu: false,
  sansIntention: false,
  ...over,
});

test("fiches en fond : la première scène qui a des plans sans fiche, dans l'ordre du film", () => {
  const plans = [plan({ sceneId: 10, aDesSections: true }), plan({ sceneId: 10, aDesSections: true }), plan({ sceneId: 11 }), plan({ sceneId: 11 }), plan({ sceneId: 12 })];
  const s = prochaineScene(plans);
  assert.equal(s?.sceneId, 11);
  assert.deepEqual(s?.planUuids, [plans[2]!.uuid, plans[3]!.uuid]);
});

test("fiches en fond : seuls les plans sans fiche de la scène partent, un plan sans intention est laissé", () => {
  const plans = [plan({ aDesSections: true }), plan(), plan({ sansIntention: true })];
  assert.deepEqual(prochaineScene(plans)?.planUuids, [plans[1]!.uuid]);
});

test("fiches en fond : rien à écrire quand tout est fait", () => {
  assert.equal(prochaineScene([plan({ aDesSections: true }), plan({ sansIntention: true })]), null);
  assert.equal(prochaineScene([]), null);
});

test("fiches en fond : une scène revenue en deux blocs de même épisode reste distincte, et un autre épisode aussi", () => {
  const plans = [plan({ episodeId: 1, sceneId: 10, aDesSections: true }), plan({ episodeId: 2, sceneId: 10 })];
  assert.equal(prochaineScene(plans)?.episodeId, 2);
});

test("fiches en fond : une scène qui a épuisé ses essais est sautée, la suivante part", () => {
  const plans = [plan({ sceneId: 10 }), plan({ sceneId: 11 })];
  const essais = new Map([[origineDeScene(10), ESSAIS_MAX_PAR_SCENE]]);
  assert.equal(prochaineScene(plans, essais)?.sceneId, 11);
  assert.equal(prochaineScene(plans, new Map([[origineDeScene(10), ESSAIS_MAX_PAR_SCENE - 1]]))?.sceneId, 10);
});

test("fiches en fond : les plans sans scène forment un bloc, d'origine « fond:0 »", () => {
  const plans = [plan({ sceneId: null }), plan({ sceneId: null })];
  const s = prochaineScene(plans);
  assert.equal(s?.sceneId, null);
  assert.equal(s?.planUuids.length, 2);
  assert.equal(origineDeScene(null), "fond:0");
});
