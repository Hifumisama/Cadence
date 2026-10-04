import test from "node:test";
import assert from "node:assert/strict";
import { demandeDepuisChemin, porteesDepuisChemin } from "./page-agent";

const UUID = "0b0e5a8e-1c4f-4e7e-9a63-3f1d2c4b5a69";

test("portée déduite de la page : toujours la plus petite qui s'y applique", () => {
  assert.deepEqual(demandeDepuisChemin(`/p/3/e/12/plans/${UUID}`), { projectId: 3, portee: "plan", cible: { uuid: UUID }, episodeId: 12, planUuid: UUID });
  assert.deepEqual(demandeDepuisChemin("/p/3/e/12/plans"), { projectId: 3, portee: "episode", cible: { id: 12 }, episodeId: 12 });
  assert.deepEqual(demandeDepuisChemin("/p/3/e/12"), { projectId: 3, portee: "episode", cible: { id: 12 }, episodeId: 12 });
  assert.deepEqual(demandeDepuisChemin("/p/3/assets/CHAR_maya"), { projectId: 3, portee: "asset", cible: { code: "CHAR_maya" } });
  assert.deepEqual(demandeDepuisChemin("/p/3/assets"), { projectId: 3, portee: "projet", cible: null, vue: "registre" });
  assert.deepEqual(demandeDepuisChemin("/p/3/voix"), { projectId: 3, portee: "projet", cible: null, vue: "voix" });
  for (const chemin of ["/p/3", "/p/3/brief", "/p/3/creation"]) assert.deepEqual(demandeDepuisChemin(chemin), { projectId: 3, portee: "projet", cible: null }, chemin);
});

test("hors d'un projet : pas de portée", () => {
  assert.equal(demandeDepuisChemin("/"), null);
  assert.equal(demandeDepuisChemin("/p/abc"), null);
  assert.equal(demandeDepuisChemin("/api/taches"), null);
});

test("un uuid de plan invalide retombe sur l'épisode ; la requête de l'URL est ignorée", () => {
  assert.equal(demandeDepuisChemin("/p/3/e/12/plans/pas-un-uuid")?.portee, "episode");
  assert.equal(demandeDepuisChemin("/p/3/assets?type=prop")?.vue, "registre");
});

test("élargissement : le plan → son épisode → le projet ; un épisode ou un asset → le projet ; le projet seul", () => {
  assert.deepEqual(porteesDepuisChemin(`/p/3/e/12/plans/${UUID}`).map((p) => p.libelle), ["Ce plan", "Cet épisode", "Tout le projet"]);
  assert.deepEqual(porteesDepuisChemin("/p/3/e/12").map((p) => p.libelle), ["Cet épisode", "Tout le projet"]);
  assert.deepEqual(porteesDepuisChemin("/p/3/assets/CHAR_maya").map((p) => p.libelle), ["Cet asset", "Tout le projet"]);
  assert.deepEqual(porteesDepuisChemin("/p/3").map((p) => p.libelle), ["Tout le projet"]);
  assert.deepEqual(porteesDepuisChemin("/"), []);
});
