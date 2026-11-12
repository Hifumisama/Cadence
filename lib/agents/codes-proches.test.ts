import test from "node:test";
import assert from "node:assert/strict";
import { cleDeCode, correspondances } from "./codes-proches";

const registre = ["DEC_le_monde_de_l_avatar", "CHAR_aang", "PROP_baton", "PROP_baton_long"];

test("cleDeCode : mots de liaison et accents ignorés, préfixe gardé", () => {
  assert.equal(cleDeCode("DEC_le_monde_de_l_avatar"), cleDeCode("DEC_le_monde_l_avatar"));
  assert.notEqual(cleDeCode("DEC_monde"), cleDeCode("PROP_monde"));
  assert.equal(cleDeCode("CHAR_Éléna"), "char_elena");
});

test("correspondances : un code inconnu qui ne diffère que par des mots de liaison est corrigé ; le reste ne l'est jamais", () => {
  const m = correspondances(["DEC_le_monde_l_avatar", "CHAR_aang", "PROP_baton_court", "PROP_lanterne"], registre);
  assert.deepEqual([...m], [["DEC_le_monde_l_avatar", "DEC_le_monde_de_l_avatar"]]);
});

test("correspondances : deux candidats = ambigu, rien n'est deviné", () => {
  assert.equal(correspondances(["DEC_x_de_y"], ["DEC_x_y", "DEC_x_la_y"]).size, 0);
});
