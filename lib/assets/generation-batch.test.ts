import test from "node:test";
import assert from "node:assert/strict";
import { preparerLot, type AssetPourLot } from "./generation-batch";

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

test("preparerLot : écarte un asset sans prompt, un asset déjà en file", () => {
  const tous = [a(3, "CHAR_a", { promptGeneration: "  " }), a(4, "CHAR_b"), a(5, "CHAR_c")];
  const r = preparerLot(tous, tous, new Set([4]), 10);
  assert.deepEqual(r.aLancer.map((l) => l.code), ["CHAR_c"]);
  assert.deepEqual(r.ecartes.map((e) => e.code).sort(), ["CHAR_a", "CHAR_b"]);
});

test("preparerLot : la file pleine tronque le lot, avec la raison", () => {
  const tous = [a(1, "CHAR_a"), a(2, "CHAR_b"), a(3, "CHAR_c")];
  const r = preparerLot(tous, tous, new Set(), 2);
  assert.equal(r.aLancer.length, 2);
  assert.match(r.ecartes[0]!.raison, /file est pleine/);
});

test("preparerLot : l'état d'un personnage ou d'un décor part de son parent même sans méthode écrite (projet 259)", () => {
  // CHAR_la_danseuse_cendree had no method (null) and went out in text: it now waits for, then edits, its parent's image.
  const sansImage = [a(1, "CHAR_danseuse"), a(2, "CHAR_danseuse_cendree", { methodeGeneration: null, deriveDeId: 1 })];
  const r1 = preparerLot(sansImage, sansImage, new Set(), 10);
  assert.deepEqual(r1.aLancer.map((l) => l.code), ["CHAR_danseuse"]);
  assert.match(r1.ecartes[0]!.raison, /attend l'image de son master \(CHAR_danseuse\)/);
  const avecImage = [a(1, "CHAR_danseuse", { fichier: "CHAR_danseuse.png" }), a(2, "CHAR_danseuse_cendree", { methodeGeneration: "generation", deriveDeId: 1 })];
  const r2 = preparerLot([avecImage[1]!], avecImage, new Set(), 10);
  assert.deepEqual(r2.aLancer, [{ assetId: 2, code: "CHAR_danseuse_cendree", mode: "images", sourceAssetId: 1 }]);
  // A derived effect keeps its own method.
  const vfx = [a(3, "VFX_flammes", { type: "vfx", fichier: "VFX_flammes.png" }), a(4, "VFX_flammes_fortes", { type: "vfx", deriveDeId: 3 })];
  assert.equal(preparerLot([vfx[1]!], vfx, new Set(), 10).aLancer[0]!.mode, "texte");
});
