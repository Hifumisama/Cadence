import { test } from "node:test";
import assert from "node:assert/strict";
import { contenuPourLlm, etatSequence, normaliserSequence } from "./chat-sequence";

test("normaliserSequence : moments nettoyés (numéros retirés), temps fort borné", () => {
  assert.deepEqual(normaliserSequence({ moments: ["1. Marc entre", " 2) Lina se retourne ", ""], tempsFort: 2 }), { moments: ["Marc entre", "Lina se retourne"], tempsFort: 2 });
  assert.deepEqual(normaliserSequence({ moments: ["a", "b"], tempsFort: 5 }), { moments: ["a", "b"], tempsFort: null });
  assert.equal(normaliserSequence({ moments: ["seul"] }), null);
  assert.equal(normaliserSequence("1. a 2. b"), null);
  assert.equal(normaliserSequence(undefined), null);
});

test("contenuPourLlm : la séquence suit le texte, en liste numérotée", () => {
  assert.equal(contenuPourLlm({ content: "Voilà :" }), "Voilà :");
  assert.equal(
    contenuPourLlm({ content: "Voilà :", sequence: { moments: ["Marc entre", "Le sac vole"], tempsFort: 2 } }),
    "Voilà :\n\nSéquence proposée :\n1. Marc entre\n2. Le sac vole (temps fort)",
  );
});

test("etatSequence : validée si les notes tiennent cette liste, remplacée si une autre l'a suivie", () => {
  const s = { moments: ["Marc entre", "Le sac vole"], tempsFort: null };
  assert.equal(etatSequence(s, true, { moments: ["Marc  entre", "Le sac vole"], tranche: true }), "validee");
  assert.equal(etatSequence(s, true, { moments: ["Marc entre", "Le sac vole"], tranche: false }), "proposee");
  assert.equal(etatSequence(s, false, { moments: ["Autre"], tranche: true }), "remplacee");
});
