import assert from "node:assert/strict";
import { test } from "node:test";
import { dureeEffectiveSecondes, imagesPourSecondes } from "./image-grid";

test("nombre d'images : forme 17k+5, mêmes valeurs que le nœud du workflow (worker/comfyui/mapping.test.ts)", () => {
  const attendu: Record<number, number> = { 5: 124, 6: 158, 7: 175, 8: 192, 9: 226, 10: 243, 12: 294, 15: 362 };
  for (const [s, n] of Object.entries(attendu)) {
    assert.equal(imagesPourSecondes(Number(s)), n, `${s} s`);
    assert.equal((n - 5) % 17, 0, `${s} s : 17k+5`);
  }
});

test("durée effective : 8 s reste 8 s, les autres durées s'allongent de moins de 17 images", () => {
  const arrondi = (x: number) => Math.round(x * 1000) / 1000;
  assert.equal(dureeEffectiveSecondes(8), 8);
  assert.equal(arrondi(dureeEffectiveSecondes(5)), 5.167);
  assert.equal(arrondi(dureeEffectiveSecondes(6)), 6.583);
  assert.equal(arrondi(dureeEffectiveSecondes(7)), 7.292);
  assert.equal(arrondi(dureeEffectiveSecondes(9)), 9.417);
  assert.equal(arrondi(dureeEffectiveSecondes(10)), 10.125);
  for (let s = 5; s <= 15; s++) {
    const e = dureeEffectiveSecondes(s);
    assert.ok(e >= s - 1 / 48 && e - s < 17 / 24, `${s} s → ${e}`);
  }
});

test("les durées trop courtes sont remontées à 5 images au moins", () => {
  assert.equal(imagesPourSecondes(0), 5);
  assert.equal(imagesPourSecondes(0.1), 5);
});
