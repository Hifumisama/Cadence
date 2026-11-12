import assert from "node:assert/strict";
import { test } from "node:test";

import {
  depuisSaisie,
  etapeValide,
  libelleTache,
  typeEdition,
  valeurEnTexte,
  versSaisie,
} from "./agents-display";

test("étape du serveur ramenée à la profondeur", () => {
  assert.equal(etapeValide("courte", "brief"), "consigne");
  assert.equal(etapeValide("courte", "conversation"), "consigne");
  assert.equal(etapeValide("complete", "consigne"), "conversation");
  assert.equal(etapeValide("complete", "brief"), "brief");
});

test("tâche d'agent : file, travail, jetons, échec", () => {
  const base = { runUuid: "u", but: "tour" as const, progressionJetons: null, erreur: null, positionFile: null };
  assert.equal(libelleTache(null), null);
  assert.equal(libelleTache({ ...base, statut: "en_attente", positionFile: 2 }), "En file · n°2");
  assert.equal(libelleTache({ ...base, statut: "en_cours" }), "L'agent réfléchit…");
  assert.equal(libelleTache({ ...base, statut: "en_cours", but: "brief", progressionJetons: 340 }), "L'agent rédige le brief… · 340 jetons");
  assert.equal(libelleTache({ ...base, statut: "en_cours", but: "proposition", progressionJetons: 1 }), "L'agent prépare la proposition… · 1 jeton");
  assert.equal(libelleTache({ ...base, statut: "echoue", erreur: "Serveur injoignable" }), "Échec : Serveur injoignable");
  assert.equal(libelleTache({ ...base, statut: "annulee" }), "Annulée");
  assert.equal(libelleTache({ ...base, statut: "termine" }), null);
});

test("valeurs du brief en texte lisible", () => {
  assert.equal(valeurEnTexte(null), "—");
  assert.equal(valeurEnTexte(["a", "b"]), "• a\n• b");
  assert.equal(valeurEnTexte({ nom: "Maya", role: "" , voix: "grave" }), "nom : Maya — voix : grave");
  assert.equal(valeurEnTexte([{ titre: "Le sel", resume: "Un phare" }]), "• titre : Le sel — resume : Un phare");
  assert.equal(valeurEnTexte(210), "210");
});

test("édition du brief : type de champ, aller-retour, erreurs", () => {
  assert.equal(typeEdition("dureeEpisodeSecondes"), "nombre");
  assert.equal(typeEdition("arc"), "texte");
  assert.equal(typeEdition("inventions"), "lignes");
  assert.equal(typeEdition("personnages"), "json");
  assert.deepEqual(depuisSaisie("dureeEpisodeSecondes", "210,4"), { ok: true, valeur: 210 });
  assert.equal(depuisSaisie("dureeEpisodeSecondes", "abc").ok, false);
  assert.equal(depuisSaisie("arc", "   ").ok, false);
  assert.equal(depuisSaisie("genreTon", "   ").ok, true, "le genre est optionnel");
  assert.deepEqual(depuisSaisie("inventions", "a\n\n b \n"), { ok: true, valeur: ["a", "b"] });
  assert.deepEqual(depuisSaisie("style", versSaisie("style", { nom: "N", clause: "C" })), { ok: true, valeur: { nom: "N", clause: "C" } });
  const mauvais = depuisSaisie("personnages", "[{");
  assert.equal(mauvais.ok, false);
});
