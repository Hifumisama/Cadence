import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill, listerSkills, variantesDuGuide } from "./skills";
import { VARIANTE_AFFICHE, variantePromptAsset } from "./variants";
import { valider } from "./validation";

// Le skill prompt-asset sert les images d'assets et les affiches : un guide par méthode (Krea 2, Qwen Image Edit), chargés selon la variante.

const image = { reflexion: "Brouillon.", methode: "generation", raisonMethode: "Pas de parent.", promptGeneration: "A weathered stone lighthouse at dusk.", remarques: [] };
const guidesDe = (s: ReturnType<typeof chargerSkill>) => s.fichiers.filter((f) => f.includes("/guide-")).map((f) => f.split("/").pop());

test("prompt-asset : sans variante, tous les guides s'assemblent, dans l'ordre alphabétique", () => {
  const s = chargerSkill("prompt-asset");
  assert.deepEqual(guidesDe(s), ["guide-krea2.md", "guide-qwen-edit.md"]);
  assert.deepEqual(s.guidesIgnores, []);
  assert.ok(!s.systeme.includes("Stable Audio"), "plus de son");
  assert.ok(!s.systeme.includes("<!-- variantes"), "la déclaration de variantes est retirée du prompt");
});

test("prompt-asset : chaque variante ne charge que ses guides", () => {
  const gen = chargerSkill("prompt-asset", undefined, { variante: "generation" });
  assert.deepEqual(guidesDe(gen), ["guide-krea2.md"]);
  const edi = chargerSkill("prompt-asset", undefined, { variante: "edition" });
  assert.deepEqual(guidesDe(edi), ["guide-qwen-edit.md"]);
  const img = chargerSkill("prompt-asset", undefined, { variante: "image" });
  assert.deepEqual(guidesDe(img), ["guide-krea2.md", "guide-qwen-edit.md"]);
  assert.ok(gen.jetonsEstimes < img.jetonsEstimes, "une méthode fixée charge un seul guide : prompt plus léger");
  assert.equal(img.guidesIgnores.length, 0);
  const affiche = chargerSkill("prompt-asset", undefined, { variante: VARIANTE_AFFICHE });
  assert.deepEqual(guidesDe(affiche), ["guide-krea2.md", "guide-qwen-edit.md"], "l'affiche charge les deux guides d'image");
  assert.ok(affiche.systeme.includes("A poster (variant `affiche`)"));
});

test("prompt-asset : l'ancien skill prompt-affiche n'existe plus (fusionné en variante)", () => {
  assert.ok(!listerSkills().includes("prompt-affiche"));
  assert.throws(() => chargerSkill("prompt-affiche"), /introuvable/);
});

test("variantePromptAsset : la méthode choisit la variante", () => {
  assert.equal(variantePromptAsset({ methodeGeneration: "generation" }), "generation");
  assert.equal(variantePromptAsset({ methodeGeneration: "edition" }), "edition");
  assert.equal(variantePromptAsset({ methodeGeneration: null }), "image");
});

test("variantesDuGuide : lit la première ligne, tolère les espaces, ignore l'absence", () => {
  assert.deepEqual(variantesDuGuide("<!-- variantes: a, B ,c -->\n# Titre"), ["a", "b", "c"]);
  assert.equal(variantesDuGuide("# Titre sans déclaration"), null);
  assert.equal(variantesDuGuide("# Titre\n<!-- variantes: a -->"), null, "seule la première ligne compte");
});

test("prompt-asset : une sortie d'image sans durée reste valide", () => {
  assert.deepEqual(valider(chargerSkill("prompt-asset").schema, image), { ok: true });
});

test("prompt-asset : le schéma exige ses champs, borne les sources à trois et n'a plus de durée", () => {
  const { schema } = chargerSkill("prompt-asset");
  const s = schema as { required: string[]; properties: Record<string, unknown> };
  assert.deepEqual([...s.required].sort(), ["promptGeneration", "raisonMethode", "reflexion", "methode", "remarques"].sort());
  assert.ok(!("dureeSecondes" in s.properties));
  assert.equal(valider(schema, { ...image, methode: "edition", sources: ["CHAR_maya"] }).ok, true);
  assert.equal(valider(schema, { ...image, methode: "edition", sources: ["A", "B", "C", "D"] }).ok, false);
  assert.equal(valider(schema, { ...image, remarques: [{ type: "description-vague", message: "Résumé court." }] }).ok, true);
  assert.equal(valider(schema, { ...image, dureeSecondes: 4 }).ok, false, "une durée n'existe plus");
});
