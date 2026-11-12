import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill, listerSkills } from "../llm/skills";
import { avertissementDuree, depuisScenarioEpisode, type EpisodeCourant, type SortieScenarioEpisode } from "./conversion";

test("les skills restent génériques : aucun nom du projet de test", () => {
  for (const nom of listerSkills()) {
    const s = chargerSkill(nom).systeme;
    assert.ok(!/avatar|katara|aang|sokka/i.test(s), `${nom} cite le projet de test`);
  }
});

test("les skills d'écriture du scénario ne demandent plus de genre de scène", () => {
  for (const nom of ["scenario-scene", "scenario-episode", "traitement-episode", "relecture-scenario"]) {
    const s = chargerSkill(nom);
    assert.ok(!/`genre`|scene\.genre|scene's genre/.test(s.systeme), `${nom} parle encore du genre de scène`);
    assert.ok(!JSON.stringify(s.schema).includes('"genre"'), `${nom} : le schéma de sortie porte encore un genre`);
  }
});

test("avertissementDuree : silencieux dans ±20 %, sinon une info chiffrée", () => {
  assert.equal(avertissementDuree(100, 120), null);
  assert.equal(avertissementDuree(120, 120), null);
  assert.equal(avertissementDuree(144, 120), null);
  assert.equal(avertissementDuree(120, null), null);
  const court = avertissementDuree(92, 120)!;
  assert.equal(court.type, "info");
  assert.match(court.texte, /92 s pour 120 s/);
  assert.match(court.texte, /−23 %/);
  assert.match(avertissementDuree(200, 120)!.texte, /\+67 %/);
});

const ep: EpisodeCourant = { id: 1, titre: "E", resume: "R", scenes: [], plans: [] };
// Une ancienne sortie peut encore porter un `genre` (propositions d'avant le 2026-11-09) : il est lu sans erreur, puis ignoré.
const sortie = {
  episode: { titre: "E", resume: "R" },
  scenes: [
    { titre: "S1", fonction: "f", genre: "montage", ambiance: "plein jour, ciel dégagé", plans: [{ titre: "P1", description: "d", dureeSecondes: 10 }] },
    { titre: "S2", fonction: "f", plans: [{ titre: "P2", description: "d", dureeSecondes: 10 }] },
  ],
  inventions: [],
  notes: "",
} as SortieScenarioEpisode;

test("depuisScenarioEpisode : l'ambiance passe à la création de scène ; un ancien genre est ignoré", () => {
  const c = depuisScenarioEpisode(sortie, ep, { dureeCibleSecondes: 60 });
  const scenes = c.filter((x) => x.cibleType === "scene");
  assert.equal((scenes[0]!.apres as Record<string, unknown>).ambiance, "plein jour, ciel dégagé");
  assert.equal("genre" in (scenes[0]!.apres as Record<string, unknown>), false);
  assert.equal("ambiance" in (scenes[1]!.apres as Record<string, unknown>), false);
});

test("depuisScenarioEpisode : l'écart de durée avec le brief est signalé sur le premier changement", () => {
  const avert = (cible: number | null) => depuisScenarioEpisode(sortie, ep, { dureeCibleSecondes: cible })[0]!.avertissements?.some((a) => /Durée totale/.test(a.texte)) ?? false;
  assert.equal(avert(120), true); // 20 s pour 120 s
  assert.equal(avert(20), false);
  assert.equal(avert(null), false);
});
