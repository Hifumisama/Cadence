import { test } from "node:test";
import assert from "node:assert/strict";
import { GENRES, SANS_DIALOGUE, validerConception } from "./design";
import {
  DERNIERE_ETAPE,
  ETAPE,
  ETAPES_ASSISTANT,
  ETAPES_CONCEPTION,
  etapeMax,
  etapeValide,
  etatInitial,
  lireEtatSauvegarde,
  minutesSecondes,
  resumeEtape,
  styleComplet,
  teinteAmbiance,
  versCharge,
  type EtatAssistant,
} from "./design-ui";

const tout = () => true;
const aucun = () => false;

test("état de départ : film, français, 2 min, rythme variable, musique discrète, rien choisi", () => {
  const e = etatInitial();
  assert.deepEqual([e.langue, e.duree, e.rythme, e.style, e.musique, e.referenceMusique], ["Français", 120, "variable", null, "discrete", ""]);
});

test("étapes : le cadre seulement (plus de genre), il faut un style complet ; etapeMax s'arrête à la première étape incomplète", () => {
  assert.deepEqual([...ETAPES_ASSISTANT], ["Accueil", "Durée", "Langue", "Style", "Musique"]);
  let e = etatInitial();
  assert.equal(etapeMax(e, tout), ETAPE.style, "le style manque : on atteint l'étape du style");
  assert.equal(etapeValide(ETAPE.style, e, tout), false);
  e = { ...e, style: { source: "bibliotheque", styleId: "x" } };
  assert.equal(etapeValide(ETAPE.style, e, aucun), false, "style de la bibliothèque sans clause : inutilisable");
  assert.equal(etapeValide(ETAPE.style, e, tout), true);
  assert.equal(etapeMax(e, tout), DERNIERE_ETAPE);
});

test("style libre : les deux prompts sont obligatoires, le nom et l'image non", () => {
  assert.equal(styleComplet({ source: "libre", nom: "", promptImage: "long", clause: "" }, tout), false);
  assert.equal(styleComplet({ source: "libre", nom: "", promptImage: "", clause: "court" }, tout), false);
  assert.equal(styleComplet({ source: "libre", nom: "", promptImage: " long ", clause: " court " }, tout), true);
  assert.equal(styleComplet(null, tout), false);
});

test("résumés du ruban : vides tant que rien n'est choisi, sauf les valeurs présélectionnées", () => {
  let e = etatInitial();
  const nom = (id: string) => (id === "g" ? "Gouache" : null);
  const resumes = (x: EtatAssistant) => [ETAPE.accueil, ETAPE.duree, ETAPE.langue, ETAPE.style, ETAPE.musique].map((i) => resumeEtape(i, x, nom));
  assert.deepEqual(resumes(e), ["Film IA", minutesSecondes(e.duree), "Français", "", "Discrète"]);
  e = { ...etatInitial(), dureeChoisie: true, duree: 150, langueChoisie: true, langue: SANS_DIALOGUE, style: { source: "bibliotheque", styleId: "g" }, musique: "aucune" };
  assert.deepEqual(resumes(e), ["Film IA", "2 min 30", SANS_DIALOGUE, "Gouache", "Aucune"]);
  assert.equal(resumeEtape(ETAPE.style, { ...e, style: { source: "libre", nom: " ", promptImage: "a", clause: "b" } }, nom), "Style libre");
  assert.equal(minutesSecondes(45), "45 s");
  assert.equal(minutesSecondes(60), "1 min");
});

test("teinte d'ambiance : or par défaut, moyenne des genres sinon", () => {
  assert.equal(teinteAmbiance([]), 42);
  assert.equal(teinteAmbiance(["Comédie"]), GENRES.find((g) => g.nom === "Comédie")!.teinte);
});

test("charge utile : acceptée par la validation du serveur, sans genre, avec l'intention musicale", () => {
  const base: EtatAssistant = { ...etatInitial(), style: { source: "bibliotheque", styleId: "gouache" }, referenceMusique: "  Daft Punk  " };
  const biblio = [{ id: "gouache" }];
  const film = validerConception(versCharge(base), biblio);
  assert.ok(film.ok, film.ok ? "" : film.erreurs.join(" "));
  assert.deepEqual(film.ok && [film.valeur.genres, film.valeur.musique], [[], { intention: "discrete", reference: "Daft Punk" }]);
  // « Aucune »: the reference is dropped.
  const sans = validerConception(versCharge({ ...base, musique: "aucune" }), biblio);
  assert.deepEqual(sans.ok && sans.valeur.musique, { intention: "aucune" });
});

test("sauvegarde en session : aller-retour, et toute valeur inattendue retombe sur le départ", () => {
  const e: EtatAssistant = { ...etatInitial(), dureeChoisie: true, duree: 300, style: { source: "libre", nom: "Mien", promptImage: "p", clause: "c", image: "libres/x.webp" }, musique: "presente", referenceMusique: "Hans Zimmer" };
  assert.deepEqual(lireEtatSauvegarde(JSON.stringify(e)), e);
  assert.equal(lireEtatSauvegarde(null), null);
  assert.equal(lireEtatSauvegarde("pas du json"), null);
  assert.equal(lireEtatSauvegarde("[1]"), null);
  const abime = lireEtatSauvegarde(JSON.stringify({ genres: ["Drame"], duree: 5, rythme: "x", langue: "Klingon", style: { source: "?" }, musique: "fort" }))!;
  assert.deepEqual([abime.duree, abime.rythme, abime.langue, abime.style, abime.musique], [120, "variable", "Français", null, "discrete"]);
  assert.equal("genres" in abime, false, "une session d'avant garde ses genres hors de l'état");
});

// --- The steps of the design (the « Mise en scène » step was removed: ADR 0001) ------------------------------------------

test("étapes : cinq choix (accueil, durée, langue, style, musique), la musique est la dernière et se franchit sans rien toucher", () => {
  assert.deepEqual([...ETAPES_ASSISTANT], ["Accueil", "Durée", "Langue", "Style", "Musique"]);
  assert.equal(DERNIERE_ETAPE, ETAPE.musique);
  assert.equal(ETAPES_CONCEPTION.length, 8);
  const e = etatInitial();
  assert.equal(etapeValide(ETAPE.musique, e, tout), true, "musique présélectionnée");
  const pret: EtatAssistant = { ...etatInitial(), style: { source: "bibliotheque", styleId: "x" } };
  assert.equal(etapeMax(pret, tout), DERNIERE_ETAPE);
});

test("la charge utile ne porte plus de réglage de mise en scène ; une session d'avant en porte encore sans conséquence", () => {
  const base: EtatAssistant = { ...etatInitial(), style: { source: "bibliotheque", styleId: "gouache" } };
  const charge = versCharge(base);
  assert.equal("creativite" in charge, false);
  assert.equal("styleCamera" in charge, false);
  assert.ok(validerConception(charge, [{ id: "gouache" }]).ok);
  // An older session still has the retired fields: they are ignored, nothing else changes.
  const ancien = lireEtatSauvegarde(JSON.stringify({ duree: 300, langue: "Français", creativite: "bold", styleCamera: "wong", miseEnSceneChoisie: true, style: null }))!;
  assert.equal(ancien.duree, 300);
  for (const k of ["creativite", "styleCamera", "miseEnSceneChoisie"]) assert.equal(k in ancien, false, k);
});
