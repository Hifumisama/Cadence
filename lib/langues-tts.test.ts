import assert from "node:assert/strict";
import { test } from "node:test";
import { langueDuTexteDeReference } from "./asset-generation";
import { LANGUES_MOTEUR, LANGUE_AUTO, langueFicheVoix, langueMoteurVoix, libelleLangueMoteur } from "./langues-tts";

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

test("langueMoteurVoix : codes ISO, avec ou sans région", () => {
  for (const [entree, attendu] of [["fr", "French"], ["FR-ca", "French"], ["en", "English"], ["en_US", "English"], ["de", "German"], ["es-MX", "Spanish"], ["it", "Italian"], ["pt-BR", "Portuguese"], ["ja", "Japanese"], ["ko", "Korean"], ["ru", "Russian"], ["zh-CN", "Chinese"]] as const) {
    assert.equal(langueMoteurVoix(entree), attendu, entree);
  }
  assert.equal(langueMoteurVoix("Sans dialogue"), "Auto");
});

test("langueMoteurVoix : la sortie est TOUJOURS un nom accepté par le moteur (anglais)", () => {
  const acceptes = new Set<string>([LANGUE_AUTO, ...LANGUES_MOTEUR.map((l) => l.valeur)]);
  for (const entree of ["Français", "French", "fr", "anglais", "Deutsch", "日本語?", "", null, undefined, "n'importe quoi", "Sans dialogue", "中文", "Mandarin"]) {
    assert.ok(acceptes.has(langueMoteurVoix(entree)), String(entree));
  }
  // Idempotent : un nom du moteur ressort tel quel.
  for (const l of LANGUES_MOTEUR) assert.equal(langueMoteurVoix(l.valeur), l.valeur);
});

test("langueFicheVoix : stockée en anglais ; vide = French, inconnue = Auto", () => {
  assert.equal(langueFicheVoix("Français"), "French");
  assert.equal(langueFicheVoix("  "), "French");
  assert.equal(langueFicheVoix(null), "French");
  assert.equal(langueFicheVoix("klingon"), "Auto");
  assert.equal(libelleLangueMoteur("French"), "Français");
});

test("langueDuTexteDeReference : la langue de la fiche est normalisée en anglais", () => {
  const defaut = "Welcome adventurer.";
  assert.equal(langueDuTexteDeReference(defaut, defaut, "Français"), "English");
  assert.equal(langueDuTexteDeReference("Bienvenue.", defaut, "Français"), "French");
  assert.equal(langueDuTexteDeReference("Bienvenue.", defaut, "fr"), "French");
  assert.equal(langueDuTexteDeReference("Hallo.", defaut, "allemand"), "German");
  assert.equal(langueDuTexteDeReference("Bienvenue.", defaut, ""), "French");
});
