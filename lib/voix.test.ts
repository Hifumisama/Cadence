import assert from "node:assert/strict";
import { test } from "node:test";
import { TEXTE_REFERENCE_DEFAUT, formaterPlageH3, langueBalise, promptMasterVoix } from "./voix";

test("prompt du master : la plage du plan suit la durée, la balise suit la langue", () => {
  const base = { texte: "Hello there.", personnage: null };
  assert.match(promptMasterVoix(base), /\[Shot 1, 00:00\.000–00:08\.000\]/);
  assert.match(promptMasterVoix({ ...base, dureeSecondes: 11 }), /\[Shot 1, 00:00\.000–00:11\.000\]/);
  assert.match(promptMasterVoix(base), /<d>\[Français\] Hello there\.<\/d>/, "sans langue : Français");
  assert.match(promptMasterVoix({ ...base, langue: "English" }), /<d>\[English\] Hello there\.<\/d>/);
  assert.equal(formaterPlageH3(65.5), "01:05.500");
});

test("prompt du master : la réplique est citée telle quelle dans <d>, le personnage en <Picture 1>, jamais d'audio fourni", () => {
  const texte = "Vous êtes déjà venu ici, non ? Non... je m'en souviendrais.";
  const p = promptMasterVoix({ texte, personnage: { code: "CHAR_maya", description: "a tall woman." } });
  assert.ok(p.includes(`<d>[Français] ${texte}</d>`));
  assert.ok(p.includes("<Picture 1>"));
  assert.ok(!p.includes("<Audio"));
  const voixOff = promptMasterVoix({ texte, personnage: null });
  assert.ok(!voixOff.includes("<Picture 1>"), "une voix off n'a pas d'image");
  assert.match(voixOff, /a character facing the camera/);
});

test("prompt du master : le timbre voulu entre dans le plan, sans lui le modèle choisit", () => {
  const base = { texte: "Bonjour.", personnage: null, langue: "French" };
  assert.match(promptMasterVoix({ ...base, voix: "a low, calm voice." }), /Its voice is a low, calm voice\./);
  assert.doesNotMatch(promptMasterVoix(base), /Its voice is/);
  assert.doesNotMatch(promptMasterVoix({ ...base, voix: "   " }), /Its voice is/);
});

test("texte de référence par défaut : non vide, en anglais", () => {
  assert.ok(TEXTE_REFERENCE_DEFAUT.trim().length > 20);
  assert.match(TEXTE_REFERENCE_DEFAUT, /welcome/i);
});

test("langue de la balise : French -> Français", () => {
  assert.equal(langueBalise("French"), "Français");
  assert.equal(langueBalise("english"), "English");
  assert.equal(langueBalise(""), "Français");
});
