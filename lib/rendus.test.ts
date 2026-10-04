import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblerPrompt } from "./prompt";
import { choisirComparaison, choisirRendu, promptDiffere, raisonNonRetenable, sectionsDuPromptEnvoye, type RenduVue } from "./rendus";

const rendu = (id: number, o: Partial<RenduVue> = {}): RenduVue => ({
  id,
  numeroRendu: id,
  statut: "termine",
  cheminSortie: `plans/1/r${id}.mp4`,
  seedUtilisee: `${id}00`,
  dureeUtilisee: 10,
  promptUtilise: "p",
  activerUpscale: false,
  importe: false,
  ...o,
});

// L'historique est du plus récent au plus ancien.
const historique = [rendu(4, { statut: "en_cours", cheminSortie: null }), rendu(3), rendu(2, { statut: "echoue", cheminSortie: null }), rendu(1)];

test("choisirRendu : le demandé s'il est lisible, sinon le plus récent lisible", () => {
  assert.equal(choisirRendu(historique, 1)?.id, 1);
  assert.equal(choisirRendu(historique, null)?.id, 3);
  assert.equal(choisirRendu(historique, 2)?.id, 3, "un rendu échoué n'est pas lisible");
  assert.equal(choisirRendu(historique, 99)?.id, 3);
  assert.equal(choisirRendu([rendu(1, { statut: "echoue", cheminSortie: null })], null), null);
});

test("choisirComparaison : lisible et distinct du principal", () => {
  const principal = choisirRendu(historique, 3);
  assert.equal(choisirComparaison(historique, 1, principal)?.id, 1);
  assert.equal(choisirComparaison(historique, 3, principal), null, "pas de comparaison avec soi-même");
  assert.equal(choisirComparaison(historique, 2, principal), null, "un rendu échoué ne se compare pas");
  assert.equal(choisirComparaison(historique, null, principal), null);
});

test("promptDiffere : insensible aux fins de ligne et espaces de fin, muet sans prompt enregistré", () => {
  assert.equal(promptDiffere("a\nb", "a\r\nb  "), false);
  assert.equal(promptDiffere("a\nb", "a\nc"), true);
  assert.equal(promptDiffere("a", null), false);
  assert.equal(promptDiffere("a", "  "), false);
});

test("raisonNonRetenable : seed requise, import et rendu non terminé exclus", () => {
  assert.equal(raisonNonRetenable(rendu(1)), null);
  assert.match(raisonNonRetenable(rendu(1, { importe: true }))!, /importée/);
  assert.match(raisonNonRetenable(rendu(1, { seedUtilisee: null }))!, /seed/);
  assert.match(raisonNonRetenable(rendu(1, { statut: "en_cours", cheminSortie: null }))!, /pas terminé/);
});

test("sectionsDuPromptEnvoye : relit un prompt assemblé par le worker, refuse un prompt incomplet", () => {
  const sections = [
    { section: "subject_definitions", ordre: 0, contenu: "<Subject 1> est X." },
    { section: "summary", ordre: 1, contenu: "Résumé." },
    { section: "retention_analysis", ordre: 2, contenu: "R." },
    { section: "detailed_description", ordre: 3, contenu: "[Shot 1] a\n[Shot 2] b" },
    { section: "overall_soundscape", ordre: 4, contenu: "Vent." },
    { section: "non_diegetic_music", ordre: 5, contenu: "N/A" },
  ];
  const r = sectionsDuPromptEnvoye(assemblerPrompt(sections as never));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.sections.detailed_description, "[Shot 1] a\n[Shot 2] b");
    assert.equal(r.sections.non_diegetic_music, "N/A");
  }
  const mauvais = sectionsDuPromptEnvoye("summary:\nseulement ça");
  assert.equal(mauvais.ok, false);
});
