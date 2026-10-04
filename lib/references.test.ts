import test from "node:test";
import assert from "node:assert/strict";
import { ajouterReference, compacterImages, nomDepuisCode, retirerReference } from "./references";

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

test("retirer un son : ses lignes partent, les slots image ne bougent pas", () => {
  const s = {
    ...sections,
    subject_definitions: `${sections.subject_definitions}\n<Audio 2> is a gull.`,
    retention_analysis: `${sections.retention_analysis}\n<Audio 2>: reference - the gull.`,
  };
  const r = retirerReference(s, { type: "audio", slot: 2, nom: "a gull" });
  assert.equal(r.subject_definitions, sections.subject_definitions);
  assert.equal(r.retention_analysis, sections.retention_analysis);
  assert.equal(r.summary, sections.summary);
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
