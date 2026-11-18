import { test } from "node:test";
import assert from "node:assert/strict";
import { messageReponses, normaliserQuestions, questionsPourLlm } from "./chat-questions";
import { contenuPourLlm } from "./chat-sequence";

const carte = normaliserQuestions({
  sujet: "La fin",
  questions: [
    { question: "1. Sur quoi se méprennent-ils ?", reponses: ["Un objet", "Une phrase mal comprise", "Autre", "Un objet", "Je te laisse décider"] },
    { question: "L'un des deux finit-il par avouer ?" },
  ],
})!;

test("normaliserQuestions : numéros retirés, « Autre » et doublons retirés, trois questions au plus ; forme abîmée refusée", () => {
  assert.deepEqual(carte, {
    sujet: "La fin",
    questions: [
      { question: "Sur quoi se méprennent-ils ?", reponses: ["Un objet", "Une phrase mal comprise", "Je te laisse décider"] },
      { question: "L'un des deux finit-il par avouer ?", reponses: [] },
    ],
  });
  assert.equal(normaliserQuestions({ sujet: "x", questions: [] }), null);
  assert.equal(normaliserQuestions("x"), null);
  assert.equal(normaliserQuestions({ questions: [{ question: "a" }, { question: "b" }, { question: "c" }, { question: "d" }] })!.questions.length, 3);
  assert.equal(normaliserQuestions({ questions: [{ question: "a" }] })!.sujet, "Questions");
});

test("messageReponses : une ligne par question répondue, la question rappelée ; rien si rien n'est répondu", () => {
  assert.equal(messageReponses(carte, ["Un objet", "  oui, à la toute fin  "]), "1. La fin — Sur quoi se méprennent-ils ? Un objet\n2. La fin — L'un des deux finit-il par avouer ? oui, à la toute fin");
  assert.equal(messageReponses(carte, ["", "Non"]), "2. La fin — L'un des deux finit-il par avouer ? Non");
  assert.equal(messageReponses(carte, ["", " "]), null);
});

test("les modèles lisent les questions dans l'historique", () => {
  assert.match(questionsPourLlm(carte), /^Questions \(La fin\) :\n1\. Sur quoi se méprennent-ils \? \(réponses proposées : Un objet \/ Une phrase mal comprise \/ Je te laisse décider\)\n2\./);
  assert.equal(contenuPourLlm({ content: "Deux choses sur la fin :", questions: carte }), `Deux choses sur la fin :\n\n${questionsPourLlm(carte)}`);
  assert.equal(contenuPourLlm({ content: "Bonjour" }), "Bonjour");
});
