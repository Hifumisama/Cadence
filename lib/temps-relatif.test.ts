import assert from "node:assert/strict";
import { test } from "node:test";
import { ilYa } from "./temps-relatif";

const maintenant = Date.parse("2026-10-15T12:00:00Z");
const avant = (secondes: number) => maintenant - secondes * 1000;

test("l'âge d'un essai : de l'instant aux jours", () => {
  assert.equal(ilYa(avant(10), maintenant), "à l'instant");
  assert.equal(ilYa(avant(4 * 60), maintenant), "il y a 4 min");
  assert.equal(ilYa(avant(3 * 3600), maintenant), "il y a 3 h");
  assert.equal(ilYa(avant(30 * 3600), maintenant), "hier");
  assert.equal(ilYa(avant(4 * 86400), maintenant), "il y a 4 jours");
  assert.equal(ilYa(avant(-5), maintenant), "à l'instant");
});
