import test from "node:test";
import assert from "node:assert/strict";
import { ajusterDureesScene, nombreDeScenesVise, repartirDureesScenes, traitementDeScene } from "./traitement";

const somme = (l: number[]) => l.reduce((a, b) => a + b, 0);

test("scènes : une vingtaine de minutes demande une dizaine de scènes", () => {
  const { min, max } = nombreDeScenesVise(1200);
  assert.ok(min >= 8 && min <= 12, String(min));
  assert.ok(max >= 14 && max <= 20, String(max));
  assert.equal(nombreDeScenesVise(120).min, 3);
});

test("durées des scènes : la somme tombe exactement sur la durée de l'épisode, au prorata des poids", () => {
  const d = repartirDureesScenes([1, 2, 5, 2], 1200);
  assert.equal(somme(d), 1200);
  assert.ok(d[2]! > d[1]! && d[1]! > d[0]!);
  assert.equal(somme(repartirDureesScenes([1, 1, 1], 100)), 100);
});

test("durées des scènes : aucune scène sous un plan minimal, même avec un poids minuscule", () => {
  const d = repartirDureesScenes([1, 5, 5, 5], 40);
  assert.equal(somme(d), 40);
  assert.ok(d.every((x) => x >= 5));
  assert.deepEqual(repartirDureesScenes([], 100), []);
  // Une cible impossible (3 scènes, 9 s) est relevée au minimum.
  assert.equal(somme(repartirDureesScenes([1, 1, 1], 9)), 15);
});

test("ajustement d'une scène : dans la tolérance, les durées du modèle restent", () => {
  assert.deepEqual(ajusterDureesScene([10, 12, 8], 32), [10, 12, 8]);
  assert.deepEqual(ajusterDureesScene([10, 12, 8], 30), [10, 12, 8]);
});

test("ajustement d'une scène : trop long, on ramène à la cible, entiers de 5 à 15", () => {
  const r = ajusterDureesScene([15, 15, 15, 15], 40);
  assert.equal(somme(r), 40);
  assert.ok(r.every((x) => Number.isInteger(x) && x >= 5 && x <= 15));
});

test("ajustement d'une scène : trop court, on allonge sans dépasser 15 s", () => {
  const r = ajusterDureesScene([6, 6, 6], 45);
  assert.equal(somme(r), 45);
  assert.ok(r.every((x) => x <= 15));
  // Cible hors d'atteinte : on s'en approche autant que possible.
  assert.equal(somme(ajusterDureesScene([10, 10], 60)), 30);
});

test("ajustement d'une scène : la forme se conserve, le plus long reste le plus long", () => {
  const r = ajusterDureesScene([14, 6, 6], 40);
  assert.equal(somme(r), 40);
  assert.ok(r[0]! >= r[1]!);
});

test("traitement lu : forme exigée, texte nettoyé, durée entière", () => {
  assert.equal(traitementDeScene(null), null);
  assert.equal(traitementDeScene({ intention: "", dureeCibleSecondes: 60 }), null);
  assert.equal(traitementDeScene({ intention: "x", dureeCibleSecondes: 0 }), null);
  assert.deepEqual(traitementDeScene({ intention: " Elle part. ", etatEntree: "Au camp", etatSortie: "Sur la route", dureeCibleSecondes: 59.6 }), {
    intention: "Elle part.",
    etatEntree: "Au camp",
    etatSortie: "Sur la route",
    dureeCibleSecondes: 60,
    momentsDeLAuteur: "",
  });
});
