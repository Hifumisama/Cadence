import test from "node:test";
import assert from "node:assert/strict";
import { preparerLot, selectionParDefaut, type AssetPourLot } from "./generation-lot";

const a = (id: number, code: string, over: Partial<AssetPourLot> = {}): AssetPourLot => ({
  id,
  code,
  type: "personnage",
  promptGeneration: "un prompt",
  methodeGeneration: "generation",
  fichier: null,
  deriveDeId: null,
  ...over,
});

test("preparerLot : texte pour les masters, édition pour un dérivé dont le master a déjà son image", () => {
  const tous = [a(1, "CHAR_iris", { fichier: "CHAR_iris.png" }), a(2, "CHAR_iris_blessee", { methodeGeneration: "edition", deriveDeId: 1 }), a(3, "DEC_phare", { type: "decor" })];
  const r = preparerLot(tous, tous, new Set(), 10);
  assert.deepEqual(r.aLancer.map((l) => `${l.code}:${l.mode}:${l.sourceAssetId ?? "-"}`), ["CHAR_iris:texte:-", "DEC_phare:texte:-", "CHAR_iris_blessee:images:1"]);
  assert.deepEqual(r.ecartes, []);
});

test("preparerLot : la 2e vague — un dérivé en édition dont le master n'a pas d'image attend", () => {
  const tous = [a(1, "DEC_phare", { type: "decor" }), a(2, "DEC_phare_nuit", { type: "decor", methodeGeneration: "edition", deriveDeId: 1 })];
  const r = preparerLot(tous, tous, new Set(), 10);
  assert.deepEqual(r.aLancer.map((l) => l.code), ["DEC_phare"]);
  assert.match(r.ecartes[0]!.raison, /attend l'image de son master \(DEC_phare\)/);
});

test("preparerLot : écarte une voix, un son, un asset sans prompt, un asset déjà en file", () => {
  const tous = [a(1, "VOICE_x", { type: "voix" }), a(2, "SFX_x", { type: "sfx" }), a(3, "CHAR_a", { promptGeneration: "  " }), a(4, "CHAR_b"), a(5, "CHAR_c")];
  const r = preparerLot(tous, tous, new Set([4]), 10);
  assert.deepEqual(r.aLancer.map((l) => l.code), ["CHAR_c"]);
  assert.deepEqual(r.ecartes.map((e) => e.code).sort(), ["CHAR_a", "CHAR_b", "SFX_x", "VOICE_x"]);
});

test("preparerLot : la file pleine tronque le lot, avec la raison", () => {
  const tous = [a(1, "CHAR_a"), a(2, "CHAR_b"), a(3, "CHAR_c")];
  const r = preparerLot(tous, tous, new Set(), 2);
  assert.equal(r.aLancer.length, 2);
  assert.match(r.ecartes[0]!.raison, /file est pleine/);
});

test("selectionParDefaut : ce qui n'a pas encore d'image et peut partir", () => {
  const tous = [a(1, "CHAR_a", { fichier: "x.png" }), a(2, "CHAR_b"), a(3, "CHAR_c", { promptGeneration: null })];
  assert.deepEqual(selectionParDefaut(preparerLot(tous, tous, new Set(), 10), tous), [2]);
});
