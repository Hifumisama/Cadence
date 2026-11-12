import assert from "node:assert/strict";
import { test } from "node:test";
import { filtresUtiles, plageDeCodes } from "./registre-filtres";

const n = (nb: number, types: string[] = ["personnage"]) => Array.from({ length: nb }, (_, i) => ({ type: types[i % types.length]! }));

test("peu d'assets : aucun filtre", () => {
  assert.deepEqual(filtresUtiles(n(7, ["personnage", "decor"])), { recherche: false, types: false, avances: false });
});

test("à partir de 8 : recherche, et types s'il y en a au moins deux", () => {
  assert.deepEqual(filtresUtiles(n(8)), { recherche: true, types: false, avances: false });
  assert.deepEqual(filtresUtiles(n(8, ["personnage", "decor"])), { recherche: true, types: true, avances: false });
});

test("à partir de 16 : le bouton Filtres (statut, sans plan)", () => {
  assert.equal(filtresUtiles(n(15)).avances, false);
  assert.equal(filtresUtiles(n(16)).avances, true);
});

test("plage de sélection : bornes comprises, dans les deux sens, vide si une borne manque", () => {
  const codes = ["A", "B", "C", "D", "E"];
  assert.deepEqual(plageDeCodes(codes, "B", "D"), ["B", "C", "D"]);
  assert.deepEqual(plageDeCodes(codes, "D", "B"), ["B", "C", "D"]);
  assert.deepEqual(plageDeCodes(codes, "C", "C"), ["C"]);
  assert.deepEqual(plageDeCodes(codes, "B", "Z"), []);
});
