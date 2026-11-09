import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirMoteurFiche, moteurParDefaut, refusReferences } from "./moteur";

test("moteur par défaut : Open H3 IR, sauf retour arrière d'urgence par CADENCE_MOTEUR_FICHE=plan-h3", () => {
  assert.equal(moteurParDefaut({}), "h3ir");
  assert.equal(moteurParDefaut({ CADENCE_MOTEUR_FICHE: "plan-h3" }), "plan-h3");
  assert.equal(moteurParDefaut({ CADENCE_MOTEUR_FICHE: " plan-h3 " }), "plan-h3");
  assert.equal(moteurParDefaut({ CADENCE_MOTEUR_FICHE: "autre" }), "h3ir");
});

test("références : aucune, sans fichier, trop nombreuses → refus ; sinon rien à redire", () => {
  assert.match(refusReferences({ total: 0, sansFichier: [] })!, /aucune image de référence/);
  assert.match(refusReferences({ total: 2, sansFichier: ["Mai"] })!, /cette référence n'a pas encore d'image : Mai/);
  assert.match(refusReferences({ total: 3, sansFichier: ["Mai", "Gare"] })!, /ces références n'ont pas encore d'image : Mai, Gare/);
  assert.match(refusReferences({ total: 7, sansFichier: [] })!, /7 références visuelles, 6 au plus/);
  assert.equal(refusReferences({ total: 6, sansFichier: [] }), null);
});

test("auto ou h3ir : toujours Open H3 IR ; un plan pas prêt attend la préparation, jamais de repli plan-h3", () => {
  assert.deepEqual(choisirMoteurFiche("auto", { total: 2, sansFichier: [] }), { moteur: "h3ir", repli: null, attente: null });
  const sansRef = choisirMoteurFiche("auto", { total: 0, sansFichier: [] });
  assert.equal(sansRef.moteur, "h3ir");
  assert.equal(sansRef.repli, null);
  assert.match(sansRef.attente!, /aucune image de référence/);
  assert.equal(choisirMoteurFiche("h3ir", { total: 1, sansFichier: ["Mai"] }).moteur, "h3ir");
});

test("plan-h3 seulement s'il est imposé (retour arrière d'urgence)", () => {
  assert.equal(choisirMoteurFiche("plan-h3", { total: 3, sansFichier: [] }).moteur, "plan-h3");
});
