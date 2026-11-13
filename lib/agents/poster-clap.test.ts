import { test } from "node:test";
import assert from "node:assert/strict";
import { entreeAfficheClap, signatureAffiche, type DonneesAffiche } from "./poster-clap";

const base: DonneesAffiche = {
  titre: "",
  arc: "Une voleuse infiltre un riad à Tanger pour reprendre ce qu'on lui a pris. Tout bascule : on l'attendait.",
  personnages: [
    { nom: "Yasmine", reconnaissable: "manteau sombre", age: "30 ans", apparence: "cheveux courts, manteau sombre", gestuelle: "gestes précis" },
    { nom: "Idrissi", reconnaissable: "costume clair", age: "55 ans", apparence: "costume clair" },
  ],
  lieux: "la médina, le riad",
  genres: ["Aventure", "Thriller"],
  styleImage: "A moody noir look.",
  clauseStyle: "Noir.",
};
const { clauseStyle: _c, ...nourrit } = base;

test("signature de l'affiche : stable, et seul ce qui nourrit l'image la change", () => {
  const s = signatureAffiche(nourrit);
  assert.equal(signatureAffiche({ ...nourrit }), s, "stable");
  assert.equal(signatureAffiche({ ...nourrit, genres: ["Thriller", "Aventure"] }), s, "l'ordre des genres ne compte pas");
  assert.equal(signatureAffiche({ ...nourrit, arc: `  ${nourrit.arc}  ` }), s, "les espaces ne comptent pas");
  assert.notEqual(signatureAffiche({ ...nourrit, arc: `${nourrit.arc} Elle garde la boîte.` }), s, "l'histoire");
  assert.notEqual(signatureAffiche({ ...nourrit, personnages: [{ ...nourrit.personnages[0]!, age: "45 ans" }, nourrit.personnages[1]!] }), s, "le héros");
  assert.notEqual(signatureAffiche({ ...nourrit, lieux: "le désert" }), s, "les lieux");
  assert.notEqual(signatureAffiche({ ...nourrit, genres: ["Comédie"] }), s, "le genre");
  assert.notEqual(signatureAffiche({ ...nourrit, styleImage: "A watercolour look." }), s, "le style");
  assert.notEqual(signatureAffiche({ ...nourrit, titre: "La Nuit des Brumes" }), s, "le titre (il est écrit dans l'image)");
  assert.equal(signatureAffiche({ ...nourrit, titre: "  La Nuit des Brumes " }), signatureAffiche({ ...nourrit, titre: "La Nuit des Brumes" }), "les espaces du titre ne comptent pas");
});

test("entrée du skill prompt-affiche pour le clap : texte seul, héros décrit, titre dans l'image dès qu'il existe", () => {
  const e = entreeAfficheClap(base) as Record<string, unknown> & { personnagePrincipal: { nom: string; description: string; imageDisponible: boolean } };
  assert.equal(e.cible, "projet");
  assert.equal(e.titreDansImage, false, "pas encore de titre : pas de lettrage");
  assert.equal((entreeAfficheClap({ ...base, titre: "La Nuit des Brumes" }) as { titreDansImage: boolean }).titreDansImage, true);
  assert.equal(e.personnagePrincipal.nom, "Yasmine");
  assert.equal(e.personnagePrincipal.imageDisponible, false);
  assert.match(e.personnagePrincipal.description, /30 ans/);
  assert.match(String(e.resume), /Idrissi/);
  assert.match(String(e.resume), /Lieux : la médina/);
  assert.match(String(e.genreTon), /^Aventure \+ Thriller$/);
  assert.equal(entreeAfficheClap({ ...base, personnages: [] }).personnagePrincipal, null);
});

import { titreDeLAffiche } from "./poster-clap";

test("titre de l'affiche : le nom fixé gagne, puis le titre du brief (même non validé), puis celui de la fiche", () => {
  assert.equal(titreDeLAffiche({ nom: "Les Yeux de Rubis", titreBrief: "Autre", titreFiche: "Encore" }), "Les Yeux de Rubis");
  assert.equal(titreDeLAffiche({ nom: "Sans titre", titreBrief: "  Le Feu   d'Iris ", titreFiche: "" }), "Le Feu d'Iris");
  assert.equal(titreDeLAffiche({ nom: "Sans titre", titreBrief: "", titreFiche: "Titre de la fiche" }), "Titre de la fiche");
});

test("titre de l'affiche : un titre provisoire ne compte pas, et rien ne s'invente", () => {
  assert.equal(titreDeLAffiche({ nom: "Sans titre", titreBrief: "untitled", titreFiche: "Projet" }), "");
  assert.equal(titreDeLAffiche({ nom: undefined, titreBrief: null, titreFiche: 3 }), "");
});
