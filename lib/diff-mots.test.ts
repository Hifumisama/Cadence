import assert from "node:assert/strict";
import { test } from "node:test";
import { differenceMots, memeTexte } from "./diff-mots";

test("textes identiques : un seul bloc, rien de retiré ni d'ajouté", () => {
  assert.deepEqual(differenceMots("a warm voice", "a warm voice"), [{ type: "meme", texte: "a warm voice" }]);
});

test("un remplacement au milieu : le retiré, l'ajouté, et le reste est conservé", () => {
  const d = differenceMots("A warm woman, calm and attentive, slightly husky.", "A warm woman, intimate and close, slightly husky.");
  assert.deepEqual(d, [
    { type: "meme", texte: "A warm woman," },
    { type: "retire", texte: "calm and attentive," },
    { type: "ajoute", texte: "intimate and close," },
    { type: "meme", texte: "slightly husky." },
  ]);
});

test("ajout en fin et retrait en début", () => {
  assert.deepEqual(differenceMots("one two", "one two three"), [{ type: "meme", texte: "one two" }, { type: "ajoute", texte: "three" }]);
  assert.deepEqual(differenceMots("zero one two", "one two"), [{ type: "retire", texte: "zero" }, { type: "meme", texte: "one two" }]);
});

test("vide : tout est ajouté ou retiré", () => {
  assert.deepEqual(differenceMots("", "a b"), [{ type: "ajoute", texte: "a b" }]);
  assert.deepEqual(differenceMots("a b", ""), [{ type: "retire", texte: "a b" }]);
  assert.deepEqual(differenceMots("", ""), []);
});

test("recomposer : les segments « meme » et « ajoute » redonnent le nouveau texte, « meme » et « retire » l'ancien", () => {
  const avant = "A bright and quick young woman with a teasing smile in her voice";
  const apres = "A slow and hushed young woman with a gentle smile in her voice, close to the ear";
  const d = differenceMots(avant, apres);
  assert.equal(d.filter((s) => s.type !== "retire").map((s) => s.texte).join(" "), apres);
  assert.equal(d.filter((s) => s.type !== "ajoute").map((s) => s.texte).join(" "), avant);
});

test("même texte aux espaces près", () => {
  assert.ok(memeTexte("a  b\nc", "a b c"));
  assert.ok(!memeTexte("a b", "a c"));
});
