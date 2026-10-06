import { test } from "node:test";
import assert from "node:assert/strict";
import { comparerRapports, mesurerEpisode, mesurerFiches, repetitions, similarite, type RapportRejeu } from "./rejeu-mesures";

const plan = (titre: string, scene: string, dureeSecondes: number, description: string) => ({ titre, scene, dureeSecondes, description });

test("similarité : mêmes mots = 1, rien en commun = 0, accents ignorés", () => {
  assert.equal(similarite("Théo traverse la rue", "Theo traverse la rue"), 1);
  assert.equal(similarite("un chat dort", "des voitures klaxonnent"), 0);
});

test("répétitions : une action décrite deux fois est relevée", () => {
  const r = repetitions([
    plan("A", "s1", 10, "Théo traverse la rue en courant vers la vieille dame sur le passage piéton"),
    plan("B", "s1", 10, "Théo traverse la rue en courant vers la vieille dame sur le passage piéton, cette fois de dos"),
    plan("C", "s2", 10, "Un bus freine brusquement au carrefour"),
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0]!.a, r[0]!.b], ["A", "B"]);
});

test("épisode : durée, écart, plans courts et plans fusionnables", () => {
  const m = mesurerEpisode(
    "Ep 1",
    [plan("A", "s1", 4, "x"), plan("B", "s1", 8, "y"), plan("C", "s2", 12, "z"), plan("D", "s2", 10, "w")],
    60,
  );
  assert.equal(m.totalSecondes, 34);
  assert.equal(m.ecartPct, -43);
  assert.equal(m.sousCinq, 1);
  assert.equal(m.fusionnables, 1); // A+B = 12 s dans la même scène ; C+D = 22 s : non
  assert.equal(m.moyenneSecondes, 8.5);
  assert.equal(m.minSecondes, 4);
  assert.equal(m.maxSecondes, 12);
});

test("épisode vide ou sans cible : pas de division par zéro", () => {
  const m = mesurerEpisode("Ep", [], null);
  assert.equal(m.nbPlans, 0);
  assert.equal(m.ecartPct, null);
  assert.equal(m.moyenneSecondes, 0);
});

test("fiches : caméra et lumière détectées", () => {
  const f = mesurerFiches(["Slow dolly in on Théo, golden hour light", "Théo marche.", "Gros plan sur les mains"]);
  assert.deepEqual(f, { nbFiches: 3, avecCamera: 2, avecLumiere: 1 });
});

test("comparaison : signale les skills modifiés et l'évolution des durées", () => {
  const base = (total: number, empreinte: string): RapportRejeu => ({
    fiche: "f",
    date: "2026-10-07",
    git: { sha: "abc", modifie: false },
    modeles: ["m"],
    echangesUtilisateur: 4,
    empreintesSkills: { "scenario-episode": empreinte },
    dureeRejeuSecondes: 100,
    etapeAtteinte: "scenarios",
    episodes: [mesurerEpisode("Ep 1", [plan("A", "s", total, "x")], 60)],
    fiches: null,
    appels: [],
  });
  const l = comparerRapports(base(120, "aaa"), base(60, "bbb")).join("\n");
  assert.match(l, /Skills modifiés : scenario-episode/);
  assert.match(l, /durée 120 → 60 s/);
});
