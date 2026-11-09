import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirMoteurFiche, moteurParDefaut, refusReferences } from "./moteur";

test("moteur par défaut : auto, sauf retour arrière par CADENCE_MOTEUR_FICHE=plan-h3", () => {
  assert.equal(moteurParDefaut({}), "auto");
  assert.equal(moteurParDefaut({ CADENCE_MOTEUR_FICHE: "plan-h3" }), "plan-h3");
  assert.equal(moteurParDefaut({ CADENCE_MOTEUR_FICHE: " plan-h3 " }), "plan-h3");
  assert.equal(moteurParDefaut({ CADENCE_MOTEUR_FICHE: "autre" }), "auto");
});

test("références : aucune, sans fichier, trop nombreuses → refus ; sinon rien à redire", () => {
  assert.match(refusReferences({ total: 0, sansFichier: [] })!, /aucune image de référence/);
  assert.match(refusReferences({ total: 2, sansFichier: ["Mai"] })!, /cette référence n'a pas encore d'image : Mai/);
  assert.match(refusReferences({ total: 3, sansFichier: ["Mai", "Gare"] })!, /ces références n'ont pas encore d'image : Mai, Gare/);
  assert.match(refusReferences({ total: 7, sansFichier: [] })!, /7 références visuelles, 6 au plus/);
  assert.equal(refusReferences({ total: 6, sansFichier: [] }), null);
});

test("auto : Open H3 IR quand le plan est compilable, plan-h3 en repli avec sa raison", () => {
  assert.deepEqual(choisirMoteurFiche("auto", { total: 2, sansFichier: [] }), { moteur: "h3ir", repli: null });
  const repli = choisirMoteurFiche("auto", { total: 0, sansFichier: [] });
  assert.equal(repli.moteur, "plan-h3");
  assert.match(repli.repli!, /^Repli sur plan-h3 : le plan n'a encore aucune image de référence/);
  assert.equal(choisirMoteurFiche("auto", { total: 1, sansFichier: ["Mai"] }).moteur, "plan-h3");
});

test("moteur imposé : ni lecture des références ni repli silencieux", () => {
  assert.deepEqual(choisirMoteurFiche("h3ir", { total: 0, sansFichier: [] }), { moteur: "h3ir", repli: null });
  assert.equal(choisirMoteurFiche("plan-h3", { total: 3, sansFichier: [] }).moteur, "plan-h3");
});
