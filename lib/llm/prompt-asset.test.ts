import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill } from "./skills";
import { valider } from "./validation";

// Le skill prompt-asset sert les images ET les sons (asset `sfx`) : le guide
// Stable Audio est chargé avec les deux autres, et le schéma accepte la durée.

const image = { methode: "generation", raisonMethode: "Pas de parent.", promptGeneration: "A weathered stone lighthouse at dusk.", remarques: [] };
const sfx = {
  methode: "generation",
  raisonMethode: "Un son généré par Stable Audio.",
  promptGeneration: "Heavy wooden door creaking open slowly on a rusty hinge, long low groan, echoing hollow stone interior.",
  dureeSecondes: 4,
  remarques: [],
};

test("prompt-asset : le guide SFX s'assemble avec les guides d'image, dans l'ordre alphabétique", () => {
  const s = chargerSkill("prompt-asset");
  const guides = s.fichiers.filter((f) => f.includes("/guide-")).map((f) => f.split("/").pop());
  assert.deepEqual(guides, ["guide-krea2.md", "guide-qwen-edit.md", "guide-stable-audio-sfx.md"]);
  assert.ok(s.systeme.includes("Stable Audio 3"));
  assert.ok(s.systeme.includes("dureeSecondes"), "la règle ET le schéma parlent de la durée");
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
