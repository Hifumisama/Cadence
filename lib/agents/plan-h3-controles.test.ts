import assert from "node:assert/strict";
import { test } from "node:test";
import { controlerSortiePlanH3, decouperShots, resumeControles, secondesDeTimecode, type SortiePlanH3 } from "./plan-h3-controles";

const ctx = { codesRegistre: ["CHAR_maya", "DEC_couloir"], repliques: [{ texte: "Encore du sel." }] };

const bonne: SortiePlanH3 = {
  titre: "Le couloir",
  dureeSecondes: 10,
  sujets: [
    { asset: "CHAR_maya", role: "Maya", definition: "Maya {picture}, walking slowly" },
    { asset: "DEC_couloir", role: "Décor", definition: "the corridor {picture}, dimly lit" },
  ],
  summary: "[reference generation] [[CHAR_maya]] walks through [[DEC_couloir]].",
  detailed_description:
    "[Shot 1] A low static shot follows [[CHAR_maya]] in [[DEC_couloir]]. She says <d>[French] Encore du sel.</d>\n[Shot 2] Hard cut. At 00:05.000, a close-up on her hands.",
  overall_soundscape: "Drip.",
  non_diegetic_music: "N/A",
  repliques: [{ repliqueId: "u1" }],
  notes: "",
};

test("timecodes : formats acceptés et refusés", () => {
  assert.equal(secondesDeTimecode("00:04.500"), 4.5);
  assert.equal(secondesDeTimecode("01:02"), 62);
  assert.equal(secondesDeTimecode("abc"), null);
});

test("shots : découpage, numéros, timecodes, hard cut", () => {
  const s = decouperShots(bonne.detailed_description);
  assert.deepEqual(s.map((x) => x.numero), [1, 2]);
  assert.equal(s[0]!.timecode, null);
  assert.equal(s[1]!.timecode, 5);
  assert.equal(s[1]!.hardCut, true);
});

test("une sortie conforme ne produit aucune erreur", () => {
  const r = resumeControles(controlerSortiePlanH3(bonne, ctx));
  assert.deepEqual(r, { erreurs: 0, alertes: 0, infos: 0 });
});

test("durée, asset inventé, jeton {picture}, label écrit à la main", () => {
  const mauvaise: SortiePlanH3 = {
    ...bonne,
    dureeSecondes: 4,
    sujets: [{ asset: "PROP_lettre", role: "x", definition: "a letter <Picture 1>" }],
    summary: "[reference generation] [[PROP_lettre]] and <Subject 1>",
  };
  const regles = controlerSortiePlanH3(mauvaise, ctx).filter((x) => x.niveau === "erreur").map((x) => x.regle);
  for (const attendu of ["duree", "asset-inconnu", "definition", "labels", "placeholder"]) assert.ok(regles.includes(attendu), attendu);
});

test("placeholder hors sujets, sujet non cité, plus de 6 sujets", () => {
  const p = controlerSortiePlanH3({ ...bonne, detailed_description: bonne.detailed_description.replace("[[DEC_couloir]]", "[[CHAR_x]]").replace("At 00:05.000", "At 00:05.000 [[CHAR_maya]]") }, ctx);
  assert.ok(p.some((x) => x.regle === "placeholder" && x.message.includes("CHAR_x")));
  const trop = { ...bonne, sujets: Array.from({ length: 7 }, (_, i) => ({ asset: "CHAR_maya", role: "r", definition: `s${i} {picture}` })) };
  assert.ok(controlerSortiePlanH3(trop, ctx).some((x) => x.regle === "sujets" && x.niveau === "erreur"));
});

test("shots : timecode manquant, non croissant, trop court, dépassant la durée", () => {
  const faux = (d: string) => controlerSortiePlanH3({ ...bonne, detailed_description: d }, { ...ctx, repliques: [] }).filter((x) => x.niveau === "erreur" && x.regle === "shots");
  assert.ok(faux("[Shot 1] a [Shot 2] Hard cut b").length > 0, "timecode manquant");
  assert.ok(faux("[Shot 1] a [Shot 2] Hard cut At 00:05.000 b [Shot 3] Hard cut At 00:04.000 c").length > 0, "non croissant");
  assert.ok(faux("[Shot 1] a [Shot 2] Hard cut At 00:01.000 b").length > 0, "shot trop court");
  assert.ok(faux("[Shot 1] a [Shot 2] Hard cut At 00:12.000 b").length > 0, "au-delà de la durée");
  assert.equal(faux("").length, 1, "aucun shot");
});

test("dialogue : le verbatim est exigé, la balise <d> aussi", () => {
  const p = controlerSortiePlanH3({ ...bonne, detailed_description: bonne.detailed_description.replace("Encore du sel.", "Encore du sable.") }, ctx);
  assert.ok(p.some((x) => x.regle === "verbatim"));
  const sans = controlerSortiePlanH3({ ...bonne, detailed_description: bonne.detailed_description.replace(/<\/?d>/g, "") }, ctx);
  assert.ok(sans.some((x) => x.regle === "dialogue"));
});

test("notes de l'agent : remontées en information ; mots par seconde en alerte", () => {
  const p = controlerSortiePlanH3({ ...bonne, notes: "Il faudrait PROP_lettre.", summary: bonne.summary + " about 3 words per second" }, ctx);
  assert.ok(p.some((x) => x.niveau === "info" && x.message.includes("PROP_lettre")));
  assert.ok(p.some((x) => x.regle === "mots-seconde"));
});
