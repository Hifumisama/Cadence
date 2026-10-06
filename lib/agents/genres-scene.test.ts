import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill, listerSkills } from "../llm/skills";
import { GENRES_SCENE, genreOuNull, variantePlanH3 } from "../scene-genres";
import { avertissementDuree, depuisScenarioEpisode, type EpisodeCourant, type SortieScenarioEpisode } from "./conversion";

test("genreOuNull / variantePlanH3 : un genre connu, sinon « standard »", () => {
  assert.equal(genreOuNull("montage"), "montage");
  assert.equal(genreOuNull("n'importe quoi"), null);
  assert.equal(genreOuNull(null), null);
  assert.equal(variantePlanH3("action"), "action");
  assert.equal(variantePlanH3(null), "standard");
  assert.equal(variantePlanH3("inconnu"), "standard");
});

test("plan-h3 : la variante de genre ne charge que son guide ; « standard » aucun ; sans variante, tous", () => {
  const guides = (variante?: string) => chargerSkill("plan-h3", undefined, { variante }).fichiers.filter((f) => f.includes("guide-genre-")).map((f) => f.split("guide-genre-")[1]!.replace(".md", ""));
  assert.deepEqual(guides("montage"), ["montage"]);
  assert.deepEqual(guides("standard"), []);
  assert.deepEqual(guides(undefined).sort(), [...GENRES_SCENE].sort());
  // Chaque genre déclaré a bien son guide.
  for (const g of GENRES_SCENE) assert.deepEqual(guides(g), [g]);
});

test("les skills restent génériques : aucun nom du projet de test", () => {
  for (const nom of listerSkills()) {
    const s = chargerSkill(nom).systeme;
    assert.ok(!/avatar|katara|aang|sokka/i.test(s), `${nom} cite le projet de test`);
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
const sortie: SortieScenarioEpisode = {
  episode: { titre: "E", resume: "R" },
  scenes: [
    { titre: "S1", fonction: "f", genre: "montage", ambiance: "plein jour, ciel dégagé", plans: [{ titre: "P1", description: "d", dureeSecondes: 10, repliques: [] }] },
    { titre: "S2", fonction: "f", genre: "n'importe quoi", plans: [{ titre: "P2", description: "d", dureeSecondes: 10, repliques: [] }] },
  ],
  inventions: [],
  notes: "",
};

test("depuisScenarioEpisode : genre et ambiance passent à la création de scène ; un genre inconnu est ignoré", () => {
  const c = depuisScenarioEpisode(sortie, ep, { dureeCibleSecondes: 60 });
  const scenes = c.filter((x) => x.cibleType === "scene");
  assert.equal((scenes[0]!.apres as Record<string, unknown>).genre, "montage");
  assert.equal((scenes[0]!.apres as Record<string, unknown>).ambiance, "plein jour, ciel dégagé");
  assert.equal("genre" in (scenes[1]!.apres as Record<string, unknown>), false);
  assert.equal("ambiance" in (scenes[1]!.apres as Record<string, unknown>), false);
});

test("depuisScenarioEpisode : l'écart de durée avec le brief est signalé sur le premier changement", () => {
  const avert = (cible: number | null) => depuisScenarioEpisode(sortie, ep, { dureeCibleSecondes: cible })[0]!.avertissements?.some((a) => /Durée totale/.test(a.texte)) ?? false;
  assert.equal(avert(120), true); // 20 s pour 120 s
  assert.equal(avert(20), false);
  assert.equal(avert(null), false);
});
