import assert from "node:assert/strict";
import { test } from "node:test";
import { etapesIterationEnAttente } from "./requests";
import { tacheDeDemande, type EntreeTacheDemande } from "./requests-task";

const entree = (surcharge: Partial<EntreeTacheDemande> = {}): EntreeTacheDemande => ({
  id: 7,
  projectId: 1,
  libelle: "Itérer · Plan",
  href: "/p/1/e/1/montage/x",
  statut: "en_attente",
  erreur: null,
  etapes: etapesIterationEnAttente(),
  createdAt: new Date("2026-11-09T10:00:00Z"),
  updatedAt: new Date("2026-11-09T10:00:00Z"),
  finishedAt: null,
  vuAt: null,
  tacheEnFile: false,
  tacheEnCours: false,
  tacheCreeeLe: null,
  jetons: null,
  annulationDemandee: false,
  progressionRendu: null,
  rendu: false,
  consignes: ["Plan plus serré."],
  ...surcharge,
});

test("une itération en attente est une tâche en file, sans progression, à consigne modifiable", () => {
  const t = tacheDeDemande(entree());
  assert.equal(t.statut, "en_attente");
  assert.equal(t.progression, null);
  assert.equal(t.consigneModifiable, true);
  assert.deepEqual(t.consignes, ["Plan plus serré."]);
  assert.match(t.detail ?? "", /En file/);
});

test("une itération démarrée n'est plus modifiable", () => {
  const t = tacheDeDemande(entree({ statut: "en_cours", etapes: etapesIterationEnAttente().map((e, i) => ({ ...e, statut: i === 0 ? "en_cours" : "a_venir" })) }));
  assert.equal(t.statut, "en_cours");
  assert.equal(t.consigneModifiable, undefined);
});

test("les étapes d'une itération en attente n'ont pas commencé", () => {
  assert.ok(etapesIterationEnAttente().every((e) => e.statut === "a_venir"));
});
