import { test } from "node:test";
import assert from "node:assert/strict";
import { APERCUS_STYLES } from "./showcase";
import {
  bibliothequeStyles,
  construireBibliotheque,
  filtrerStyles,
  slugStyle,
  valeursFiltre,
} from "./library";



test("slugStyle : accents retirés, séparateurs en tirets", () => {
  assert.equal(slugStyle("Ghibli Style"), "ghibli-style");
  assert.equal(slugStyle("  Wallace & Gromit — Style "), "wallace-gromit-style");
  assert.equal(slugStyle("Impressionnisme éclatant"), "impressionnisme-eclatant");
  assert.equal(slugStyle("70s Anime"), "70s-anime");
});

test("construireBibliotheque : deux noms au même identifiant sont refusés", () => {
  const base = { descriptor: "d", categories: [], filtres: { medium: "m", rendu: [], palette: [], epoque: "e", ambiance: [] } };
  assert.throws(() => construireBibliotheque([{ name: "A B", ...base }, { name: "a-b", ...base }]), /même identifiant/);
});

test("la bibliothèque livrée : identifiants uniques, champs présents, filtres cohérents", () => {
  const styles = bibliothequeStyles();
  // A short library chosen by hand (ticket 06, 2026-11-24): every style has its showcase, every showcase its style.
  assert.deepEqual(styles.map((s) => s.id).sort(), APERCUS_STYLES.map((a) => a.id).sort());
  assert.equal(new Set(styles.map((s) => s.id)).size, styles.length);
  for (const s of styles) {
    assert.ok(s.descriptor.trim().length > 40, `${s.id} : descripteur vide`);
    assert.ok(s.categories.length > 0, `${s.id} : aucune catégorie`);
    assert.ok(s.filtres.medium, `${s.id} : medium absent`);
    assert.ok(s.filtres.rendu.length >= 1 && s.filtres.palette.length >= 1 && s.filtres.ambiance.length >= 1, `${s.id} : axe vide`);
    assert.ok(s.filtres.epoque, `${s.id} : époque absente`);
  }
});

test("filtrerStyles : recherche, catégorie, OU dans un axe, ET entre axes", () => {
  const styles = bibliothequeStyles();
  const parMedium = valeursFiltre(styles, "medium");
  assert.ok(parMedium.length > 3 && parMedium[0]!.effectif >= parMedium[parMedium.length - 1]!.effectif);
  const photo = filtrerStyles(styles, { filtres: { medium: ["Photo & ciné"] } });
  assert.ok(photo.length > 0 && photo.every((s) => s.filtres.medium === "Photo & ciné"));
  const deux = filtrerStyles(styles, { filtres: { medium: ["Photo & ciné", "3D & matière"] } });
  assert.ok(deux.length > photo.length);
  const croise = filtrerStyles(styles, { filtres: { medium: ["Photo & ciné"], palette: ["monochrome"] } });
  assert.ok(croise.every((s) => s.filtres.medium === "Photo & ciné" && s.filtres.palette.includes("monochrome")));
  assert.equal(filtrerStyles(styles, { recherche: "zzzz-introuvable" }).length, 0);
  const premier = styles[0]!;
  assert.ok(filtrerStyles(styles, { recherche: premier.nom.toUpperCase() }).some((s) => s.id === premier.id));
  assert.ok(filtrerStyles(styles, { categorie: premier.categories[0] }).some((s) => s.id === premier.id));
});
