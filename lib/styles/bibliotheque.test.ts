import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bibliothequeStyles,
  cheminApercuStyle,
  construireBibliotheque,
  filtrerStyles,
  sceneApercu,
  slugStyle,
  styleParId,
  valeursFiltre,
} from "./bibliotheque";

test("slugStyle : accents retirés, séparateurs en tirets", () => {
  assert.equal(slugStyle("Ghibli Style"), "ghibli-style");
  assert.equal(slugStyle("  Wallace & Gromit — Style "), "wallace-gromit-style");
  assert.equal(slugStyle("Impressionnisme éclatant"), "impressionnisme-eclatant");
  assert.equal(slugStyle("70s Anime"), "70s-anime");
});

test("construireBibliotheque : deux noms au même identifiant sont refusés", () => {
  const base = { descriptor: "d", promptApercu: "s d", varianteApercu: "base", categories: [], filtres: { medium: "m", rendu: [], palette: [], epoque: "e", ambiance: [] } };
  assert.throws(() => construireBibliotheque([{ name: "A B", ...base }, { name: "a-b", ...base }]), /même identifiant/);
});

test("la bibliothèque livrée : identifiants uniques, champs présents, filtres cohérents", () => {
  const styles = bibliothequeStyles();
  assert.ok(styles.length > 100, `bibliothèque trop petite : ${styles.length}`);
  assert.equal(new Set(styles.map((s) => s.id)).size, styles.length);
  for (const s of styles) {
    assert.ok(s.descriptor.trim().length > 40, `${s.id} : descripteur vide`);
    assert.ok(s.categories.length > 0, `${s.id} : aucune catégorie`);
    assert.ok(s.filtres.medium, `${s.id} : medium absent`);
    assert.ok(s.filtres.rendu.length >= 1 && s.filtres.palette.length >= 1 && s.filtres.ambiance.length >= 1, `${s.id} : axe vide`);
    assert.ok(s.filtres.epoque, `${s.id} : époque absente`);
    assert.ok(s.varianteApercu, `${s.id} : variante d'aperçu absente`);
    // Le script d'aperçus sépare scène et style : il doit toujours y arriver.
    const scene = sceneApercu(s);
    assert.ok(scene.length > 30 && !scene.includes(s.descriptor), `${s.id} : scène d'aperçu inattendue`);
  }
});

test("sceneApercu : erreur franche si le prompt d'aperçu ne finit plus par le descripteur", () => {
  assert.throws(() => sceneApercu({ nom: "X", descriptor: "style", promptApercu: "scène autre" }), /ne se termine pas/);
  assert.equal(sceneApercu({ nom: "X", descriptor: "style", promptApercu: "Une scène. style" }), "Une scène.");
});

test("styleParId et chemin d'aperçu", () => {
  const premier = bibliothequeStyles()[0]!;
  assert.equal(styleParId(premier.id)?.nom, premier.nom);
  assert.equal(styleParId("n-existe-pas"), null);
  assert.equal(cheminApercuStyle(premier.id), `styles/${premier.id}.webp`);
});

test("filtrerStyles : recherche, catégorie, OU dans un axe, ET entre axes", () => {
  const styles = bibliothequeStyles();
  const parMedium = valeursFiltre(styles, "medium");
  assert.ok(parMedium.length > 3 && parMedium[0]!.effectif >= parMedium[parMedium.length - 1]!.effectif);
  const photo = filtrerStyles(styles, { filtres: { medium: ["photo"] } });
  assert.ok(photo.length > 0 && photo.every((s) => s.filtres.medium === "photo"));
  const deux = filtrerStyles(styles, { filtres: { medium: ["photo", "3D"] } });
  assert.ok(deux.length > photo.length);
  const croise = filtrerStyles(styles, { filtres: { medium: ["photo"], palette: ["monochrome"] } });
  assert.ok(croise.every((s) => s.filtres.medium === "photo" && s.filtres.palette.includes("monochrome")));
  assert.equal(filtrerStyles(styles, { recherche: "zzzz-introuvable" }).length, 0);
  const premier = styles[0]!;
  assert.ok(filtrerStyles(styles, { recherche: premier.nom.toUpperCase() }).some((s) => s.id === premier.id));
  assert.ok(filtrerStyles(styles, { categorie: premier.categories[0] }).some((s) => s.id === premier.id));
});
