import assert from "node:assert/strict";
import { test } from "node:test";
import { parolesDuPrompt, voixDuPrompt } from "./voix-du-prompt";

test("parolesDuPrompt : le locuteur est le [[CODE]] (Sx) qui précède la balise, la langue est retirée", () => {
  const p = parolesDuPrompt([{ texte: "A close-up of [[CHAR_mai]] (S1) murmuring, <d>[Français] Bon... encore une fois.</d>" }]);
  assert.deepEqual(p, [{ shot: 1, texte: "Bon... encore une fois.", numero: "S1", code: "CHAR_mai" }]);
});

test("parolesDuPrompt : (Sx) seul est relié au personnage cité plus haut sous ce numéro ; deux paroles dans un shot", () => {
  const p = parolesDuPrompt([
    { texte: "[[CHAR_mai]] (S1) says, <d>[Français] Un.</d>" },
    { texte: "a medium shot. She (S1) shouts <d>[Français] Deux.</d> then [[CHAR_garde]] (S2) says <d>[Français] Trois.</d>" },
  ]);
  assert.deepEqual(p.map((x) => [x.shot, x.code, x.texte]), [[1, "CHAR_mai", "Un."], [2, "CHAR_mai", "Deux."], [2, "CHAR_garde", "Trois."]]);
});

test("voixDuPrompt : un slot par personnage qui parle ET a une voix fixée, dans l'ordre de parole, 3 au plus", () => {
  const shots = [
    { texte: "[[CHAR_a]] (S1) says <d>[Français] A1.</d> [[CHAR_b]] (S2) says <d>[Français] B1.</d>" },
    { texte: "[[CHAR_a]] (S1) says <d>[Français] A2.</d> [[CHAR_c]] (S3) says <d>[Français] C1.</d> [[CHAR_d]] (S4) says <d>[Français] D1.</d> [[CHAR_e]] (S5) says <d>[Français] E1.</d>" },
  ];
  const tous = new Set(["CHAR_a", "CHAR_b", "CHAR_c", "CHAR_d", "CHAR_e"]);
  assert.deepEqual(voixDuPrompt(shots, tous).map((v) => [v.slot, v.locuteurCode]), [[1, "CHAR_a"], [2, "CHAR_b"], [3, "CHAR_c"]]);
  assert.deepEqual(voixDuPrompt(shots, new Set(["CHAR_b"])).map((v) => [v.slot, v.locuteurCode]), [[1, "CHAR_b"]]);
  assert.deepEqual(voixDuPrompt(shots, new Set()), []);
});
