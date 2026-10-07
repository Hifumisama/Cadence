import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bibliothequeStyles,
  cheminApercuStyle,
  construireBibliotheque,
  filtrerStyles,
  slugStyle,
  styleParId,
  valeursFiltre,
} from "./bibliotheque";
import { estAspect } from "../asset-generation";
import { IDS_SUJETS, promptApercu, sujetParId, SUJETS_APERCU } from "./sujets";

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
  assert.ok(styles.length >= 40, `bibliothèque trop petite : ${styles.length}`);
  assert.equal(new Set(styles.map((s) => s.id)).size, styles.length);
  for (const s of styles) {
    assert.ok(s.descriptor.trim().length > 40, `${s.id} : descripteur vide`);
    assert.ok(s.categories.length > 0, `${s.id} : aucune catégorie`);
    assert.ok(s.filtres.medium, `${s.id} : medium absent`);
    assert.ok(s.filtres.rendu.length >= 1 && s.filtres.palette.length >= 1 && s.filtres.ambiance.length >= 1, `${s.id} : axe vide`);
    assert.ok(s.filtres.epoque, `${s.id} : époque absente`);
  }
});

test("styleParId et chemin d'aperçu", () => {
  const premier = bibliothequeStyles()[0]!;
  assert.equal(styleParId(premier.id)?.nom, premier.nom);
  assert.equal(styleParId("n-existe-pas"), null);
  assert.equal(cheminApercuStyle(premier.id, "lecture"), `styles/${premier.id}/lecture.webp`);
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

test("sujets d'aperçu : identifiants uniques, formats connus, scènes sans mot de rendu", () => {
  assert.equal(new Set(IDS_SUJETS).size, SUJETS_APERCU.length);
  for (const s of SUJETS_APERCU) {
    assert.ok(estAspect(s.aspect), `${s.id} : format inconnu`);
    assert.ok(s.scene.length > 60 && s.largeur > 300, `${s.id} : scène ou largeur inattendue`);
    assert.doesNotMatch(s.scene, /(photo|photograph|painting|painted|drawing|illustration|render|cartoon|anime|realistic)/i, `${s.id} : mot de rendu dans la scène`);
  }
  assert.equal(sujetParId("lecture")?.aspect, "2:3");
  assert.equal(sujetParId("inconnu"), null);
  assert.equal(promptApercu({ scene: "Une scène." }, "Un style."), "Une scène. Un style.");
});
