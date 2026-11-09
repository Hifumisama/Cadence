import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CONSIGNE, deplacer, fusionTropLongue, fusionnerConsignes, fusionnerReglages, verifierConsigne } from "./consignes";

test("une seule consigne reste telle quelle", () => {
  assert.equal(fusionnerConsignes(["  Plus de mouvement. "]), "Plus de mouvement.");
  assert.equal(fusionnerConsignes([]), "");
});

test("plusieurs consignes : liste numérotée dans l'ordre donné", () => {
  const f = fusionnerConsignes(["Plan plus serré.", "Lumière plus chaude."]);
  assert.match(f, /^Plusieurs consignes/);
  assert.match(f, /\n1\. Plan plus serré\.\n2\. Lumière plus chaude\.$/);
});

test("les consignes vides sont ignorées à la fusion", () => {
  assert.equal(fusionnerConsignes(["", "  ", "Une seule."]), "Une seule.");
});

test("réglages : la dernière valeur demandée gagne, réglage par réglage", () => {
  const r = fusionnerReglages([{ dureeGenerationSecondes: 5, fps: 24 }, { dureeGenerationSecondes: 8 }, { seed: "42" }, { seed: "" }]);
  assert.deepEqual(r, { dureeGenerationSecondes: 8, fps: 24, seed: "42" });
});

test("vérification du texte", () => {
  assert.equal(verifierConsigne("   ").ok, false);
  assert.equal(verifierConsigne("x".repeat(MAX_CONSIGNE + 1)).ok, false);
  const v = verifierConsigne("  ok ");
  assert.ok(v.ok && v.texte === "ok");
});

test("la fusion trop longue est détectée", () => {
  assert.equal(fusionTropLongue(["a", "b"]), false);
  assert.equal(fusionTropLongue(["x".repeat(MAX_CONSIGNE), "y"]), true);
});

test("déplacer échange avec la voisine, sans sortir de la liste", () => {
  const l = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(deplacer(l, 2, -1)?.map((c) => c.id), [2, 1, 3]);
  assert.deepEqual(deplacer(l, 2, 1)?.map((c) => c.id), [1, 3, 2]);
  assert.equal(deplacer(l, 1, -1), null);
  assert.equal(deplacer(l, 3, 1), null);
  assert.equal(deplacer(l, 99, 1), null);
});
