import { test } from "node:test";
import assert from "node:assert/strict";
import { GENRES, SANS_DIALOGUE, validerConception } from "./conception";
import {
  DERNIERE_ETAPE,
  ajusterTon,
  basculerGenre,
  etapeMax,
  etapeValide,
  etatInitial,
  lireEtatSauvegarde,
  minutesSecondes,
  reinitialiserTon,
  resumeEtape,
  styleComplet,
  teinteAmbiance,
  versCharge,
  type EtatAssistant,
} from "./conception-ui";

const tout = () => true;
const aucun = () => false;

test("état de départ : film, français, 2 min, rythme mesuré, rien choisi", () => {
  const e = etatInitial();
  assert.deepEqual([e.format, e.langue, e.duree, e.rythme, e.genres.length, e.style], ["film", "Français", 120, "mesure", 0, null]);
  assert.equal(e.ton, 50);
});

test("genres : deux au maximum (le plus ancien part), le ton suit tant qu'il n'est pas ajusté", () => {
  let e = basculerGenre(etatInitial(), "Comédie");
  assert.equal(e.ton, 15);
  e = basculerGenre(e, "Drame");
  assert.deepEqual(e.genres, ["Comédie", "Drame"]);
  assert.equal(e.ton, 48);
  e = basculerGenre(e, "Thriller");
  assert.deepEqual(e.genres, ["Drame", "Thriller"]);
  e = basculerGenre(e, "Drame");
  assert.deepEqual(e.genres, ["Thriller"]);
  assert.equal(e.ton, 82);
});

test("ton ajusté : il ne suit plus les genres, jusqu'au retour au ton du genre", () => {
  let e = basculerGenre(etatInitial(), "Comédie");
  e = ajusterTon(e, 140);
  assert.deepEqual([e.ton, e.tonAjuste], [100, true]);
  e = basculerGenre(e, "Drame");
  assert.equal(e.ton, 100);
  e = reinitialiserTon(e);
  assert.deepEqual([e.ton, e.tonAjuste], [48, false]);
  assert.equal(ajusterTon(etatInitial(), -5).ton, 0);
});

test("étapes : il faut un genre, puis un style complet ; etapeMax s'arrête à la première étape incomplète", () => {
  let e = etatInitial();
  assert.equal(etapeValide(1, e, tout), false);
  assert.equal(etapeMax(e, tout), 1);
  e = basculerGenre(e, "Drame");
  assert.equal(etapeMax(e, tout), 4, "le style manque : on atteint l'étape du style");
  assert.equal(etapeValide(4, e, tout), false);
  e = { ...e, style: { source: "bibliotheque", styleId: "x" } };
  assert.equal(etapeValide(4, e, aucun), false, "style de la bibliothèque sans clause : inutilisable");
  assert.equal(etapeValide(4, e, tout), true);
  assert.equal(etapeMax(e, tout), DERNIERE_ETAPE);
});

test("style libre : les deux prompts sont obligatoires, le nom et l'image non", () => {
  assert.equal(styleComplet({ source: "libre", nom: "", promptImage: "long", clause: "" }, tout), false);
  assert.equal(styleComplet({ source: "libre", nom: "", promptImage: "", clause: "court" }, tout), false);
  assert.equal(styleComplet({ source: "libre", nom: "", promptImage: " long ", clause: " court " }, tout), true);
  assert.equal(styleComplet(null, tout), false);
});

test("résumés du ruban : vides tant que rien n'est choisi", () => {
  let e = etatInitial();
  const nom = (id: string) => (id === "g" ? "Gouache" : null);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => resumeEtape(i, e, nom)), ["Film", "", "", "", ""]);
  e = { ...basculerGenre(etatInitial(), "Drame"), format: "serie", dureeChoisie: true, duree: 150, langueChoisie: true, langue: SANS_DIALOGUE, style: { source: "bibliotheque", styleId: "g" } };
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => resumeEtape(i, e, nom)), ["Série", "Drame · grave", "2 min 30", SANS_DIALOGUE, "Gouache"]);
  assert.equal(resumeEtape(4, { ...e, style: { source: "libre", nom: " ", promptImage: "a", clause: "b" } }, nom), "Style libre");
  assert.equal(minutesSecondes(45), "45 s");
  assert.equal(minutesSecondes(60), "1 min");
});

test("teinte d'ambiance : or par défaut, moyenne des genres sinon", () => {
  assert.equal(teinteAmbiance([]), 42);
  assert.equal(teinteAmbiance(["Comédie"]), GENRES.find((g) => g.nom === "Comédie")!.teinte);
});

test("charge utile : acceptée par la validation du serveur, film sans épisodes prévus, série avec", () => {
  const base: EtatAssistant = { ...basculerGenre(etatInitial(), "Drame"), style: { source: "bibliotheque", styleId: "gouache" } };
  const biblio = [{ id: "gouache" }];
  const film = validerConception(versCharge(base), biblio);
  assert.ok(film.ok, film.ok ? "" : film.erreurs.join(" "));
  assert.equal(film.ok && film.valeur.episodesPrevus, undefined);
  const serie = validerConception(versCharge({ ...base, format: "serie", episodes: 8 }), biblio);
  assert.ok(serie.ok && serie.valeur.episodesPrevus === 8);
  assert.ok(!validerConception(versCharge({ ...base, genres: [] }), biblio).ok);
});

test("sauvegarde en session : aller-retour, et toute valeur inattendue retombe sur le départ", () => {
  const e: EtatAssistant = { ...basculerGenre(etatInitial(), "Horreur"), format: "serie", episodes: 12, dureeChoisie: true, duree: 300, rythme: "rapide", style: { source: "libre", nom: "Mien", promptImage: "p", clause: "c", image: "libres/x.webp" } };
  assert.deepEqual(lireEtatSauvegarde(JSON.stringify(e)), e);
  assert.equal(lireEtatSauvegarde(null), null);
  assert.equal(lireEtatSauvegarde("pas du json"), null);
  assert.equal(lireEtatSauvegarde("[1]"), null);
  const abime = lireEtatSauvegarde(JSON.stringify({ format: "court", episodes: 999, genres: ["Inconnu", "Drame", "Action", "Western"], duree: 5, rythme: "x", langue: "Klingon", ton: 12, tonAjuste: false, style: { source: "?" } }))!;
  assert.deepEqual([abime.format, abime.episodes, abime.duree, abime.rythme, abime.langue, abime.style], ["film", 6, 120, "mesure", "Français", null]);
  assert.deepEqual(abime.genres, ["Drame", "Action"], "genres inconnus retirés, deux au maximum");
  assert.equal(abime.ton, 68, "ton non ajusté : recalculé depuis les genres");
});
