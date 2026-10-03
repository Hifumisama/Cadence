import test from "node:test";
import assert from "node:assert/strict";
import { construireMatrice, type CitationAsset, type PlanMatrice } from "./matrice-assets";

const plans: PlanMatrice[] = [1, 2, 3, 4].map((n) => ({ uuid: `p${n}`, position: n, titre: `Plan ${n}` }));
const c = (assetCode: string, assetType: string, planUuid: string): CitationAsset => ({ assetCode, assetType, planUuid });

test("matrice : un asset par ligne, présent dans les plans qui le citent, trous entre deux plans qui l'ont", () => {
  const m = construireMatrice(plans, [c("CHAR_iris", "personnage", "p1"), c("CHAR_iris", "personnage", "p2"), c("CHAR_iris", "personnage", "p4"), c("DEC_phare", "decor", "p1")]);
  const iris = m.find((l) => l.code === "CHAR_iris")!;
  assert.deepEqual(iris.presents, [true, true, false, true]);
  assert.equal(iris.nbPlans, 3);
  assert.deepEqual(iris.trous, [3], "le plan 3 n'a pas la référence alors que 2 et 4 l'ont");
  assert.deepEqual(m.find((l) => l.code === "DEC_phare")!.trous, []);
});

test("matrice : regroupée par type (personnages d'abord), du plus cité au moins cité ; voix et sons exclus", () => {
  const m = construireMatrice(plans, [c("PROP_clef", "prop", "p1"), c("DEC_phare", "decor", "p1"), c("DEC_phare", "decor", "p2"), c("CHAR_iris", "personnage", "p1"), c("VOICE_x", "voix", "p1"), c("SFX_x", "sfx", "p1")]);
  assert.deepEqual(m.map((l) => l.code), ["CHAR_iris", "DEC_phare", "PROP_clef"]);
});

test("matrice : une citation dans un plan d'un autre épisode n'ajoute rien, un asset non cité n'a pas de ligne", () => {
  const m = construireMatrice(plans, [c("CHAR_x", "personnage", "ailleurs")]);
  assert.equal(m.length, 1);
  assert.equal(m[0]!.nbPlans, 0);
});
