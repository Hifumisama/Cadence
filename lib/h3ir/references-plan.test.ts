import assert from "node:assert/strict";
import { test } from "node:test";
import { choisirReferences, motsDe, type CandidatReference, type EntreeReferencesPlan } from "./references-plan";

// Un registre bâti comme celui d'un vrai projet de test (personnages sans libellé, un état dérivé, décors et objets nommés par leur code).
const c = (code: string, type: string, parent: string | null = null, label: string | null = null): CandidatReference => ({ code, type, parent, label, description: `desc ${code}`, aUneImage: true });
const REGISTRE: CandidatReference[] = [
  c("CHAR_maitresse_de_l_eau", "personnage"),
  c("CHAR_maitresse_de_la_terre", "personnage"),
  c("CHAR_maitresse_du_feu", "personnage"),
  c("CHAR_nadia", "personnage"),
  c("CHAR_l_elu", "personnage"),
  c("CHAR_l_elu_flammes", "personnage", "CHAR_l_elu"),
  c("PROP_planche_de_glace", "prop"),
  c("PROP_rocher_de_terre", "prop"),
  c("VFX_gerbe_flamme_feu", "vfx"),
  c("DEC_ocean_vague", "decor"),
  c("DEC_caverne", "decor"),
  c("DEC_carte_du_monde", "decor"),
  c("DEC_falaise_de_nuit", "decor"),
  c("DEC_fortifications_de_la_nation_de_la_terre", "decor"),
  c("DEC_temple_secret_du_feu", "decor"),
  c("SFX_vague", "sfx"),
  c("AFFICHE_P1", "affiche"),
];

const entree = (description: string, autres: Partial<EntreeReferencesPlan> = {}): EntreeReferencesPlan => ({
  description,
  liaison: "coupe",
  precedent: null,
  candidats: REGISTRE,
  ...autres,
});
const codes = (r: ReturnType<typeof choisirReferences>) => r.references.map((x) => x.code);
const types = (r: ReturnType<typeof choisirReferences>) => r.doutes.map((d) => d.type);

test("motsDe : minuscules, sans accents, sans mots de liaison, pluriel simple retiré", () => {
  assert.deepEqual(motsDe("La Maîtresse de l'Eau"), ["maitresse", "eau"]);
  assert.deepEqual(motsDe("des flammes"), ["flamme"]);
});

test("plan explicite : personnage, objet et décor nommés, le code suffit (texte entre « », consigne et état de fin ignorés)", () => {
  const r = choisirReferences(
    entree(
      [
        "Océan en plein jour, une large vague creuse se forme. La Maîtresse de l'Eau surfe sur une planche de glace au creux de l'onde. Le caractère « 水 » s'affiche.",
        "Consigne de l'auteur : voix off qui dit « la caverne ».",
        "État en fin de plan : la Maîtresse du Feu regarde la caverne.",
      ].join("\n"),
    ),
  );
  assert.deepEqual(codes(r), ["CHAR_maitresse_de_l_eau", "PROP_planche_de_glace", "DEC_ocean_vague"]);
  assert.deepEqual(r.references.map((x) => x.role), ["subject", "subject", "environment"]);
  assert.equal(r.suffit, true, JSON.stringify(r.doutes));
});

test("parole citée : un nom entre « » ne fait pas entrer l'asset (« Seul l'élu… » n'appelle pas CHAR_l_elu)", () => {
  const r = choisirReferences(entree("Caverne sombre. La Maîtresse de la Terre soulève un rocher de terre. La voix off entame « Seul l'élu, maître des quatre éléments… »."));
  assert.deepEqual(codes(r), ["CHAR_maitresse_de_la_terre", "PROP_rocher_de_terre", "DEC_caverne"]);
  assert.equal(r.suffit, true);
});

test("locuteur en tête, décor du plan précédent pour une suite dans la même scène", () => {
  const description = "Le feu crépite, la rivière murmure en contrebas. Le plan tient sur son visage.\nNadia : « Je suis Nadia, et voici son histoire. »";
  const r = choisirReferences(entree(description, { liaison: "suite", precedent: { memeScene: true, decor: "DEC_falaise_de_nuit" } }));
  assert.deepEqual(codes(r), ["CHAR_nadia", "DEC_falaise_de_nuit"]);
  assert.match(r.references[0]!.pourquoi, /locuteur « Nadia »/);
  assert.match(r.references[1]!.pourquoi, /plan précédent/);
  assert.deepEqual(r.locuteurs, ["Nadia"]);
  assert.equal(r.suffit, true);
  // Une coupe, ou une autre scène : pas de reprise, doute.
  assert.deepEqual(types(choisirReferences(entree(description, { liaison: "coupe", precedent: { memeScene: true, decor: "DEC_falaise_de_nuit" } }))), ["decor_introuvable"]);
  assert.deepEqual(types(choisirReferences(entree(description, { liaison: "suite", precedent: { memeScene: false, decor: "DEC_falaise_de_nuit" } }))), ["decor_introuvable"]);
});

test("voix off : pas un locuteur ; décor nommé par ses mots", () => {
  const r = choisirReferences(entree("Vue plongeante sur une carte du monde en lumière diffuse.\nvoix off : « Depuis très longtemps… »"));
  assert.deepEqual(codes(r), ["DEC_carte_du_monde"]);
  assert.deepEqual(r.locuteurs, []);
  assert.equal(r.suffit, true);
});

test("aucun décor reconnu (le lieu est décrit autrement) : doute", () => {
  const r = choisirReferences(entree("Ciel de jour lourd de menaces sur des fortifications de pierre massives. Une armée de la nation du feu est déployée."));
  assert.deepEqual(codes(r), []);
  assert.deepEqual(types(r), ["decor_introuvable"]);
  assert.equal(r.suffit, false);
});

test("sujet et état évoqué sans être nommé : doute ; l'état nommé tel quel l'emporte sans doute", () => {
  const evoque = choisirReferences(entree("Sur la caverne, la voix off présente l'élu. Il disparaît dans une explosion de flammes."));
  assert.deepEqual(codes(evoque), ["CHAR_l_elu", "DEC_caverne"]);
  assert.deepEqual(types(evoque), ["ambiguite_etat"]);
  const nomme = choisirReferences(entree("Dans la caverne, l'élu en flammes avance."));
  assert.deepEqual(codes(nomme), ["CHAR_l_elu_flammes", "DEC_caverne"]);
  assert.equal(nomme.suffit, true);
});

test("plan sans récit (seulement l'ancien état de fin) : doute", () => {
  const r = choisirReferences(entree("État en fin de plan : la Maîtresse du Feu est au sol au centre d'un mur de flammes."));
  assert.deepEqual(codes(r), []);
  assert.ok(types(r).includes("sans_narration"));
  assert.equal(r.suffit, false);
});

test("codes cités : pris d'office, mal recopiés rapprochés, inconnus en doute ; SFX ignoré", () => {
  const r = choisirReferences(entree("Dans DEC_temple_secret_feu, CHAR_maitresse_du_feu lance VFX_gerbe_flamme_feu sur PROP_inexistant. SFX_vague."));
  assert.deepEqual(codes(r), ["CHAR_maitresse_du_feu", "VFX_gerbe_flamme_feu", "DEC_temple_secret_du_feu"]);
  assert.equal(r.references[1]!.role, "style");
  assert.match(r.references[2]!.pourquoi, /DEC_temple_secret_feu/);
  assert.deepEqual(types(r), ["code_inconnu"]);
});

test("locuteur ou nom propre introuvable : doutes", () => {
  const r = choisirReferences(entree("Dans la caverne, Bruno regarde la Maîtresse de la Terre.\nBruno : « Encore ? »"));
  assert.deepEqual(codes(r), ["CHAR_maitresse_de_la_terre", "DEC_caverne"]);
  assert.deepEqual(types(r).sort(), ["locuteur_introuvable", "nom_inconnu"]);
});

test("plusieurs décors nommés : doute (sauf suite qui reprend le précédent)", () => {
  const d = "De la caverne, on aperçoit la carte du monde.";
  assert.deepEqual(types(choisirReferences(entree(d))), ["decor_ambigu"]);
  const suite = choisirReferences(entree(d, { liaison: "suite", precedent: { memeScene: true, decor: "DEC_caverne" } }));
  assert.deepEqual(codes(suite), ["DEC_caverne"]);
  assert.equal(suite.suffit, true);
});

test("un visage par personnage, 6 images au plus, ordre locuteurs → personnages → objets → effets → décor", () => {
  const r = choisirReferences(
    entree("Dans la caverne, CHAR_l_elu et CHAR_l_elu_flammes. La Maîtresse du Feu, la Maîtresse de l'Eau et la Maîtresse de la Terre lancent une planche de glace et un rocher de terre.\nNadia : « Attention ! »"),
  );
  assert.equal(r.references.length, 6);
  assert.deepEqual(codes(r).slice(0, 2), ["CHAR_nadia", "CHAR_l_elu"]);
  assert.ok(!codes(r).includes("CHAR_l_elu_flammes"));
  assert.ok(types(r).includes("ambiguite_etat"));
  assert.ok(types(r).includes("trop_de_candidats"));
  assert.equal(r.suffit, false);
});

test("élément du brief évoqué : son asset s'il est seul à le porter, sinon un doute", () => {
  const avecAsset = choisirReferences(entree("Dans la caverne, une gerbe de feu jaillit.", { elements: [{ nom: "La gerbe de feu", nature: "vfx" }] }));
  assert.deepEqual(codes(avecAsset), ["VFX_gerbe_flamme_feu", "DEC_caverne"]);
  assert.equal(avecAsset.suffit, true);
  const sans = choisirReferences(entree("Dans la caverne, le bouclier d'argent brille.", { elements: [{ nom: "Le bouclier d'argent", nature: "prop" }] }));
  assert.deepEqual(types(sans), ["element_sans_asset"]);
});

test("jamais de bruitage ni d'affiche parmi les références", () => {
  const r = choisirReferences(entree("Océan, une vague. AFFICHE_P1."));
  assert.ok(!codes(r).some((x) => x.startsWith("SFX_") || x.startsWith("AFFICHE_")));
});
