import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill, variantesDuGuide } from "./skills";
import { variantePromptAsset } from "./variantes";
import { valider } from "./validation";

// Le skill prompt-asset sert les images ET les sons (asset `sfx`) : le guide
// Stable Audio est chargé avec les deux autres, et le schéma accepte la durée.

const image = { reflexion: "Brouillon.", methode: "generation", raisonMethode: "Pas de parent.", promptGeneration: "A weathered stone lighthouse at dusk.", remarques: [] };
const sfx = {
  reflexion: "Brouillon.",
  methode: "generation",
  raisonMethode: "Un son généré par Stable Audio.",
  promptGeneration: "Heavy wooden door creaking open slowly on a rusty hinge, long low groan, echoing hollow stone interior.",
  dureeSecondes: 4,
  remarques: [],
};

const guidesDe = (s: ReturnType<typeof chargerSkill>) => s.fichiers.filter((f) => f.includes("/guide-")).map((f) => f.split("/").pop());

test("prompt-asset : sans variante, tous les guides s'assemblent, dans l'ordre alphabétique", () => {
  const s = chargerSkill("prompt-asset");
  assert.deepEqual(guidesDe(s), ["guide-krea2.md", "guide-qwen-edit.md", "guide-stable-audio-sfx.md"]);
  assert.deepEqual(s.guidesIgnores, []);
  assert.ok(s.systeme.includes("Stable Audio 3"));
  assert.ok(s.systeme.includes("dureeSecondes"), "la règle ET le schéma parlent de la durée");
  assert.ok(!s.systeme.includes("<!-- variantes"), "la déclaration de variantes est retirée du prompt");
});

test("prompt-asset : chaque variante ne charge que ses guides", () => {
  const sfx = chargerSkill("prompt-asset", undefined, { variante: "sfx" });
  assert.deepEqual(guidesDe(sfx), ["guide-stable-audio-sfx.md"]);
  const gen = chargerSkill("prompt-asset", undefined, { variante: "generation" });
  assert.deepEqual(guidesDe(gen), ["guide-krea2.md"]);
  const edi = chargerSkill("prompt-asset", undefined, { variante: "edition" });
  assert.deepEqual(guidesDe(edi), ["guide-qwen-edit.md"]);
  const img = chargerSkill("prompt-asset", undefined, { variante: "image" });
  assert.deepEqual(guidesDe(img), ["guide-krea2.md", "guide-qwen-edit.md"]);
  assert.ok(!img.systeme.includes("Stable Audio 3 — prompting a sound"), "pas de guide audio pour une image");
  assert.ok(img.jetonsEstimes < chargerSkill("prompt-asset").jetonsEstimes, "le prompt d'image est plus léger");
  assert.ok(sfx.jetonsEstimes < chargerSkill("prompt-asset").jetonsEstimes);
  assert.equal(img.guidesIgnores.length, 1);
});

test("variantePromptAsset : le type et la méthode choisissent la variante", () => {
  assert.equal(variantePromptAsset({ type: "sfx", methodeGeneration: null }), "sfx");
  assert.equal(variantePromptAsset({ type: "personnage", methodeGeneration: "generation" }), "generation");
  assert.equal(variantePromptAsset({ type: "decor", methodeGeneration: "edition" }), "edition");
  assert.equal(variantePromptAsset({ type: "prop", methodeGeneration: null }), "image");
});

test("variantesDuGuide : lit la première ligne, tolère les espaces, ignore l'absence", () => {
  assert.deepEqual(variantesDuGuide("<!-- variantes: a, B ,c -->\n# Titre"), ["a", "b", "c"]);
  assert.equal(variantesDuGuide("# Titre sans déclaration"), null);
  assert.equal(variantesDuGuide("# Titre\n<!-- variantes: a -->"), null, "seule la première ligne compte");
});

test("prompt-asset : une sortie d'image sans durée reste valide", () => {
  assert.deepEqual(valider(chargerSkill("prompt-asset").schema, image), { ok: true });
});

test("prompt-asset : une sortie sfx avec durée entière est valide", () => {
  const { schema } = chargerSkill("prompt-asset");
  assert.deepEqual(valider(schema, sfx), { ok: true });
  assert.deepEqual(valider(schema, { ...sfx, remarques: [{ type: "voix-ou-musique", message: "La description demande une voix." }] }), { ok: true });
});

test("prompt-asset : la durée doit être un entier de 1 à 60 secondes", () => {
  const { schema } = chargerSkill("prompt-asset");
  for (const duree of [0, -2, 61, 2.5, "4"]) {
    assert.equal(valider(schema, { ...sfx, dureeSecondes: duree }).ok, false, String(duree));
  }
  assert.equal(valider(schema, { ...sfx, dureeSecondes: 15 }).ok, true);
});
