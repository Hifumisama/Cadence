import { test } from "node:test";
import assert from "node:assert/strict";
import { controlerStructure, extraireBalisesD, extraireLabels, verifierCoherenceRefs } from "./plan-checks";

const prompt = (contenu: string) => [{ section: "detailed_description", contenu }];

test("balises <d> : langue, texte et emplacement exact", () => {
  const contenu = "She says, <d>[Français] Magnifique, n'est-ce pas ?</d> and smiles.";
  const [b] = extraireBalisesD(prompt(contenu));
  assert.ok(b);
  assert.equal(b.langue, "Français");
  assert.equal(b.texte, "Magnifique, n'est-ce pas ?");
  assert.equal(contenu.slice(b.debut, b.fin), b.texte);
});

test("balise sans langue, espaces autour du texte ignorés", () => {
  const [b] = extraireBalisesD(prompt("<d>  Bonjour  </d>"));
  assert.equal(b?.langue, null);
  assert.equal(b?.texte, "Bonjour");
});

// --- Structure des shots -------------------------------------------------

const desc = (contenu: string) => [{ section: "detailed_description", contenu }];

test("structure : plan bien formé, aucun signalement", () => {
  const p = controlerStructure(
    desc("Cinematic anime style. [Shot 1] A wide shot. [Shot 2] At 00:03.000, Hard cut to a close-up. [Shot 3] At 00:06.500, Hard cut to a low-angle."),
    9,
  );
  assert.deepEqual(p, []);
});

test("structure : durée non entière ou hors 5-10", () => {
  assert.equal(controlerStructure([], 3)[0]?.type, "duree_invalide");
  assert.equal(controlerStructure([], 11)[0]?.type, "duree_invalide");
  assert.equal(controlerStructure([], 7.5)[0]?.type, "duree_invalide");
  assert.deepEqual(controlerStructure([], 10), []);
});

test("structure : shot 1 qui démarre tard, shot suivant sans timecode", () => {
  const p = controlerStructure(desc("[Shot 1, 00:01.000–00:03.000] A wide shot. [Shot 2] A close-up."), 8).map((x) => x.type);
  assert.ok(p.includes("shot1_timecode"));
  assert.ok(p.includes("shot_timecode_manquant"));
});

test("structure : shot sous 1,5 s, timecode hors ordre et hors durée", () => {
  const court = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:01.000, Hard cut to B."), 8).map((x) => x.type);
  assert.ok(court.includes("shot_trop_court"));
  const ordre = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:04.000, Hard cut to B. [Shot 3] At 00:03.000, Hard cut to C."), 9).map((x) => x.type);
  assert.ok(ordre.includes("shot_hors_ordre"));
  const hors = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:10.000, Hard cut to B."), 8).map((x) => x.type);
  assert.ok(hors.includes("shot_hors_duree"));
});

test("structure : dernier shot trop court, aucun shot", () => {
  const dernier = controlerStructure(desc("[Shot 1] A. [Shot 2] At 00:07.000, Hard cut to B."), 8).map((x) => x.type);
  assert.ok(dernier.includes("shot_trop_court"));
  assert.equal(controlerStructure(desc("Just text."), 8)[0]?.type, "aucun_shot");
  assert.deepEqual(controlerStructure([], 8), []);
});

test("structure : la forme à intervalle des plans validés est acceptée", () => {
  const ok = controlerStructure(
    desc("[Shot 1, 00:00.000–00:02.000] A wide. [Shot 2, 00:02.000–00:05.000] A profile. [Shot 3, 00:05.000–00:07.000] A third."),
    7,
  );
  assert.deepEqual(ok, []);
  const court = controlerStructure(desc("[Shot 1, 00:00.000–00:01.000] A. [Shot 2, 00:01.000–00:07.000] B."), 7).map((x) => x.type);
  assert.deepEqual(court, ["shot_trop_court"]);
});

test("cohérence des refs : la voix d'une réplique (ref dérivée) n'a pas à être citée", () => {
  const sections = [
    { section: "subject_definitions", contenu: "<Subject 1> is Maya from <Picture 1>." },
    { section: "detailed_description", contenu: "[Shot 1] <Subject 1> says <d>[Français] Pas un bruit.</d> A door creaks <Audio 2>." },
  ];
  const refs = [
    { type: "picture" as const, slot: 1 },
    { type: "audio" as const, slot: 2 },
  ];
  // La prise de la réplique (slot 1) : déclarée, jamais « non citée ».
  assert.deepEqual(verifierCoherenceRefs(sections, refs, [{ type: "audio", slot: 1 }]), { labelsOrphelins: [], refsNonCitees: [] });
  // Un bruitage de plan_refs non cité reste signalé, même avec des voix dérivées.
  const sansPorte = [sections[0]!, { section: "detailed_description", contenu: "[Shot 1] <Subject 1> says <d>[Français] Pas un bruit.</d>" }];
  assert.deepEqual(verifierCoherenceRefs(sansPorte, refs, [{ type: "audio", slot: 1 }]).refsNonCitees, ["Audio:2"]);
  // Citer la voix reste possible (déclarée par dérivation : pas d'orphelin)…
  const citeVoix = [sections[0]!, { section: "detailed_description", contenu: "[Shot 1] <Subject 1> speaks <Audio 1>. A door creaks <Audio 2>." }];
  assert.deepEqual(verifierCoherenceRefs(citeVoix, refs, [{ type: "audio", slot: 1 }]).labelsOrphelins, []);
  // … mais un label qui ne correspond à rien reste orphelin.
  assert.deepEqual(verifierCoherenceRefs(citeVoix, refs, []).labelsOrphelins, ["Audio:1"]);
});

test("extraireLabels : labels cités, dans l'ordre, sans doublon", () => {
  assert.deepEqual(extraireLabels("<Subject 1> from <Picture 1> and <Picture  2>, <Picture 1> again, <Audio 3> <Video 1>"), [
    "Picture 1",
    "Picture 2",
    "Audio 3",
    "Video 1",
  ]);
  assert.deepEqual(extraireLabels("aucun label"), []);
});
