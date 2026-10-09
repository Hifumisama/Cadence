import assert from "node:assert/strict";
import { test } from "node:test";
import { changerTexteReplique } from "../repliques-ecriture";
import { planifierDeplacement, planifierSuppression } from "./rangs";

// Les plans d'un épisode dans l'ordre de lecture : deux scènes (1 et 2), un plan par lettre.
const plans = [
  { uuid: "a", titre: "A", sceneId: 1 },
  { uuid: "b", titre: "B", sceneId: 1 },
  { uuid: "c", titre: "C", sceneId: 2 },
  { uuid: "d", titre: "D", sceneId: 2 },
];

test("déplacement : après un plan, il entre dans la scène de ce plan", () => {
  const d = planifierDeplacement(plans, "a", { apresPlanUuid: "c" })!;
  assert.equal(d.index, 2, "dans la séquence sans A : b, c, [a], d");
  assert.equal(d.rangAvant, 1);
  assert.equal(d.rangApres, 3);
  assert.equal(d.sceneId, 2);
  assert.deepEqual(d.deplaces.map((r) => [r.planUuid, r.rangAvant, r.rangApres]), [["b", 2, 1], ["c", 3, 2]]);
});

test("déplacement : au début il prend la scène du premier plan, à la fin celle du dernier", () => {
  const debut = planifierDeplacement(plans, "d", { debut: true })!;
  assert.equal(debut.index, 0);
  assert.equal(debut.rangApres, 1);
  assert.equal(debut.sceneId, 1);
  assert.deepEqual(debut.deplaces.map((r) => r.planUuid), ["a", "b", "c"]);

  const fin = planifierDeplacement(plans, "a", { fin: true })!;
  assert.equal(fin.index, 3);
  assert.equal(fin.rangApres, 4);
  assert.equal(fin.sceneId, 2);
});

test("déplacement : repère introuvable, repère = le plan lui-même, plan inconnu → null", () => {
  assert.equal(planifierDeplacement(plans, "a", { apresPlanUuid: "zz" }), null);
  assert.equal(planifierDeplacement(plans, "a", { apresPlanUuid: "a" }), null);
  assert.equal(planifierDeplacement(plans, "zz", { fin: true }), null);
});

test("déplacement : rester à sa place ne déplace aucun rang", () => {
  const d = planifierDeplacement(plans, "b", { apresPlanUuid: "a" })!;
  assert.equal(d.rangAvant, 2);
  assert.equal(d.rangApres, 2);
  assert.deepEqual(d.deplaces, []);
});

test("déplacement : un épisode d'un seul plan n'a pas de scène voisine", () => {
  const d = planifierDeplacement([{ uuid: "a", titre: "A", sceneId: 1 }], "a", { fin: true })!;
  assert.equal(d.sceneId, undefined, "le plan garde sa scène");
  assert.equal(d.rangApres, 1);
});

test("texte de réplique : vide refusé, identique sans effet", () => {
  assert.deepEqual(changerTexteReplique({ texte: "Salut.", statut: "a_produire" }, "  \n "), { ok: false, erreur: "Le texte de la réplique est vide." });
  assert.deepEqual(changerTexteReplique({ texte: "Salut.", statut: "validee" }, " Salut. "), { ok: true, texteChange: false, set: {} });
});

test("texte de réplique : une prise validée repasse posée, les autres statuts sont gardés", () => {
  assert.deepEqual(changerTexteReplique({ texte: "Salut.", statut: "validee" }, "Au revoir."), {
    ok: true,
    texteChange: true,
    set: { texte: "Au revoir.", statut: "prise_posee" },
  });
  assert.deepEqual(changerTexteReplique({ texte: "Salut.", statut: "prise_posee" }, "Au revoir.\r\n"), { ok: true, texteChange: true, set: { texte: "Au revoir." } });
});

test("suppression : les plans suivants montent d'un rang, rien ne bouge avant", () => {
  assert.deepEqual(planifierSuppression(plans, "b")!.map((r) => [r.planUuid, r.rangAvant, r.rangApres]), [["c", 3, 2], ["d", 4, 3]]);
  assert.deepEqual(planifierSuppression(plans, "d"), []);
  assert.equal(planifierSuppression(plans, "zz"), null);
});
