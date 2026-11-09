import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { RETENTION_VFX, planifierReferences } from "./references-ecriture";

const assets = new Map([
  ["CHAR_heroine", { id: 1, type: "personnage" }],
  ["DEC_port", { id: 2, type: "decor" }],
  ["VFX_brume", { id: 3, type: "vfx" }],
  ["SFX_cloche", { id: 4, type: "sfx" }],
  ["PROP_carte", { id: 5, type: "prop" }],
  ["PROP_boussole", { id: 6, type: "prop" }],
  ["PROP_corde", { id: 7, type: "prop" }],
  ["PROP_rame", { id: 8, type: "prop" }],
]);

test("planifierReferences : emplacements 1..n dans l'ordre, VFX en rétention faible, rôle par défaut laissé à la base", () => {
  const p = planifierReferences(["CHAR_heroine", "VFX_brume", { code: "DEC_port", role: "Décor du départ" }], assets, 0);
  assert.ok(p.ok);
  assert.deepEqual(p.lignes, [
    { assetId: 1, slot: 1, role: null, retention: null },
    { assetId: 3, slot: 2, role: null, retention: RETENTION_VFX },
    { assetId: 2, slot: 3, role: "Décor du départ", retention: null },
  ]);
  assert.equal(p.retirerExistantes, false);
});

test("planifierReferences : code inconnu, son, doublon et 7e image ignorés", () => {
  const p = planifierReferences(["CHAR_heroine", "SFX_cloche", "CHAR_heroine", "PROP_inconnu", "PROP_carte", "PROP_boussole", "PROP_corde", "PROP_rame", "DEC_port"], assets, 0);
  assert.ok(p.ok);
  assert.equal(p.lignes.length, 6);
  assert.deepEqual(p.ignores, ["SFX_cloche", "CHAR_heroine", "PROP_inconnu"]);
});

test("planifierReferences : jamais par-dessus des images déjà posées, sauf remplacement explicite", () => {
  const refus = planifierReferences(["CHAR_heroine"], assets, 2);
  assert.deepEqual(refus, { ok: false, raison: "deja-des-references", ignores: [] });
  const remplace = planifierReferences(["CHAR_heroine"], assets, 2, { remplacer: true });
  assert.ok(remplace.ok && remplace.retirerExistantes);
  assert.deepEqual(planifierReferences(["SFX_cloche"], assets, 0), { ok: false, raison: "aucune-reference", ignores: ["SFX_cloche"] });
});

test("ecrireReferencesPlan : n'écrit jamais la table des plans (un brouillon reste brouillon, contrairement à l'écriture d'une fiche)", () => {
  const source = readFileSync(join(process.cwd(), "lib", "h3ir", "references-ecriture.ts"), "utf8");
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /statut\s*:/);
});
