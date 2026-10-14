import test from "node:test";
import assert from "node:assert/strict";
import type { AssetPourLot } from "./generation-lot";
import { estAIllustrer, etapesSuivantes, etatImages, idsSansImage, libelleGenererImages, phraseCompteImages, prochaineEtape } from "./images-projet";

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

test("estAIllustrer : les sons sont hors compte, le reste compte", () => {
  for (const t of ["personnage", "decor", "prop", "vfx", "keyframe", "oth"]) assert.equal(estAIllustrer({ type: t }), true, t);
  assert.equal(estAIllustrer({ type: "sfx" }), false);
});

test("etatImages : compte les images, ignore les sons", () => {
  const tous = [a(1, "MAYA", { fichier: "x.png" }), a(2, "CAFE", { type: "decor" }), a(3, "BIP", { type: "sfx" })];
  const e = etatImages(tous, new Set(), 10);
  assert.deepEqual(e, { total: 2, avecImage: 1, sansImage: 1, enFile: 0, aLancer: 1, attendentMaitre: 0, sansPrompt: 0 });
  assert.deepEqual(idsSansImage(tous), [2]);
});

test("etatImages : aucun asset à illustrer", () => {
  const e = etatImages([a(1, "BIP", { type: "sfx" })], new Set(), 10);
  assert.equal(e.total, 0);
  assert.equal(e.sansImage, 0);
});

test("etatImages : en file, sans prompt, dérivé en attente de son master", () => {
  const tous = [
    a(1, "MAYA"),
    a(2, "MAYA_NUIT", { deriveDeId: 1, methodeGeneration: "edition" }),
    a(3, "CAFE", { type: "decor", promptGeneration: "  " }),
    a(4, "LAMPE", { type: "prop" }),
  ];
  const e = etatImages(tous, new Set([4]), 10);
  assert.equal(e.sansImage, 4);
  assert.equal(e.enFile, 1);
  assert.equal(e.aLancer, 1); // MAYA seule : le dérivé attend, CAFE n'a pas de prompt, LAMPE est déjà en file
  assert.equal(e.attendentMaitre, 1);
  assert.equal(e.sansPrompt, 1);
});

test("etatImages : le dérivé part dès que son master a une image", () => {
  const tous = [a(1, "MAYA", { fichier: "m.png" }), a(2, "MAYA_NUIT", { deriveDeId: 1, methodeGeneration: "edition" })];
  const e = etatImages(tous, new Set(), 10);
  assert.equal(e.aLancer, 1);
  assert.equal(e.attendentMaitre, 0);
});

test("etatImages : la file pleine limite aLancer", () => {
  const tous = [a(1, "A"), a(2, "B"), a(3, "C")];
  assert.equal(etatImages(tous, new Set(), 2).aLancer, 2);
  assert.equal(etatImages(tous, new Set(), 0).aLancer, 0);
});

test("phrases et libellés", () => {
  const e = etatImages([a(1, "A"), a(2, "B")], new Set(), 10);
  assert.equal(phraseCompteImages(e), "2 assets décrits, 0 image générée");
  assert.equal(libelleGenererImages(1), "Générer l’image");
  assert.equal(libelleGenererImages(12), "Générer les 12 images");
});

test("prochaineEtape : la première non terminée, rien quand tout est fait", () => {
  const manque = etatImages([a(1, "A", { fichier: "a.png" }), a(2, "B")], new Set(), 10);
  const etape = prochaineEtape(etapesSuivantes(7, manque));
  assert.equal(etape?.cle, "images");
  assert.equal(etape?.href, "/p/7/assets");
  assert.equal(etape?.faites, 1);
  assert.equal(etape?.total, 2);
  const fini = etatImages([a(1, "A", { fichier: "a.png" })], new Set(), 10);
  assert.equal(prochaineEtape(etapesSuivantes(7, fini)), null);
  assert.equal(prochaineEtape(etapesSuivantes(7, etatImages([], new Set(), 10))), null);
});
