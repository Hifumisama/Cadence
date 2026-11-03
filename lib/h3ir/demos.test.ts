import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSETS_DEMOS,
  CLES_DEMOS,
  DESCRIPTION_DEMOS_AVEC_REPLIQUES,
  DESCRIPTION_DEMOS_SANS_REPLIQUE,
  NARRATION_CREATIVITE_DEMOS,
  NARRATION_DEMOS,
  SCENE_CREATIVITE,
  SCENE_STYLES,
  cheminDemo,
  cleDemoDuPlan,
  planifierDemos,
} from "./demos";
import { briefDepuisPlan } from "./brief";
import { slugifyCode, libelleAsset } from "../assetCode";

test("12 démos : 8 de style puis 4 de créativité, noms de fichiers distincts", () => {
  assert.equal(CLES_DEMOS.length, 12);
  assert.equal(new Set(CLES_DEMOS).size, 12);
  assert.deepEqual(CLES_DEMOS.slice(0, 2), ["style-aucun", "style-cameron"]);
  assert.deepEqual(CLES_DEMOS.slice(8), ["creativite-restrained", "creativite-balanced", "creativite-bold", "creativite-extreme"]);
  assert.equal(cheminDemo("style-wong", "mp4"), "mises-en-scene/style-wong.mp4");
});

test("les 12 plans : la clé de chaque plan est retrouvée depuis sa scène et ses réglages, sans doublon", () => {
  const plans = planifierDemos();
  assert.equal(plans.length, 12);
  assert.deepEqual(plans.map((p) => p.cle), [...CLES_DEMOS]);
  for (const p of plans) assert.equal(cleDemoDuPlan({ scene: p.scene, creativite: p.creativite, styleCamera: p.styleCamera }), p.cle, p.titre);
  assert.equal(plans.filter((p) => p.scene === SCENE_STYLES).length, 8);
  assert.equal(plans.filter((p) => p.scene === SCENE_CREATIVITE).length, 4);
  // Les séries ont la bonne description : répliques pour les styles, aucune pour la créativité.
  assert.ok(plans.filter((p) => p.scene === SCENE_STYLES).every((p) => p.description === DESCRIPTION_DEMOS_AVEC_REPLIQUES));
  assert.ok(plans.filter((p) => p.scene === SCENE_CREATIVITE).every((p) => p.description === DESCRIPTION_DEMOS_SANS_REPLIQUE));
});

test("cleDemoDuPlan : réglages vides = défauts ; réglages qui ne vont pas avec la série, ou plan hors série = null", () => {
  assert.equal(cleDemoDuPlan({ scene: SCENE_STYLES, creativite: null, styleCamera: null }), "style-aucun");
  assert.equal(cleDemoDuPlan({ scene: SCENE_STYLES, creativite: "balanced", styleCamera: "villeneuve" }), "style-villeneuve");
  assert.equal(cleDemoDuPlan({ scene: SCENE_STYLES, creativite: "bold", styleCamera: "villeneuve" }), null, "un plan de style reste à créativité équilibrée");
  assert.equal(cleDemoDuPlan({ scene: SCENE_CREATIVITE, creativite: null, styleCamera: null }), "creativite-balanced");
  assert.equal(cleDemoDuPlan({ scene: SCENE_CREATIVITE, creativite: "extreme", styleCamera: "aucun" }), "creativite-extreme");
  assert.equal(cleDemoDuPlan({ scene: SCENE_CREATIVITE, creativite: "bold", styleCamera: "wong" }), null, "un plan de créativité n'a pas de style");
  assert.equal(cleDemoDuPlan({ scene: "Autre", creativite: null, styleCamera: null }), null);
  assert.equal(cleDemoDuPlan({ scene: null, creativite: null, styleCamera: null }), null);
});

test("la description ne donne aucune consigne de lumière, de couleur, de cadrage ni de caméra (le style doit rester libre)", () => {
  const interdits = [
    "lumière", "lumiere", "éclair", "ombre", "couleur", "teinte", "nuit", "soleil", "néon", "contre-jour", "reflet",
    "gros plan", "plan large", "plan serré", "cadr", "caméra", "camera", "travelling", "zoom", "panoram", "plongée", "angle",
    "light", "shadow", "colour", "color", "close-up", "wide shot", "tracking", "handheld",
  ];
  const texte = DESCRIPTION_DEMOS_AVEC_REPLIQUES.toLowerCase();
  for (const mot of interdits) assert.ok(!texte.includes(mot), `« ${mot} » ne doit pas figurer dans la description`);
});

test("références : trois, neutres (lumière douce et uniforme), rôles déclarés, locuteurs retrouvés au registre", () => {
  assert.equal(ASSETS_DEMOS.length, 3);
  for (const a of ASSETS_DEMOS) {
    assert.match(a.promptGeneration, /soft even diffuse lighting/, a.code);
    assert.ok(a.description.length > 20);
  }
  assert.deepEqual(ASSETS_DEMOS.map((a) => a.role), ["subject", "subject", "environment"]);
  // Les noms des locuteurs de la description se relient aux libellés du registre (même règle que lib/h3ir/brief.ts).
  const slugs = new Set(ASSETS_DEMOS.flatMap((a) => [slugifyCode(libelleAsset(a)), slugifyCode(a.code.replace(/^[A-Z]+_/, ""))]));
  assert.ok(slugs.has(slugifyCode("L'homme")) && slugs.has(slugifyCode("La femme")));
});

test("le brief des deux séries : répliques extraites et normalisées pour les styles, aucune pour la créativité, trois références", () => {
  const refs = ASSETS_DEMOS.map((a, i) => ({
    type: "picture" as const,
    slot: i + 1,
    code: a.code,
    label: a.label,
    typeAsset: a.type,
    description: a.description,
    chemin: `/m/${a.code}.png`,
  }));
  const personnages = ASSETS_DEMOS.filter((a) => a.type === "personnage").map((a) => ({ code: a.code, label: a.label, voix: null }));
  const base = { langueDialogues: "French", codesVoixOff: [], personnages, references: refs, scene: { titre: "Styles", ambiance: null } };
  const avec = briefDepuisPlan({ ...base, plan: { description: DESCRIPTION_DEMOS_AVEC_REPLIQUES, dureeSecondes: 10, seed: "424242424242" } }, { director: "villeneuve" });
  assert.ok(avec.brief, avec.refus ?? "");
  assert.deepEqual(avec.brief.dialogue.map((d) => [d.speaker, d.text]), [["L'homme", "Tu es complètement folle!"], ["La femme", "Viens, on n'a pas le temps."]]);
  assert.equal(avec.brief.director, "villeneuve");
  assert.equal(avec.brief.assets.length, 3);
  assert.ok(!avec.brief.intent.includes("folle"), "les répliques ne sont pas dans l'intent");
  const sans = briefDepuisPlan({ ...base, plan: { description: DESCRIPTION_DEMOS_SANS_REPLIQUE, dureeSecondes: 10, seed: "424242424242" } }, { creativity: "bold", director: "aucun" });
  assert.ok(sans.brief, sans.refus ?? "");
  assert.deepEqual(sans.brief.dialogue, []);
  assert.equal(sans.brief.creativity, "bold");
  assert.equal("director" in sans.brief, false);
  assert.ok(sans.brief.intent.startsWith(NARRATION_CREATIVITE_DEMOS));
});
