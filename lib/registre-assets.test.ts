import test from "node:test";
import assert from "node:assert/strict";
import { masterDe } from "./registre-assets";

const parents = (m: Record<number, number | null>) => async (id: number) => m[id] ?? null;

test("masterDe : un master reste lui-même, un dérivé remonte à son master", async () => {
  const p = parents({ 1: null, 2: 1, 3: 2, 4: 3 });
  assert.equal(await masterDe(1, p), 1);
  assert.equal(await masterDe(2, p), 1);
  assert.equal(await masterDe(4, p), 1);
});

test("masterDe : une boucle de données abîmées s'arrête", async () => {
  const p = parents({ 1: 2, 2: 1 });
  const r = await masterDe(1, p);
  assert.ok(r === 1 || r === 2);
});
