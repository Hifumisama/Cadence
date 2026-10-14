import assert from "node:assert/strict";
import { test } from "node:test";
import { resumerChantier, scenesTouchees, type DecisionPourBarre, type Segment } from "./affichage";
import { planUuid, vueLeSel } from "./fixture-le-sel";
import type { Operation } from "./types";

const vue = vueLeSel();
const couper = (n: number): Operation => ({ type: "couper_plan", planUuid: planUuid(n) });
const duree = (n: number, secondes: number): Operation => ({ type: "duree_plan", planUuid: planUuid(n), secondes });
const texte = (segments: Segment[]) => segments.map((s) => s.t).join("");

test("scènes touchées : seulement celles que le brouillon touche, plans dans l'ordre du brouillon", () => {
  assert.deepEqual(scenesTouchees(vue, []), []);
  // Parcours « les deux » : P04 coupé, scène 1 accélérée, scène 3 resserrée : la scène 2 n'apparaît pas.
  const ops = [couper(4), duree(1, 6), duree(2, 6), duree(3, 7), duree(5, 5), couper(11), duree(13, 12)];
  const scenes = scenesTouchees(vue, ops);
  assert.deepEqual(scenes.map((s) => s.titre), ["Le port à l'aube", "Le départ"]);
  const [s1, s3] = scenes;
  assert.equal(s1!.dureeAvant, 45);
  assert.equal(s1!.dureeApres, 24, "10→6, 9→6, 10→7, P04 coupé, 8→5");
  assert.equal(s3!.dureeAvant, 10 + 15 + 15 + 10);
  assert.equal(s3!.dureeApres, 15 + 12 + 10);
  assert.equal(s1!.plans.find((p) => p.handle === "P04")!.coupe, true);
  assert.equal(s1!.plans.find((p) => p.handle === "P01")!.duree, 6);
  assert.equal(s1!.plans.find((p) => p.handle === "P01")!.dureeOriginale, 10);
});

test("scènes touchées : une fiche à réécrire touche la scène de son plan, marquée « fiche »", () => {
  const scenes = scenesTouchees(vue, [{ type: "refondre_fiche", planUuid: planUuid(7), consigne: "réplique plus sobre" }]);
  assert.deepEqual(scenes.map((s) => s.titre), ["La lettre"]);
  const p07 = scenes[0]!.plans.find((p) => p.handle === "P07")!;
  assert.equal(p07.fiche, true);
});

test("scènes touchées : un déplacement est signalé, le plan reste dans sa scène d'origine", () => {
  const scenes = scenesTouchees(vue, [{ type: "deplacer_plan", planUuid: planUuid(9), position: { apresPlanUuid: planUuid(3) } }]);
  assert.deepEqual(scenes.map((s) => s.titre), ["La lettre"]);
  assert.equal(scenes[0]!.plans.find((p) => p.handle === "P09")!.deplace, true);
});

const decision = (id: string, statut: DecisionPourBarre["statut"], operations: Operation[], extra: Partial<DecisionPourBarre> = {}): DecisionPourBarre => ({ id, statut, aReverifier: false, operations, ecrasements: 0, ...extra });

test("barre du bas : rien en brouillon → glissière inerte", () => {
  const r = resumerChantier([], 154, 120);
  assert.equal(r.inerte, true);
  assert.equal(r.danger, false);
  assert.match(texte(r.segments), /Rien en brouillon/);
});

test("barre du bas : le parcours « ressenti » (3 décisions, 2:00 pile), glissière libre", () => {
  const r = resumerChantier([decision("D1", "retenue", [couper(5), couper(10), couper(2)]), decision("D2", "retenue", [duree(1, 6), duree(3, 7)]), decision("D3", "attention", [{ type: "refondre_fiche", planUuid: planUuid(7), consigne: "x" }])], 120, 120);
  assert.equal(texte(r.segments), "3 décisions : supprime 3 plans, raccourcit 2 durées, réécrit 1 fiche ensuite · 2:00 pour 2:00");
  assert.equal(r.inerte, false);
  assert.equal(r.danger, false);
});

test("barre du bas : un écrasement passe la glissière en danger et le dit ; un conflit la rend inerte et dit ce qu'il manque", () => {
  const ecr = resumerChantier([decision("D1", "attention", [couper(4), couper(7)], { ecrasements: 2 })], 131, 120);
  assert.equal(ecr.danger, true);
  assert.equal(ecr.inerte, false);
  assert.match(texte(ecr.segments), /supprime 2 plans.*2:11 pour 2:00 · écrase 2 éléments validés/);
  assert.equal(ecr.segments.at(-1)!.rouge, true);

  const conflit = resumerChantier([decision("D1", "conflit", [couper(4)]), decision("D2", "conflit", [couper(5)])], 146, 120);
  assert.equal(conflit.inerte, true);
  assert.match(texte(conflit.segments), /^Il manque : trancher 2 conflits avant d'appliquer\. 2 décisions/);

  const relire = resumerChantier([decision("D1", "attention", [couper(4)], { aReverifier: true })], 146, null);
  assert.equal(relire.inerte, true);
  assert.match(texte(relire.segments), /relire D1 \(ce qu'elle vise a changé\)\. 1 décision : supprime 1 plan · 2:26$/);
});

test("barre du bas : un plan coupé et raccourci ne compte que comme coupé", () => {
  const r = resumerChantier([decision("D1", "retenue", [couper(5), duree(5, 6), duree(1, 6)])], 140, 120);
  assert.match(texte(r.segments), /supprime 1 plan, raccourcit 1 durée/);
});

test("3c : un plan ajouté rejoint la scène de son voisin ; la barre dit les ajouts et les fiches réécrites", () => {
  const ajout: Operation = { type: "ajouter_plan", ref: "11111111-1111-4111-8111-111111111111", position: { apresPlanUuid: planUuid(3) }, titre: "Transition", description: "d", secondes: 6 };
  const scenes = scenesTouchees(vue, [ajout]);
  assert.equal(scenes.length, 1);
  const nouveau = scenes[0]!.plans.find((p) => p.ajoute);
  assert.ok(nouveau);
  assert.equal(nouveau!.fiche, true);
  assert.equal(scenes[0]!.dureeApres, scenes[0]!.dureeAvant + 6);

  const r = resumerChantier([decision("D1", "retenue", [ajout, { type: "refondre_fiche", planUuid: planUuid(7), consigne: "" }])], 160, 120);
  assert.match(texte(r.segments), /ajoute 1 plan, réécrit 2 fiches ensuite/);
});
