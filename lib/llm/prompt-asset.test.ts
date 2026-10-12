import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill, listerSkills, variantesDuGuide } from "./skills";
import { VARIANTE_AFFICHE, variantePromptAsset } from "./variantes";
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
  const affiche = chargerSkill("prompt-asset", undefined, { variante: VARIANTE_AFFICHE });
  assert.deepEqual(guidesDe(affiche), ["guide-krea2.md", "guide-qwen-edit.md"], "l'affiche charge les deux guides d'image, jamais le guide audio");
  assert.ok(affiche.systeme.includes("A poster (variant `affiche`)"));
});

test("prompt-asset : l'ancien skill prompt-affiche n'existe plus (fusionné en variante)", () => {
  assert.ok(!listerSkills().includes("prompt-affiche"));
  assert.throws(() => chargerSkill("prompt-affiche"), /introuvable/);
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

test("prompt-asset : le schéma est en deux variantes (anyOf) : un son exige sa durée et n'a pas de sources, une image n'a pas de durée", () => {
  const { schema } = chargerSkill("prompt-asset");
  const s = schema as { anyOf: { required: string[]; properties: Record<string, unknown> }[] };
  assert.equal(s.anyOf.length, 2);
  // Les variantes portent leurs champs : llama.cpp ignore les `properties` voisins d'un `anyOf`.
  assert.ok(s.anyOf.every((v) => ["reflexion", "methode", "raisonMethode", "promptGeneration", "remarques"].every((c) => c in v.properties)));
  const { dureeSecondes: _d, ...sansDuree } = sfx;
  assert.equal(valider(schema, sansDuree).ok, true, "sans durée, la sortie est celle d'une image");
  assert.equal(valider(schema, { ...sfx, sources: [] }).ok, false, "un son n'a pas de sources");
  assert.equal(valider(schema, { ...sfx, methode: "edition" }).ok, false, "un son se génère");
  assert.equal(valider(schema, { ...image, dureeSecondes: 4 }).ok, true, "une durée appartient à la variante son");
  assert.equal(valider(schema, { ...image, methode: "edition", sources: ["CHAR_maya"] }).ok, true);
  assert.equal(valider(schema, { ...image, methode: "edition", sources: ["A", "B", "C", "D"] }).ok, false);
  assert.equal(valider(schema, { ...image, remarques: [{ type: "description-vague", message: "Résumé court." }] }).ok, true);
});
