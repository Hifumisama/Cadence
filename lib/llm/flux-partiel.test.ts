import test from "node:test";
import assert from "node:assert/strict";
import { AccumulateurFlux, extraireChainePartielle, fin } from "./flux-partiel";

test("extraireChainePartielle : rien tant que la chaîne n'a pas commencé", () => {
  assert.equal(extraireChainePartielle("", "reponse"), null);
  assert.equal(extraireChainePartielle('{"repon', "reponse"), null);
  assert.equal(extraireChainePartielle('{"reponse":', "reponse"), null);
});

test("extraireChainePartielle : la réponse grandit avec le flux, puis se termine à la guillemet fermante", () => {
  assert.equal(extraireChainePartielle('{"reponse":"Voici', "reponse"), "Voici");
  assert.equal(extraireChainePartielle('{"reponse": "Voici mon arc', "reponse"), "Voici mon arc");
  assert.equal(extraireChainePartielle('{"reponse":"Fini.","briefPret":false}', "reponse"), "Fini.");
});

test("extraireChainePartielle : échappements décodés, échappement coupé ignoré", () => {
  assert.equal(extraireChainePartielle('{"reponse":"ligne 1\\nligne \\"2\\" \\\\ fin', "reponse"), 'ligne 1\nligne "2" \\ fin');
  assert.equal(extraireChainePartielle('{"reponse":"é\\u00e9 \\u00', "reponse"), "éé ");
  assert.equal(extraireChainePartielle('{"reponse":"coupé \\', "reponse"), "coupé ");
});

test("extraireChainePartielle : une autre clé, un texte qui n'est pas du JSON", () => {
  assert.equal(extraireChainePartielle('{"a":"x","b":"y"}', "b"), "y");
  assert.equal(extraireChainePartielle("du texte libre", "reponse"), null);
});

test("fin : la fin d'un texte", () => {
  assert.equal(fin("abcdef", 3), "def");
  assert.equal(fin("ab", 3), "ab");
});

test("AccumulateurFlux : cumule, repart de zéro à chaque nouvel appel, reste borné", () => {
  const a = new AccumulateurFlux(10, 5);
  a.recevoir({ type: "debut", texte: "" });
  a.recevoir({ type: "reflexion", texte: "je pense " });
  a.recevoir({ type: "reflexion", texte: "à ceci" });
  a.recevoir({ type: "texte", texte: '{"reponse":"Bon' });
  a.recevoir({ type: "texte", texte: "jour" });
  assert.equal(a.reflexion, " ceci", "5 derniers caractères de la réflexion");
  assert.equal(a.texte.length, 10, "texte borné");
  a.recevoir({ type: "debut", texte: "" });
  assert.equal(a.texte, "");
  assert.equal(a.reflexion, "");
});
