import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirProchaineIteration, precedentsDansLaChaine, raccordPerime } from "./chaines";

const episode = [
  { id: 1, ordre: 1, liaison: "coupe" },
  { id: 2, ordre: 2, liaison: "suite" },
  { id: 3, ordre: 3, liaison: "suite" },
  { id: 4, ordre: 4, liaison: "coupe" },
  { id: 5, ordre: 5, liaison: "suite" },
];

test("les précédents d'un plan sont ceux de sa chaîne, du plus proche au plus lointain", () => {
  assert.deepEqual(precedentsDansLaChaine(episode, 3), [2, 1]);
  assert.deepEqual(precedentsDansLaChaine(episode, 2), [1]);
  assert.deepEqual(precedentsDansLaChaine(episode, 5), [4]);
});

test("une coupe ouvre une chaîne : rien avant", () => {
  assert.deepEqual(precedentsDansLaChaine(episode, 1), []);
  assert.deepEqual(precedentsDansLaChaine(episode, 4), []);
  assert.deepEqual(precedentsDansLaChaine(episode, 99), []);
});

test("l'ordre est celui de plans.ordre, pas celui de la liste reçue", () => {
  assert.deepEqual(precedentsDansLaChaine([...episode].reverse(), 3), [2, 1]);
});

const precedents = (id: number) => precedentsDansLaChaine(episode, id);

test("un plan en suite attend son précédent s'il est lui aussi en file", () => {
  const file = [
    { id: 10, planId: 3 },
    { id: 11, planId: 2 },
  ];
  assert.equal(choisirProchaineIteration(file, precedents)?.id, 11);
});

test("l'attente est transitive dans la chaîne", () => {
  const file = [
    { id: 10, planId: 3 },
    { id: 11, planId: 1 },
  ];
  assert.equal(choisirProchaineIteration(file, precedents)?.id, 11);
});

test("une coupe ne fait attendre personne", () => {
  const file = [
    { id: 10, planId: 5 },
    { id: 11, planId: 3 },
  ];
  assert.equal(choisirProchaineIteration(file, precedents)?.id, 10);
});

test("sans lien dans la file, c'est l'ordre d'arrivée", () => {
  const file = [
    { id: 10, planId: 3 },
    { id: 11, planId: 4 },
  ];
  assert.equal(choisirProchaineIteration(file, precedents)?.id, 10);
  assert.equal(choisirProchaineIteration([], precedents), null);
});

test("la file n'est jamais bloquée : la première passe si tout s'attend", () => {
  const file = [
    { id: 10, planId: 2 },
    { id: 11, planId: 3 },
  ];
  const cyclique = (p: number) => (p === 2 ? [3] : [2]);
  assert.equal(choisirProchaineIteration(file, cyclique)?.id, 10);
});

test("raccord périmé : seulement si les deux essais sont connus et différents", () => {
  assert.equal(raccordPerime(5, 5), false);
  assert.equal(raccordPerime(5, 9), true);
  assert.equal(raccordPerime(null, 9), false);
  assert.equal(raccordPerime(5, null), false);
});

import { doitAttendreLePrecedent } from "./chaines";

test("un plan en suite attend le rendu de son précédent, jamais un plan en coupe", () => {
  assert.equal(doitAttendreLePrecedent("suite", true), true);
  assert.equal(doitAttendreLePrecedent("suite", false), false);
  assert.equal(doitAttendreLePrecedent("coupe", true), false);
});
