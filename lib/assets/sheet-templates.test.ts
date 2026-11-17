import assert from "node:assert/strict";
import { test } from "node:test";
import { GABARIT_PERSONNAGE, avecGabarit, repereDuDetail, sansGabarit } from "./sheet-templates";

// Real prompts of project 259 (2026-11-17).
const DANSEUSE_SANS_GABARIT =
  "A young woman in her early twenties, a slender and supple silhouette with a tall, graceful build and pale, fair skin. Her long dark hair is loose and flowing. She wears a very light, form-fitting dance dress made of sheer, vibrant red tulle.";
const CENDREE_AVEC_GABARIT =
  "A young woman in her early twenties. She wears a structured, draped gown of deep black fabric. A character turnaround sheet on a plain light background, showing four views: front full-body view, body side view, body back view, and a detailed single headshot portrait on the right side of the image, in the foreground.";
const THEATRE =
  "An intimate circular performance stage with a raised velvet-floored dais, bathed in soft, warm golden light. The space has 3 views: a wide establishing view at eye level, a reverse view from the opposite side, and a close-up detail of the carved wooden stage edge and the layered velvet drapes.";

const compte = (texte: string, motif: RegExp) => (texte.match(motif) ?? []).length;

test("gabarit personnage : ajouté quand le modèle l'a oublié (l'héroïne du 259)", () => {
  const p = avecGabarit(DANSEUSE_SANS_GABARIT, "personnage", "generation");
  assert.ok(p.startsWith("A young woman"));
  assert.ok(p.endsWith(GABARIT_PERSONNAGE));
});

test("gabarit personnage : celui du modèle est remplacé, jamais doublé", () => {
  const p = avecGabarit(CENDREE_AVEC_GABARIT, "personnage", "generation");
  assert.equal(compte(p, /4 views|four views/gi), 1);
  assert.doesNotMatch(p, /turnaround/i);
  assert.match(p, /structured, draped gown/);
});

test("gabarit décor : disposition fixe, repère du modèle conservé", () => {
  assert.equal(repereDuDetail(THEATRE), "the carved wooden stage edge and the layered velvet drapes");
  const p = avecGabarit(THEATRE, "decor", "generation");
  assert.equal(compte(p, /3 views/g), 1);
  assert.match(p, /fixed layout/);
  assert.match(p, /top half/);
  assert.match(p, /close-up detail of the carved wooden stage edge and the layered velvet drapes\.$/);
  assert.match(p, /^An intimate circular performance stage/);
});

test("gabarit décor : la phrase « Close-up detail of … » du skill donne le repère, sans doublon", () => {
  const p = avecGabarit("A round theatre stage under a warm spotlight. Close-up detail of the round red carpet.", "decor", "generation");
  assert.equal(compte(p, /close-up detail of/gi), 1);
  assert.match(p, /^A round theatre stage under a warm spotlight\. The place has 3 views/);
  assert.match(p, /close-up detail of the round red carpet\.$/);
});

test("gabarit décor : repère par défaut quand le modèle n'en a pas écrit", () => {
  const p = avecGabarit("A stone hall lit by green fire.", "decor", "generation");
  assert.match(p, /close-up detail of one architectural or natural landmark of the place\.$/);
});

test("édition : prompt inchangé (l'image 1 porte la disposition ; un recadrage reste un recadrage)", () => {
  const edit = "Preserve the exact architecture of image 1.\nChange the lighting to a green glow.";
  assert.equal(avecGabarit(edit, "decor", "edition"), edit);
  assert.equal(avecGabarit("Crop tighter.", "personnage", "edition"), "Crop tighter.");
});

test("accessoire, effet : prompt inchangé", () => {
  const vfx = "Pale translucent green flames rising from a small white-hot core.";
  assert.equal(avecGabarit(vfx, "vfx", "generation"), vfx);
  assert.equal(avecGabarit(vfx, "prop", "generation"), vfx);
});

test("sansGabarit : ne retire que les phrases de gabarit", () => {
  assert.equal(sansGabarit("A hall. The space has 3 views: wide. Warm light."), "A hall. Warm light.");
});
