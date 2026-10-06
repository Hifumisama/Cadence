import assert from "node:assert/strict";
import { test } from "node:test";
import { langueMoteurVoix } from "./langues-tts";

test("langueMoteurVoix : le brief en français ou en anglais, accents compris", () => {
  assert.equal(langueMoteurVoix("Français"), "French");
  assert.equal(langueMoteurVoix("francais"), "French");
  assert.equal(langueMoteurVoix("French"), "French");
  assert.equal(langueMoteurVoix("anglais (britannique)"), "English");
  assert.equal(langueMoteurVoix("Español"), "Spanish");
  assert.equal(langueMoteurVoix("Coréen"), "Korean");
});

test("langueMoteurVoix : vide ou inconnue → « Auto »", () => {
  assert.equal(langueMoteurVoix(""), "Auto");
  assert.equal(langueMoteurVoix(null), "Auto");
  assert.equal(langueMoteurVoix("klingon"), "Auto");
});
