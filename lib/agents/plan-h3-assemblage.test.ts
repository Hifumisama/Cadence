import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblerPlanH3, timecode } from "./plan-h3-assemblage";
import type { SortiePlanH3 } from "./plan-h3-controles";

// Brouillon de l'exemple « dialogue » (plan réel validé en production, agents/skills/plan-h3/exemples/dialogue.md).
const dialogue: SortiePlanH3 = {
  titre: "La sentence — la menace",
  dureeSecondes: 7,
  references: [
    { asset: "CHAR_tenanciere", nature: "image", role: "Tenancière, penchée, menace", nom: "the Tenancière", definition: "leaning in close, her stride reduced to a bare, controlled inclination without a full stop.", retentionNote: "her gown, expression, and controlled near-stillness are retained." },
    { asset: "CHAR_maya", nature: "image", role: "Maya, sous la menace", nom: "Maya", definition: "pinned by the proximity and the threat.", retentionNote: "Maya's identity and fear are retained." },
    { asset: "DEC_couloir_bois", nature: "image", role: "Décor, couloir bleu nuit", nom: "the narrow wooden corridor", definition: "its constant deep indigo light now edged with harder shadow.", retentionNote: "the corridor's indigo tone, now hard-edged, is retained." },
  ],
  summary:
    "The target video holds an extreme close-up as [[CHAR_tenanciere]] opens the episode's central threat to [[CHAR_maya]] within [[DEC_couloir_bois]], never fully halting her motion.",
  ouverture: "Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast, a heavy blue-black shadow cast across Maya's face.",
  shots: [
    {
      debutSecondes: 0,
      texte:
        "An extreme close-up frames [[CHAR_tenanciere]], the Tenancière (S1), leaning in until her face is only centimeters from [[CHAR_maya]], Maya, within [[DEC_couloir_bois]], her stride slowing to its barest inclination without ever stopping outright. Her voice drops to a slow, glacial murmur, each word measured and unhurried: <d>[Français] Demain, au lever du soleil, si l'or n'est pas sur mon bureau, je ne perdrai plus mon temps avec tes danses.</d> Maya's face, half in hard indigo shadow, holds rigid under the proximity, her breath shallow.",
    },
  ],
  overall_soundscape: "Near-total silence surrounds the murmured threat, Maya's breath tight and controlled.",
  non_diegetic_music: "A single low, sustained cello note begins to hold unresolved beneath the threat, barely swelling.",
  repliques: [{ repliqueId: "u1" }],
  assetsManquants: [],
  notes: "",
};

const ATTENDU_DIALOGUE = `subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, leaning in close, her stride reduced to a bare, controlled inclination without a full stop.
<Subject 2> is Maya from <Picture 2>, pinned by the proximity and the threat.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light now edged with harder shadow.

summary:
[reference generation] The target video holds an extreme close-up as <Subject 1> opens the episode's central threat to <Subject 2> within <Subject 3>, never fully halting her motion.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - her gown, expression, and controlled near-stillness are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - Maya's identity and fear are retained.
<Subject 3> (appears in [Shot 1]): fully_preserved - the corridor's indigo tone, now hard-edged, is retained.

detailed_description:
Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast, a heavy blue-black shadow cast across Maya's face. [Shot 1] An extreme close-up frames <Subject 1>, the Tenancière (S1), leaning in until her face is only centimeters from <Subject 2>, Maya, within <Subject 3>, her stride slowing to its barest inclination without ever stopping outright. Her voice drops to a slow, glacial murmur, each word measured and unhurried: <d>[Français] Demain, au lever du soleil, si l'or n'est pas sur mon bureau, je ne perdrai plus mon temps avec tes danses.</d> Maya's face, half in hard indigo shadow, holds rigid under the proximity, her breath shallow.

overall_soundscape:
Near-total silence surrounds the murmured threat, Maya's breath tight and controlled.

non_diegetic_music:
A single low, sustained cello note begins to hold unresolved beneath the threat, barely swelling.`;

test("référence : le brouillon de l'exemple dialogue redonne exactement le prompt validé", () => {
  const r = assemblerPlanH3(dialogue, { slotsAudioPris: [1] });
  assert.equal(r.texte, ATTENDU_DIALOGUE);
  assert.deepEqual(r.problemes, []);
  assert.deepEqual(r.refs.map((x) => [x.asset, x.slot, x.label]), [["CHAR_tenanciere", 1, "<Subject 1>"], ["CHAR_maya", 2, "<Subject 2>"], ["DEC_couloir_bois", 3, "<Subject 3>"]]);
});

test("timecode : MM:SS.mmm", () => {
  assert.equal(timecode(0), "00:00.000");
  assert.equal(timecode(3.5), "00:03.500");
  assert.equal(timecode(62.25), "01:02.250");
});

const multi: SortiePlanH3 = {
  ...dialogue,
  dureeSecondes: 9,
  repliques: [],
  references: [
    { asset: "CHAR_maya", nature: "image", role: "Maya", nom: "Maya", definition: "running" },
    { asset: "DEC_couloir_bois", nature: "image", role: "Décor", nom: "the corridor", definition: "" },
  ],
  summary: "[reference generation] [[CHAR_maya]] runs through [[DEC_couloir_bois]].",
  shots: [
    { debutSecondes: 0, texte: "A wide shot of [[CHAR_maya]] in [[DEC_couloir_bois]]." },
    { debutSecondes: 3, texte: "a low-angle shot of her feet." },
    { debutSecondes: 6.5, texte: "At 00:06.500, Hard cut to a close-up of [[CHAR_maya]]." },
  ],
};

test("shots : numéros, timecodes et « Hard cut to » posés par le code ; ce que le modèle écrit en double est retiré", () => {
  const r = assemblerPlanH3(multi, { slotsAudioPris: [] });
  const d = r.sections.detailed_description;
  assert.match(d, /\[Shot 1\] A wide shot of <Subject 1> in <Subject 2>\./);
  assert.match(d, /\[Shot 2\] At 00:03\.000, Hard cut to a low-angle shot of her feet\./);
  assert.match(d, /\[Shot 3\] At 00:06\.500, Hard cut to a close-up of <Subject 1>\./);
  assert.equal((d.match(/Hard cut/g) ?? []).length, 2);
});

test("summary : le préfixe écrit par le modèle est remplacé ; définition vide et point final", () => {
  const r = assemblerPlanH3(multi, { slotsAudioPris: [] });
  assert.equal(r.sections.summary, "[reference generation] <Subject 1> runs through <Subject 2>.");
  assert.equal(r.sections.subject_definitions, "<Subject 1> is Maya from <Picture 1>, running.\n<Subject 2> is the corridor from <Picture 2>.");
});

test("retention : « appears in » calculé par shot ; note par défaut", () => {
  const r = assemblerPlanH3(multi, { slotsAudioPris: [] });
  assert.equal(
    r.sections.retention_analysis,
    "<Subject 1> (appears in [Shot 1], [Shot 3]): fully_preserved - the appearance of Maya is retained.\n<Subject 2> (appears in [Shot 1]): fully_preserved - the appearance of the corridor is retained.",
  );
});

const avecSon: SortiePlanH3 = {
  ...multi,
  references: [...multi.references, { asset: "SFX_porte", nature: "son", role: "Porte qui claque", nom: "a heavy door slam", definition: "a single hard impact" }],
  overall_soundscape: "overall_soundscape: Wind, then [[SFX_porte]] at the end.",
};

test("son : <Audio k> sur un slot que les voix n'occupent pas, préfixe « + audio reference », ligne de rétention", () => {
  const r = assemblerPlanH3(avecSon, { slotsAudioPris: [1] });
  assert.equal(r.refs[2]!.label, "<Audio 2>");
  assert.match(r.sections.subject_definitions, /<Audio 2> is a heavy door slam, a single hard impact\.$/);
  assert.match(r.sections.summary, /^\[reference generation \+ audio reference\]/);
  assert.match(r.sections.retention_analysis, /<Audio 2>: reference - the character of a heavy door slam is referenced without copying the signal\.$/);
  assert.equal(r.sections.overall_soundscape, "Wind, then <Audio 2> at the end.");
});

test("dégradation : plus de slot audio libre → le son est décrit en prose, avec une alerte", () => {
  const r = assemblerPlanH3(avecSon, { slotsAudioPris: [1, 2, 3] });
  assert.equal(r.refs[2]!.label, null);
  assert.equal(r.sections.overall_soundscape, "Wind, then a heavy door slam at the end.");
  assert.doesNotMatch(r.sections.subject_definitions, /Audio/);
  assert.match(r.sections.summary, /^\[reference generation\] /);
  assert.ok(r.problemes.some((p) => p.regle === "degradation"));
});

test("marqueurs : espaces tolérés, [CODE] simple accepté pour un code connu, code inconnu signalé", () => {
  const r = assemblerPlanH3(
    { ...multi, shots: [{ debutSecondes: 0, texte: "[[ CHAR_maya ]] and [DEC_couloir_bois] and [[PROP_x]]." }, ...multi.shots.slice(1)] },
    { slotsAudioPris: [] },
  );
  assert.match(r.sections.detailed_description, /\[Shot 1\] <Subject 1> and <Subject 2> and \[\[PROP_x\]\]\./);
  assert.ok(r.problemes.some((p) => p.regle === "placeholder" && p.niveau === "erreur" && p.message.includes("PROP_x")));
});

test("plus de 6 images : les suivantes sont décrites en prose, avec une alerte", () => {
  const refs = Array.from({ length: 7 }, (_, i) => ({ asset: `PROP_${i}`, nature: "image" as const, role: "r", nom: `item ${i}`, definition: "" }));
  const r = assemblerPlanH3(
    { ...multi, references: refs, summary: "[[PROP_6]]", shots: [{ debutSecondes: 0, texte: "[[PROP_0]] and [[PROP_6]]." }] },
    { slotsAudioPris: [] },
  );
  assert.equal(r.refs.filter((x) => x.label).length, 6);
  assert.match(r.sections.detailed_description, /<Subject 1> and item 6\./);
  assert.ok(r.problemes.some((p) => p.regle === "degradation"));
});

test("un label écrit à la main qui ne correspond à rien remonte en alerte", () => {
  const r = assemblerPlanH3({ ...multi, summary: "[[CHAR_maya]] and <Subject 5>" }, { slotsAudioPris: [] });
  assert.ok(r.problemes.some((p) => p.regle === "label-residuel" && p.message.includes("<Subject 5>")));
});

test("coupe écrite par le modèle : retirée quand elle se retire proprement, article mis en minuscule", () => {
  const avec = (texte: string) => assemblerPlanH3({ ...multi, shots: [multi.shots[0]!, { debutSecondes: 3, texte }] }, { slotsAudioPris: [] }).sections.detailed_description;
  assert.match(avec("a sudden cut to an extreme close-up of her feet."), /\[Shot 2\] At 00:03\.000, Hard cut to an extreme close-up of her feet\./);
  assert.match(avec("A hard cut to a wide shot."), /Hard cut to a wide shot\./);
  assert.match(avec("The shot cuts to a close-up."), /Hard cut to a close-up\./);
  assert.match(avec("A low-angle shot of her feet."), /Hard cut to a low-angle shot of her feet\./);
  assert.match(avec("At 00:03.000, Hard cut to a close-up."), /At 00:03\.000, Hard cut to a close-up\./);
});

test("rétention sans note : la note par défaut suit le niveau choisi", () => {
  const r = assemblerPlanH3(
    { ...multi, references: [{ ...multi.references[0]!, retention: "partially_preserved" }, { ...multi.references[1]!, retention: "weak_reference" }] },
    { slotsAudioPris: [] },
  );
  assert.match(r.sections.retention_analysis, /partially_preserved - Maya is used with some of its traits changed in this shot\./);
  assert.match(r.sections.retention_analysis, /weak_reference - only a general resemblance to the corridor is kept\./);
});
