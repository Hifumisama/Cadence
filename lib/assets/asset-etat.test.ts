import assert from "node:assert/strict";
import { test } from "node:test";
import { estCritique, seuilCritique, statutAsset } from "./asset-etat";

test("statut : sans fichier à produire, avec fichier en cours, validé quand c'est dit", () => {
  assert.equal(statutAsset({ fichier: null, valide: false }), "a_produire");
  assert.equal(statutAsset({ fichier: null, valide: true }), "a_produire");
  assert.equal(statutAsset({ fichier: "CHAR_maya.png", valide: false }), "en_cours");
  assert.equal(statutAsset({ fichier: "CHAR_maya.png", valide: true }), "valide");
});

test("seuil critique : 3 plans, ou 20 % si c'est moins, jamais moins de 1", () => {
  assert.equal(seuilCritique(40), 3);
  assert.equal(seuilCritique(15), 3);
  assert.equal(seuilCritique(10), 2);
  assert.equal(seuilCritique(3), 1);
  assert.equal(seuilCritique(0), 1);
});

test("critique : un épisode qui passe le seuil suffit, un asset jamais cité ne l'est pas", () => {
  assert.equal(estCritique([]), false);
  assert.equal(estCritique([{ cites: 2, total: 40 }]), false);
  assert.equal(estCritique([{ cites: 3, total: 40 }]), true);
  assert.equal(estCritique([{ cites: 2, total: 10 }]), true);
  assert.equal(estCritique([{ cites: 2, total: 40 }, { cites: 2, total: 8 }]), true);
  assert.equal(estCritique([{ cites: 0, total: 0 }]), false);
});

test("libellé : le label prime, sinon le code rendu lisible", async () => {
  const { libelleAsset } = await import("./assetCode");
  assert.equal(libelleAsset({ code: "CHAR_maya", label: "Maya la danseuse" }), "Maya la danseuse");
  assert.equal(libelleAsset({ code: "CHAR_maya", label: "  " }), "Maya");
  assert.equal(libelleAsset({ code: "DEC_auberge_salle" }), "Auberge salle");
});
