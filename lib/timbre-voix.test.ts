import assert from "node:assert/strict";
import { test } from "node:test";
import type { FournisseurLlm } from "./llm/types";
import { checksInstruction } from "./voix";
import { ecrireTimbre, lireReponseTimbre, messageTimbre, timbreDeRepli } from "./timbre-voix";

const fournisseurQuiRepond = (texte: string): FournisseurLlm => ({ generer: async () => ({ texte }) }) as unknown as FournisseurLlm;
const fournisseurEnPanne = (): FournisseurLlm => ({ generer: async () => { throw new Error("injoignable"); } }) as unknown as FournisseurLlm;

test("message d'une première proposition : langue, personnage, orientations ; pas de retouche", () => {
  const m = messageTimbre({ langue: "French", caractere: "CHAR_maya : une jeune femme discrète", orientations: ["Jeune", "Rauque"] });
  assert.match(m, /Native language of the voice: French/);
  assert.match(m, /Character: CHAR_maya : une jeune femme discrète/);
  assert.match(m, /The author wants a voice that is: Jeune, Rauque/);
  assert.doesNotMatch(m, /retouch/i);
});

test("message d'une retouche : l'instruction actuelle, les remarques, la phrase libre et le journal jugé", () => {
  const m = messageTimbre({
    langue: "French",
    precedente: "A warm young woman.",
    remarques: ["Plus grave", "Trop théâtral"],
    note: "Je la veux plus intime",
    journal: [
      { n: 1, instruction: "A bright voice.", verdict: "ajuster", note: "trop aiguë" },
      { n: 2, instruction: "A warm young woman.", verdict: null, note: "" },
    ],
  });
  assert.match(m, /Current instruction to retouch: A warm young woman\./);
  assert.match(m, /What is wrong with it: Plus grave; Trop théâtral/);
  assert.match(m, /Je la veux plus intime/);
  assert.match(m, /- #1 \[ajuster\] A bright voice\. \(remark: trop aiguë\)/);
  assert.doesNotMatch(m, /#2/, "un essai sans verdict ni remarque n'est pas un jugement");
});

test("sans rien de décrit : on demande une voix calme et naturelle", () => {
  assert.match(messageTimbre({ langue: "English" }), /calm, warm and natural/);
});

test("lecture de la réponse : JSON pur, dans un bloc de code, entouré de texte, ou texte brut assez long", () => {
  const json = '{"instruction": "A warm young woman, a native French speaker, calm.", "resume": "Une voix chaleureuse."}';
  assert.deepEqual(lireReponseTimbre(json), { instruction: "A warm young woman, a native French speaker, calm.", resume: "Une voix chaleureuse." });
  assert.equal(lireReponseTimbre("```json\n" + json + "\n```")!.resume, "Une voix chaleureuse.");
  assert.equal(lireReponseTimbre("Voici : " + json + " Voilà.")!.instruction, "A warm young woman, a native French speaker, calm.");
  assert.equal(lireReponseTimbre("<think>hmm</think>" + json)!.resume, "Une voix chaleureuse.");
  const brut = "A warm young woman in her late twenties, a native French speaker, calm and attentive, slightly husky, unhurried.";
  assert.deepEqual(lireReponseTimbre(brut), { instruction: brut, resume: "" });
  assert.equal(lireReponseTimbre("ok"), null);
  assert.equal(lireReponseTimbre('{"resume": "pas d\'instruction"}'), null);
});

test("première proposition : le modèle répond", async () => {
  const r = await ecrireTimbre({ langue: "French" }, { fournisseur: fournisseurQuiRepond('{"instruction": "A native French speaker, warm and calm.", "resume": "Chaleureuse."}') });
  assert.equal(r.source, "modele");
  assert.equal(r.instruction, "A native French speaker, warm and calm.");
});

test("première proposition : modèle injoignable → instruction de repli, qui respecte les garde-fous", async () => {
  const r = await ecrireTimbre({ langue: "French" }, { fournisseur: fournisseurEnPanne() });
  assert.equal(r.source, "repli");
  assert.deepEqual(checksInstruction(r.instruction), []);
  assert.match(timbreDeRepli("English").instruction, /native English speaker/);
});

test("retouche : le modèle injoignable est une erreur franche, jamais un texte de repli", async () => {
  await assert.rejects(ecrireTimbre({ langue: "French", precedente: "A warm voice.", remarques: ["Plus grave"] }, { fournisseur: fournisseurEnPanne() }), /Retouche impossible/);
  await assert.rejects(ecrireTimbre({ langue: "French", precedente: "A warm voice." }, { fournisseur: fournisseurQuiRepond("ok") }), /pas rendu d'instruction/);
});
