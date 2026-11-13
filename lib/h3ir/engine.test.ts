import assert from "node:assert/strict";
import { test } from "node:test";
import { attenteDuPlan, refusReferences } from "./engine";

test("références : aucune, sans fichier, trop nombreuses → refus ; sinon rien à redire", () => {
  assert.match(refusReferences({ total: 0, sansFichier: [] })!, /aucune image de référence/);
  assert.match(refusReferences({ total: 2, sansFichier: ["Mai"] })!, /cette référence n'a pas encore d'image : Mai/);
  assert.match(refusReferences({ total: 3, sansFichier: ["Mai", "Gare"] })!, /ces références n'ont pas encore d'image : Mai, Gare/);
  assert.match(refusReferences({ total: 7, sansFichier: [] })!, /7 références visuelles, 6 au plus/);
  assert.equal(refusReferences({ total: 6, sansFichier: [] }), null);
});

test("attenteDuPlan : un plan prêt (null) reste prêt, un plan absent de la liste est « inconnu »", () => {
  const attentes = new Map<string, string | null>([["pret", null], ["attend", "une image manque"]]);
  assert.equal(attenteDuPlan(attentes, "pret"), null);
  assert.equal(attenteDuPlan(attentes, "attend"), "une image manque");
  assert.match(attenteDuPlan(attentes, "absent") ?? "", /inconnu/);
});
