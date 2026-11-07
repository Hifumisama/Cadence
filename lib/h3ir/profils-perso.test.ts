import assert from "node:assert/strict";
import { test } from "node:test";
import { REFERENCES_NOMMEES } from "../conception";
import { FICHES_PERSO, IDS_PROFILS_PERSO, PROFILS_PERSO, type ProfilPersoId } from "./profils-perso";

const CLES = ["claymation", "anime-nerveux", "anime-contemplatif", "3d-cinema", "sitcom", "horreur"];

test("profils perso : les six clés, chacune avec son libellé et son résumé", () => {
  assert.deepEqual([...IDS_PROFILS_PERSO], CLES);
  for (const c of CLES as ProfilPersoId[]) {
    assert.ok(PROFILS_PERSO[c], c);
    assert.ok(FICHES_PERSO[c].libelle && FICHES_PERSO[c].resume, c);
  }
  assert.deepEqual(Object.keys(PROFILS_PERSO).sort(), Object.keys(FICHES_PERSO).sort());
});

test("profils perso : notes non vides, 5000 caractères au plus, aucun nom de studio, d'auteur ou d'œuvre", () => {
  for (const [c, p] of Object.entries(PROFILS_PERSO)) {
    assert.ok(p.name.trim() && p.notes.trim(), c);
    assert.ok(p.notes.length <= 5000, `${c} : ${p.notes.length} caractères`);
    const bas = `${p.name} ${p.notes}`.toLowerCase();
    for (const nom of REFERENCES_NOMMEES) assert.ok(!bas.includes(nom), `${c} contient « ${nom} »`);
  }
});
