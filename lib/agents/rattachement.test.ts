import assert from "node:assert/strict";
import { test } from "node:test";
import { decideRattachements } from "./rattachement";

const registre = [
  { id: 1, code: "CHAR_la_narratrice", type: "personnage" as const },
  { id: 2, code: "CHAR_le_frere", type: "personnage" as const },
  { id: 9, code: "VOICE_off", type: "voix" as const },
];

test("une réplique libre se relie au personnage dont le nom est le sien", () => {
  const r = decideRattachements(registre, [
    { id: 10, locuteurTexte: "La Narratrice" },
    { id: 11, locuteurTexte: "Le Frère" },
    { id: 12, locuteurTexte: "Le capitaine" },
  ]);
  assert.deepEqual(r, [{ id: 10, locuteurId: 1, voixId: null }, { id: 11, locuteurId: 2, voixId: null }]);
});

test("« voix off » se relie à la voix off du registre, et reste libre sans elle", () => {
  assert.deepEqual(decideRattachements(registre, [{ id: 1, locuteurTexte: "Voix off" }]), [{ id: 1, locuteurId: null, voixId: 9 }]);
  assert.deepEqual(decideRattachements(registre.slice(0, 2), [{ id: 1, locuteurTexte: "Voix off" }]), []);
});
