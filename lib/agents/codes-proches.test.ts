import test from "node:test";
import assert from "node:assert/strict";
import { cleDeCode, corrigerCodesInconnus, correspondances } from "./codes-proches";
import type { SortiePlanH3 } from "./plan-h3-controles";

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

const sortie = (over: Partial<SortiePlanH3> = {}): SortiePlanH3 => ({
  titre: "t",
  dureeSecondes: 8,
  references: [{ asset: "DEC_le_monde_l_avatar", nature: "image", role: "décor", nom: "the world", definition: "" }],
  summary: "[[DEC_le_monde_l_avatar]] s'embrase",
  ouverture: "",
  shots: [{ debutSecondes: 0, texte: "a wide shot of [[ DEC_le_monde_l_avatar ]] and [[CHAR_aang]]" }],
  overall_soundscape: "",
  non_diegetic_music: "",
  repliques: [],
  assetsManquants: [],
  notes: "",
  ...over,
});

test("corrigerCodesInconnus : références et marqueurs corrigés, corrections listées", () => {
  const r = corrigerCodesInconnus(sortie(), registre);
  assert.equal(r.sortie.references[0]!.asset, "DEC_le_monde_de_l_avatar");
  assert.equal(r.sortie.summary, "[[DEC_le_monde_de_l_avatar]] s'embrase");
  assert.equal(r.sortie.shots[0]!.texte, "a wide shot of [[DEC_le_monde_de_l_avatar]] and [[CHAR_aang]]");
  assert.deepEqual(r.corrections, [{ de: "DEC_le_monde_l_avatar", vers: "DEC_le_monde_de_l_avatar" }]);
});

test("corrigerCodesInconnus : une sortie saine revient telle quelle", () => {
  const saine = sortie({ references: [], summary: "[[CHAR_aang]]", shots: [{ debutSecondes: 0, texte: "x" }] });
  const r = corrigerCodesInconnus(saine, registre);
  assert.equal(r.sortie, saine);
  assert.deepEqual(r.corrections, []);
});
