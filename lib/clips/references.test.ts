import test from "node:test";
import assert from "node:assert/strict";
import { ajouterReference, compacterImages, emplacementLibre, nomDepuisCode, retablirCitations, retirerReference, roleParDefaut } from "./references";

const sections = {
  subject_definitions: "<Subject 1> is Iris from <Picture 1>, a girl.\n<Subject 2> is the lamp from <Picture 2>.\n<Subject 3> is the lighthouse from <Picture 3>.",
  summary: "[reference generation] <Subject 1> holds <Subject 2> near <Subject 3>.",
  retention_analysis:
    "<Subject 1> (appears in [Shot 1]): fully_preserved - the appearance of Iris is retained.\n<Subject 2> (appears in [Shot 1]): fully_preserved - the lamp is retained.\n<Subject 3> (not cited in a shot): fully_preserved - the lighthouse is retained.",
  detailed_description: "[Shot 1] <Subject 1> raises <Subject 2>. [Shot 2] At 00:04.000, Hard cut to <Subject 3>.",
  overall_soundscape: "wind",
  non_diegetic_music: "",
};

test("compacterImages : 1..n sans trou, ancien trou rattrapé", () => {
  assert.deepEqual([...compacterImages([1, 3, 4])], [[1, 1], [3, 2], [4, 3]]);
  assert.deepEqual([...compacterImages([])], []);
});

test("retirer une image du milieu : ses lignes disparaissent, la prose reprend son nom, le reste est renuméroté", () => {
  const renum = compacterImages([1, 3]);
  const r = retirerReference(sections, { type: "picture", slot: 2, nom: "the lamp" }, renum);
  assert.equal(r.subject_definitions, "<Subject 1> is Iris from <Picture 1>, a girl.\n<Subject 2> is the lighthouse from <Picture 2>.");
  assert.equal(r.summary, "[reference generation] <Subject 1> holds the lamp near <Subject 2>.");
  assert.equal(
    r.retention_analysis,
    "<Subject 1> (appears in [Shot 1]): fully_preserved - the appearance of Iris is retained.\n<Subject 2> (not cited in a shot): fully_preserved - the lighthouse is retained.",
  );
  assert.equal(r.detailed_description, "[Shot 1] <Subject 1> raises the lamp. [Shot 2] At 00:04.000, Hard cut to <Subject 2>.");
  assert.ok(!/<(Subject|Picture) 3>/.test(Object.values(r).join("\n")));
});

test("retirer la dernière image : rien à renuméroter", () => {
  const r = retirerReference(sections, { type: "picture", slot: 3, nom: "the lighthouse" }, compacterImages([1, 2]));
  assert.equal(r.summary, "[reference generation] <Subject 1> holds <Subject 2> near the lighthouse.");
  assert.ok(!r.subject_definitions!.includes("lighthouse"));
});

test("ajouter une image : une définition et une rétention, rien dans la prose", () => {
  const r = ajouterReference({ ...sections }, { type: "picture", slot: 4, nom: "the boat" });
  assert.ok(r.subject_definitions!.endsWith("<Subject 4> is the boat from <Picture 4>."));
  assert.ok(r.retention_analysis!.endsWith("<Subject 4> (not cited in a shot): fully_preserved - the appearance of the boat is retained."));
  assert.equal(r.detailed_description, sections.detailed_description);
  const vide = ajouterReference({ subject_definitions: "", retention_analysis: "" }, { type: "picture", slot: 1, nom: "Iris" });
  assert.equal(vide.subject_definitions, "<Subject 1> is Iris from <Picture 1>.");
});

test("nomDepuisCode", () => {
  assert.equal(nomDepuisCode("CHAR_iris_phare"), "iris phare");
  assert.equal(nomDepuisCode("seul"), "seul");
});

test("ajouterReference : un effet (vfx) est repris en weak_reference", () => {
  const s = ajouterReference({}, { type: "picture", slot: 2, nom: "energie doree", vfx: true });
  assert.match(s.retention_analysis!, /^<Subject 2> \(not cited in a shot\): weak_reference - /);
});

test("emplacementLibre : un trou laissé par une vidéo est rebouché, un emplacement choisi est respecté, plein = null", () => {
  assert.equal(emplacementLibre("video", [1, 3], 3), 2);
  assert.equal(emplacementLibre("video", [1], 3, 3), 3);
  assert.equal(emplacementLibre("video", [2], 2), 1);
  // images stay 1..n: the chosen slot does not count
  assert.equal(emplacementLibre("picture", [1, 2], 6, 5), 3);
  assert.equal(emplacementLibre("video", [1, 2, 3], 3), null);
});

test("retirer puis remettre une image : la citation revient dans la prose, la rétention dit où elle apparaît", () => {
  // Removing <Picture 2> (« the lamp »): its citation becomes its name, the lighthouse moves to 2.
  const retire = retirerReference(sections, { type: "picture", slot: 2, nom: "the lamp" }, compacterImages([1, 3]));
  assert.equal(retire.detailed_description, "[Shot 1] <Subject 1> raises the lamp. [Shot 2] At 00:04.000, Hard cut to <Subject 2>.");
  // Put back by hand: it takes slot 3, its mentions become its label again.
  const remis = ajouterReference(retire, { type: "picture", slot: 3, nom: "the lamp" }, { retablir: true });
  assert.equal(remis.detailed_description, "[Shot 1] <Subject 1> raises <Subject 3>. [Shot 2] At 00:04.000, Hard cut to <Subject 2>.");
  assert.equal(remis.summary, "[reference generation] <Subject 1> holds <Subject 3> near <Subject 2>.");
  assert.ok(remis.subject_definitions!.endsWith("<Subject 3> is the lamp from <Picture 3>."));
  assert.ok(remis.retention_analysis!.endsWith("<Subject 3> (appears in [Shot 1]): fully_preserved - the appearance of the lamp is retained."));
  // Without `retablir` (addition by the iteration agent, which places its own markers): the prose does not move.
  const brut = ajouterReference(retire, { type: "picture", slot: 3, nom: "the lamp" });
  assert.equal(brut.detailed_description, retire.detailed_description);
});

test("retablirCitations : mot entier et même casse seulement, nom trop court ignoré, son et vidéo par leur label", () => {
  const s = { detailed_description: "[Shot 1] iris phare walks; the iris pharently. Iris phare waves.", subject_definitions: "<Subject 9> is iris phare." };
  const r = retablirCitations(s, { type: "picture", slot: 2, nom: "iris phare" });
  assert.equal(r.sections.detailed_description, "[Shot 1] <Subject 2> walks; the iris pharently. Iris phare waves.");
  assert.equal(r.sections.subject_definitions, s.subject_definitions);
  assert.deepEqual(r.shots, ["[Shot 1]"]);
  assert.deepEqual(retablirCitations(s, { type: "picture", slot: 2, nom: "ir" }).sections, s);
});

test("roleParDefaut : type puis nom", () => {
  assert.deepEqual(roleParDefaut("picture", { typeAsset: "decor", libelleType: "Décor", libelle: "Couloir bleu" }), { role: "Décor, Couloir bleu", retention: null });
  assert.deepEqual(roleParDefaut("picture", { typeAsset: null, libelleType: null, libelle: "x" }), { role: "Référence, x", retention: null });
});
