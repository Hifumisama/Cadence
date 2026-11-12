import assert from "node:assert/strict";
import { test } from "node:test";
import { detailPerime, estPerime, raisonsContenuPerime, resumerPerime } from "../renders/renders";

const rendu = { promptUtilise: "summary:\nMaya ouvre la lettre.", dureeUtilisee: 12 };

test("périmé par le contenu : prompt ou durée différents du dernier rendu", () => {
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:\nMaya ouvre la lettre.", duree: 12 }, rendu), []);
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:\nMaya décachette la lettre.", duree: 12 }, rendu), ["prompt"]);
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:\nMaya ouvre la lettre.", duree: 9 }, rendu), ["duree"]);
  assert.deepEqual(raisonsContenuPerime({ prompt: "autre", duree: 9 }, rendu), ["prompt", "duree"]);
});

test("périmé par le contenu : espaces de fin de ligne et retours chariot ne comptent pas", () => {
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:  \r\nMaya ouvre la lettre.\n", duree: 12 }, rendu), []);
});

test("périmé par le contenu : sans valeur enregistrée ou sans fiche, on ne sait pas : rien", () => {
  assert.deepEqual(raisonsContenuPerime({ prompt: "autre", duree: 9 }, { promptUtilise: null, dureeUtilisee: null }), []);
  assert.deepEqual(raisonsContenuPerime({ prompt: "autre", duree: 9 }, { promptUtilise: "  ", dureeUtilisee: null }), []);
  assert.deepEqual(raisonsContenuPerime({ prompt: null, duree: null }, rendu), []);
});

test("périmé : références OU contenu, résumé et phrase d'alerte", () => {
  assert.equal(estPerime({ codes: [], raisons: [] }), false);
  assert.equal(estPerime({ codes: ["CHAR_maya"], raisons: [] }), true);
  assert.equal(estPerime({ codes: [], raisons: ["duree"] }), true);
  assert.equal(resumerPerime({ codes: ["CHAR_maya"], raisons: ["prompt", "duree"] }), "CHAR_maya, prompt modifié, durée modifiée");
  assert.equal(detailPerime({ codes: ["CHAR_maya"], raisons: [] }), "CHAR_maya a changé depuis le dernier rendu : relance pour en tenir compte.");
  assert.equal(detailPerime({ codes: ["A", "B"], raisons: ["prompt"] }), "A, B ont changé ; le prompt a changé depuis le dernier rendu : relance pour en tenir compte.");
  assert.equal(resumerPerime({ codes: [], raisons: ["raccord"] }), "raccord à refaire");
  assert.equal(estPerime({ codes: [], raisons: ["raccord"] }), true);
  assert.equal(detailPerime({ codes: [], raisons: ["raccord"] }), "le rendu du plan précédent a changé depuis le dernier rendu : relance pour en tenir compte.");
  assert.equal(detailPerime({ codes: [], raisons: ["duree"] }), "la durée a changé depuis le dernier rendu : relance pour en tenir compte.");
});

test("périmé par le texte du plan : la description d'aujourd'hui n'est plus celle du rendu", () => {
  const avecTexte = { promptUtilise: "summary:\nMaya ouvre la lettre.", dureeUtilisee: 12, descriptionUtilisee: "Maya ouvre la lettre." };
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:\nMaya ouvre la lettre.", duree: 12, description: "Maya ouvre la lettre." }, avecTexte), []);
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:\nMaya ouvre la lettre.", duree: 12, description: "Maya déchire la lettre." }, avecTexte), ["intention"]);
  assert.deepEqual(raisonsContenuPerime({ prompt: "autre", duree: 9, description: "Maya déchire la lettre." }, avecTexte), ["prompt", "duree", "intention"]);
  // Sans texte enregistré sur le rendu (écrit avant ce suivi) ou sans `description` demandée (upscale) : l'intention n'est pas jugée.
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:\nMaya ouvre la lettre.", duree: 12, description: "Autre." }, { ...avecTexte, descriptionUtilisee: null }), []);
  assert.deepEqual(raisonsContenuPerime({ prompt: "summary:\nMaya ouvre la lettre.", duree: 12 }, avecTexte), []);
  assert.equal(resumerPerime({ codes: [], raisons: ["intention"] }), "intention modifiée");
  assert.equal(detailPerime({ codes: [], raisons: ["intention"] }), "le texte du plan a changé depuis le dernier rendu : relance pour en tenir compte.");
});
