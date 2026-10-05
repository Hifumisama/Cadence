import assert from "node:assert/strict";
import { test } from "node:test";
import { TYPE_AFFICHE, cibleDeCodeAffiche, codeAffiche, formatAfficheParDefaut, promptAffiche } from "./affiches";

test("code d'affiche : un par projet, un par épisode, et on retrouve la cible", () => {
  assert.equal(codeAffiche("projects", 12), "AFFICHE_P12");
  assert.equal(codeAffiche("episodes", 7), "AFFICHE_E7");
  assert.equal(codeAffiche("seasons", 3), "AFFICHE_S3");
  assert.deepEqual(cibleDeCodeAffiche("AFFICHE_S3"), { cible: "seasons", id: 3 });
  assert.deepEqual(cibleDeCodeAffiche("AFFICHE_P12"), { cible: "projects", id: 12 });
  assert.deepEqual(cibleDeCodeAffiche("AFFICHE_E7"), { cible: "episodes", id: 7 });
});

test("un code de registre ordinaire n'est jamais pris pour une affiche", () => {
  for (const code of ["CHAR_maya", "DEC_auberge", "AFFICHE_X1", "AFFICHE_P", "AFFICHE_P12x", "affiche_p1", "XAFFICHE_P1"]) {
    assert.equal(cibleDeCodeAffiche(code), null, code);
  }
});

test("le type d'asset d'affiche ne collisionne avec aucun type du registre", () => {
  assert.equal(TYPE_AFFICHE, "affiche");
  assert.ok(!["personnage", "decor", "voix", "prop", "vfx", "sfx", "keyframe", "oth"].includes(TYPE_AFFICHE));
});

test("format par défaut : 2:3 pour toutes les affiches", () => {
  assert.equal(formatAfficheParDefaut().aspect, "2:3");
});

test("prompt d'affiche : cite le titre, le résumé et le ton, et interdit tout texte dans l'image", () => {
  const p = promptAffiche({ cible: "projects", titre: "La Nuit de Tanger", resume: "Une voleuse infiltre un riyad.", genreTon: "aventure légère" });
  assert.match(p, /"La Nuit de Tanger"/);
  assert.match(p, /Story: Une voleuse infiltre un riyad\./);
  assert.match(p, /Mood: aventure légère\./);
  assert.match(p, /Vertical poster composition/);
  assert.match(p, /No text, no lettering/);
});

test("prompt d'affiche : sans résumé ni ton, rien d'inventé ; un épisode reste une affiche verticale", () => {
  const p = promptAffiche({ cible: "episodes", titre: "Le sel", resume: "  ", genreTon: null });
  assert.doesNotMatch(p, /Story:/);
  assert.doesNotMatch(p, /Mood:/);
  assert.match(p, /Vertical poster composition/);
  assert.match(promptAffiche({ cible: "projects", titre: "   " }), /"an untitled story"/);
});
