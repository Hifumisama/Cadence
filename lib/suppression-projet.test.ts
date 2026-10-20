import test from "node:test";
import assert from "node:assert/strict";
import { dossiersDuProjet } from "./suppression-projet";

test("dossiersDuProjet : un dossier par entité, sous l'id interne", () => {
  const dossiers = dossiersDuProjet(7, { episodes: [2, 3], plans: [10, 11], assets: [5] });
  assert.deepEqual(dossiers.sort(), [
    "episodes/2",
    "episodes/3",
    "generations/5",
    "plans/10",
    "plans/11",
    "projects/7",
    "voix/5",
  ]);
});

test("dossiersDuProjet : projet vide → seulement son poster", () => {
  assert.deepEqual(dossiersDuProjet(7, { episodes: [], plans: [], assets: [] }), ["projects/7"]);
});
