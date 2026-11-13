import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { exiger, idSchema, texteSchema, uuidSchema, verifier } from "./args";

test("idSchema : entier positif seulement", () => {
  for (const bon of [1, 42]) assert.equal(verifier(idSchema, bon).ok, true);
  for (const mauvais of [0, -1, 1.5, "3", null, undefined, NaN]) assert.equal(verifier(idSchema, mauvais).ok, false, String(mauvais));
});

test("uuidSchema et texteSchema", () => {
  assert.equal(verifier(uuidSchema, "6f0d3c1e-0000-4000-8000-000000000001").ok, true);
  assert.equal(verifier(uuidSchema, "pas-un-uuid").ok, false);
  assert.equal(verifier(texteSchema(5), "abcde").ok, true);
  assert.equal(verifier(texteSchema(5), "abcdef").ok, false);
});

test("verifier renvoie un message lisible, exiger lève une erreur", () => {
  const schema = z.tuple([idSchema, texteSchema(3)]);
  const r = verifier(schema, [0, "trop long"]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erreur, /^Requête invalide : 0 \(/);
  assert.throws(() => exiger(schema, [1, "abcdef"]), /Requête invalide/);
  assert.deepEqual(exiger(schema, [1, "ab"]), [1, "ab"]);
});
