import test from "node:test";
import assert from "node:assert/strict";
import { dossiersDuProjet } from "./project-deletion";

test("dossiersDuProjet : un dossier par entité, sous l'id interne", () => {
  const dossiers = dossiersDuProjet(7, { episodes: [2, 3], plans: [10, 11], assets: [5] });
  assert.deepEqual(dossiers.sort(), [
    "assets/7",
    "episodes/2",
    "episodes/3",
    "generations/5",
    "plans/10",
    "plans/11",
    "projects/7",
  ]);
});

test("dossiersDuProjet : projet vide → son poster et son dossier d'assets", () => {
  assert.deepEqual(dossiersDuProjet(7, { episodes: [], plans: [], assets: [] }).sort(), ["assets/7", "projects/7"]);
});
