import { test } from "node:test";
import assert from "node:assert/strict";
import { GENRES, SANS_DIALOGUE, validerConception } from "./design";
import {
  DERNIERE_ETAPE,
  ETAPES_ASSISTANT,
  ETAPES_CONCEPTION,
  basculerGenre,
  choisirMiseEnScene,
  etapeMax,
  etapeValide,
  etatInitial,
  lireEtatSauvegarde,
  minutesSecondes,
  miseEnSceneDuStyle,
  resumeEtape,
  styleComplet,
  suivreRecommandation,
  teinteAmbiance,
  versCharge,
  type EtatAssistant,
} from "./design-ui";

const tout = () => true;
const aucun = () => false;

test("état de départ : film, français, 2 min, rythme mesuré, rien choisi", () => {
  const e = etatInitial();
  assert.deepEqual([e.langue, e.duree, e.rythme, e.genres.length, e.style], ["Français", 120, "mesure", 0, null]);
});

test("genres : deux au maximum (le plus ancien part)", () => {
  let e = basculerGenre(etatInitial(), "Comédie");
  e = basculerGenre(e, "Drame");
  assert.deepEqual(e.genres, ["Comédie", "Drame"]);
  e = basculerGenre(e, "Thriller");
  assert.deepEqual(e.genres, ["Drame", "Thriller"]);
  e = basculerGenre(e, "Drame");
  assert.deepEqual(e.genres, ["Thriller"]);
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

test("résumés du ruban : vides tant que rien n'est choisi, sauf la durée et la langue présélectionnées", () => {
  let e = etatInitial();
  const nom = (id: string) => (id === "g" ? "Gouache" : null);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => resumeEtape(i, e, nom)), ["Film IA", "", minutesSecondes(e.duree), "Français", ""]);
  e = { ...basculerGenre(etatInitial(), "Drame"), dureeChoisie: true, duree: 150, langueChoisie: true, langue: SANS_DIALOGUE, style: { source: "bibliotheque", styleId: "g" } };
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => resumeEtape(i, e, nom)), ["Film IA", "Drame", "2 min 30", SANS_DIALOGUE, "Gouache"]);
  assert.equal(resumeEtape(4, { ...e, style: { source: "libre", nom: " ", promptImage: "a", clause: "b" } }, nom), "Style libre");
  assert.equal(minutesSecondes(45), "45 s");
  assert.equal(minutesSecondes(60), "1 min");
});

test("teinte d'ambiance : or par défaut, moyenne des genres sinon", () => {
  assert.equal(teinteAmbiance([]), 42);
  assert.equal(teinteAmbiance(["Comédie"]), GENRES.find((g) => g.nom === "Comédie")!.teinte);
});

test("charge utile : acceptée par la validation du serveur", () => {
  const base: EtatAssistant = { ...basculerGenre(etatInitial(), "Drame"), style: { source: "bibliotheque", styleId: "gouache" } };
  const biblio = [{ id: "gouache" }];
  const film = validerConception(versCharge(base), biblio);
  assert.ok(film.ok, film.ok ? "" : film.erreurs.join(" "));
  assert.ok(!validerConception(versCharge({ ...base, genres: [] }), biblio).ok);
});

test("sauvegarde en session : aller-retour, et toute valeur inattendue retombe sur le départ", () => {
  const e: EtatAssistant = { ...basculerGenre(etatInitial(), "Horreur"), dureeChoisie: true, duree: 300, rythme: "rapide", style: { source: "libre", nom: "Mien", promptImage: "p", clause: "c", image: "libres/x.webp" } };
  assert.deepEqual(lireEtatSauvegarde(JSON.stringify(e)), e);
  assert.equal(lireEtatSauvegarde(null), null);
  assert.equal(lireEtatSauvegarde("pas du json"), null);
  assert.equal(lireEtatSauvegarde("[1]"), null);
  const abime = lireEtatSauvegarde(JSON.stringify({ genres: ["Inconnu", "Drame", "Action", "Western"], duree: 5, rythme: "x", langue: "Klingon", style: { source: "?" } }))!;
  assert.deepEqual([abime.duree, abime.rythme, abime.langue, abime.style], [120, "mesure", "Français", null]);
  assert.deepEqual(abime.genres, ["Drame", "Action"], "genres inconnus retirés, deux au maximum");
});

// --- « Mise en scène » step (creativity and staging style of Open H3 IR, step 6 of /nouveau) ---------------------------

test("mise en scène : sixième étape, départ coché (équilibrée, aucun style), toujours franchissable", () => {
  assert.equal(DERNIERE_ETAPE, 5);
  assert.equal(ETAPES_ASSISTANT[5], "Mise en scène");
  assert.equal(ETAPES_CONCEPTION.length, 9);
  const e = etatInitial();
  assert.deepEqual([e.creativite, e.styleCamera], ["balanced", "aucun"]);
  assert.equal(etapeValide(5, e, tout), true, "rien à remplir : on peut continuer sans toucher à rien");
  // etapeMax reaches the staging step as soon as genre and style are set.
  const pret: EtatAssistant = { ...basculerGenre(etatInitial(), "Drame"), style: { source: "bibliotheque", styleId: "x" } };
  assert.equal(etapeMax(pret, tout), 5);
});

test("mise en scène : résumé du ruban (créativité · style) et charge utile", () => {
  const nom = () => null;
  assert.equal(resumeEtape(5, etatInitial(), nom), "Équilibrée · aucun style");
  assert.equal(resumeEtape(5, { ...etatInitial(), creativite: "bold", styleCamera: "villeneuve" }, nom), "Audacieuse · Immense et silencieux");
  const charge = versCharge({ ...etatInitial(), creativite: "extreme", styleCamera: "wong" });
  assert.equal(charge.creativite, "extreme");
  assert.equal(charge.styleCamera, "wong");
  // The server's validation ignores these keys: it stays strict on the design, which does not carry them.
  const base: EtatAssistant = { ...basculerGenre(etatInitial(), "Drame"), style: { source: "bibliotheque", styleId: "gouache" }, creativite: "bold", styleCamera: "wong" };
  assert.ok(validerConception(versCharge(base), [{ id: "gouache" }]).ok);
});

test("mise en scène : une session plus ancienne (sans ces champs) ou abîmée retombe sur le départ ; un aller-retour garde le choix", () => {
  const ancien = lireEtatSauvegarde(JSON.stringify({ genres: ["Drame"], duree: 120, rythme: "mesure", langue: "Français", style: null }))!;
  assert.deepEqual([ancien.creativite, ancien.styleCamera], ["balanced", "aucun"]);
  const abime = lireEtatSauvegarde(JSON.stringify({ genres: [], creativite: "folle", styleCamera: "kubrick" }))!;
  assert.deepEqual([abime.creativite, abime.styleCamera], ["balanced", "aucun"]);
  const choisi: EtatAssistant = choisirMiseEnScene({ ...etatInitial(), creativite: "restrained" }, "anderson");
  assert.deepEqual(lireEtatSauvegarde(JSON.stringify(choisi)), choisi);
  // A session from before the `miseEnSceneChoisie` field: a style other than « aucun » can only come from a manual choice, it is kept.
  const vieux = lireEtatSauvegarde(JSON.stringify({ genres: ["Drame"], style: { source: "bibliotheque", styleId: "claymation" }, styleCamera: "wong" }))!;
  assert.deepEqual([vieux.styleCamera, vieux.miseEnSceneChoisie], ["wong", true]);
});

test("reglagesDepuisCharge : valeurs validées, repli sur le départ (jamais null), « aucun » accepté", async () => {
  const { reglagesDepuisCharge } = await import("../h3ir/settings");
  assert.deepEqual(reglagesDepuisCharge({ creativite: "bold", styleCamera: "tarantino" }), { creativite: "bold", styleCamera: "tarantino" });
  assert.deepEqual(reglagesDepuisCharge({ creativite: "bold", styleCamera: "aucun" }), { creativite: "bold", styleCamera: "aucun" });
  assert.deepEqual(reglagesDepuisCharge({ creativite: "folle", styleCamera: "kubrick" }), { creativite: "balanced", styleCamera: "aucun" });
  assert.deepEqual(reglagesDepuisCharge({}), { creativite: "balanced", styleCamera: "aucun" });
  assert.deepEqual(reglagesDepuisCharge(null), { creativite: "balanced", styleCamera: "aucun" });
  assert.deepEqual(reglagesDepuisCharge("texte"), { creativite: "balanced", styleCamera: "aucun" });
});

// --- Recommendation: the project's style suggests a way of filming ----------------------------------------------------------

test("recommandation : la mise en scène suit le style tant qu'elle n'a pas été choisie à la main, puis n'est plus jamais écrasée", () => {
  const avecStyle = (styleId: string, e: EtatAssistant = etatInitial()): EtatAssistant => ({ ...e, style: { source: "bibliotheque", styleId } });
  // A recommended style: the suggestion is ticked automatically.
  const clay = suivreRecommandation(avecStyle("claymation"));
  assert.deepEqual([clay.styleCamera, clay.miseEnSceneChoisie], ["claymation", false]);
  assert.equal(miseEnSceneDuStyle(clay.style), "claymation");
  // The style changes: the suggestion follows (another recommendation, then none).
  assert.equal(suivreRecommandation(avecStyle("ghibli-style", clay)).styleCamera, "anime-contemplatif");
  assert.equal(suivreRecommandation(avecStyle("van-gogh-style", clay)).styleCamera, "aucun");
  // A free style has no recommendation.
  assert.equal(suivreRecommandation({ ...clay, style: { source: "libre", nom: "x", promptImage: "p", clause: "c" } }).styleCamera, "aucun");
  // A manual choice (even « aucun ») is never overwritten by a style change.
  const manuel = choisirMiseEnScene(clay, "wong");
  assert.equal(suivreRecommandation(avecStyle("ghibli-style", manuel)).styleCamera, "wong");
  const sans = choisirMiseEnScene(clay, "aucun");
  assert.equal(suivreRecommandation(avecStyle("ghibli-style", sans)).styleCamera, "aucun");
  // A custom profile is sent to the server like any choice, and the ribbon summarises it.
  assert.equal(versCharge(clay).styleCamera, "claymation");
  assert.equal(resumeEtape(5, clay, () => null), "Équilibrée · Stop-motion en pâte à modeler");
  // The flag stays on the browser side.
  assert.equal("miseEnSceneChoisie" in versCharge(clay), false);
  assert.ok(validerConception(versCharge({ ...clay, genres: ["Drame"] }), [{ id: "claymation" }]).ok);
});
