import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSETS_DEMOS,
  CLES_DEMOS,
  DESCRIPTION_DEMOS_AVEC_REPLIQUES,
  NARRATION_CREATIVITE_DEMOS,
  cheminDemo,
} from "./demos";
import { briefDepuisPlan } from "./brief";
import { slugifyCode, libelleAsset } from "../assets/assetCode";

test("12 démos : 8 de style puis 4 de créativité, noms de fichiers distincts", () => {
  assert.equal(CLES_DEMOS.length, 12);
  assert.equal(new Set(CLES_DEMOS).size, 12);
  assert.deepEqual(CLES_DEMOS.slice(0, 2), ["style-aucun", "style-cameron"]);
  assert.deepEqual(CLES_DEMOS.slice(8), ["creativite-restrained", "creativite-balanced", "creativite-bold", "creativite-extreme"]);
  assert.equal(cheminDemo("style-wong", "mp4"), "mises-en-scene/style-wong.mp4");
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
  const sans = briefDepuisPlan({ ...base, plan: { description: NARRATION_CREATIVITE_DEMOS, dureeSecondes: 10, seed: "424242424242" } }, { creativity: "bold", director: "aucun" });
  assert.ok(sans.brief, sans.refus ?? "");
  assert.deepEqual(sans.brief.dialogue, []);
  assert.equal(sans.brief.creativity, "bold");
  assert.equal("director" in sans.brief, false);
  assert.ok(sans.brief.intent.startsWith(NARRATION_CREATIVITE_DEMOS));
});
