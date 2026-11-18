import { test } from "node:test";
import assert from "node:assert/strict";
import { GABARIT_AFFICHE, afficheAttendLeHeros, entreeAfficheClap, signatureAffiche, type DonneesAffiche } from "./poster-clap";

const base: DonneesAffiche = {
  titre: "",
  arc: "Une voleuse infiltre un riad à Tanger pour reprendre ce qu'on lui a pris. Tout bascule : on l'attendait.",
  personnages: [
    { nom: "Yasmine", reconnaissable: "manteau sombre", age: "30 ans", apparence: "cheveux courts, manteau sombre", gestuelle: "gestes précis" },
    { nom: "Idrissi", reconnaissable: "costume clair", age: "55 ans", apparence: "costume clair" },
  ],
  lieux: "la médina, le riad",
  genre: "Aventure + Thriller",
  styleImage: "A moody noir look.",
  clauseStyle: "Noir.",
};
const { clauseStyle: _c, ...nourrit } = base;

test("signature de l'affiche : stable, et seul ce qui nourrit l'image la change", () => {
  const s = signatureAffiche(nourrit);
  assert.equal(signatureAffiche({ ...nourrit }), s, "stable");
  assert.equal(signatureAffiche({ ...nourrit, arc: `  ${nourrit.arc}  ` }), s, "les espaces ne comptent pas");
  assert.notEqual(signatureAffiche({ ...nourrit, arc: `${nourrit.arc} Elle garde la boîte.` }), s, "l'histoire");
  assert.notEqual(signatureAffiche({ ...nourrit, personnages: [{ ...nourrit.personnages[0]!, age: "45 ans" }, nourrit.personnages[1]!] }), s, "le héros");
  assert.notEqual(signatureAffiche({ ...nourrit, lieux: "le désert" }), s, "les lieux");
  assert.notEqual(signatureAffiche({ ...nourrit, genre: "Comédie" }), s, "le genre");
  assert.notEqual(signatureAffiche({ ...nourrit, styleImage: "A watercolour look." }), s, "le style");
  assert.notEqual(signatureAffiche({ ...nourrit, titre: "La Nuit des Brumes" }), s, "le titre (il est écrit dans l'image)");
  assert.equal(signatureAffiche({ ...nourrit, titre: "  La Nuit des Brumes " }), signatureAffiche({ ...nourrit, titre: "La Nuit des Brumes" }), "les espaces du titre ne comptent pas");
});

const herosAvecImage = { id: 12, code: "CHAR_yasmine", nom: "Yasmine", description: "femme de 30 ans, cheveux courts, manteau sombre", fichier: "7/CHAR_yasmine.png", aImage: true };

test("affiche : elle attend l'image du héros quand l'histoire a des personnages ; sans personnage, elle part tout de suite", () => {
  assert.equal(afficheAttendLeHeros(base), true, "pas encore d'asset");
  assert.equal(afficheAttendLeHeros({ ...base, heros: { ...herosAvecImage, fichier: null, aImage: false } }), true, "asset sans image");
  assert.equal(afficheAttendLeHeros({ ...base, heros: herosAvecImage }), false);
  assert.equal(afficheAttendLeHeros({ ...base, personnages: [] }), false, "affiche abstraite");
});

test("affiche : l'arrivée (ou le remplacement) de l'image du héros change l'empreinte", () => {
  const sans = signatureAffiche({ ...base, heros: null });
  const avec = signatureAffiche({ ...base, heros: herosAvecImage });
  assert.notEqual(sans, avec);
  assert.notEqual(avec, signatureAffiche({ ...base, heros: { ...herosAvecImage, fichier: "7/CHAR_yasmine_v2.png" } }));
});

test("entrée du skill prompt-affiche : depuis l'image du héros, dans son apparence principale, avec le gabarit", () => {
  const e = entreeAfficheClap({ ...base, heros: herosAvecImage }) as Record<string, unknown> & { personnagePrincipal: { code: string; nom: string; description: string; imageDisponible: boolean } };
  assert.equal(e.cible, "projet");
  assert.equal(e.titreDansImage, false, "pas encore de titre : pas de lettrage");
  assert.equal((entreeAfficheClap({ ...base, titre: "La Nuit des Brumes", heros: herosAvecImage }) as { titreDansImage: boolean }).titreDansImage, true);
  assert.equal(e.personnagePrincipal.code, "CHAR_yasmine");
  assert.equal(e.personnagePrincipal.nom, "Yasmine");
  assert.equal(e.personnagePrincipal.imageDisponible, true);
  assert.match(String(e.consigne), /image 2/);
  assert.match(String(e.consigne), /never a later state/);
  assert.ok(String(e.consigne).includes(GABARIT_AFFICHE));
  assert.match(String(e.resume), /Idrissi/);
  assert.match(String(e.resume), /Lieux : la médina/);
  assert.match(String(e.genreTon), /^Aventure \+ Thriller$/);
});

test("entrée du skill prompt-affiche : sans personnage, une affiche abstraite", () => {
  const e = entreeAfficheClap({ ...base, personnages: [] });
  assert.equal(e.personnagePrincipal, null);
  assert.match(String(e.consigne), /abstract poster, without any person/);
  assert.ok(String(e.consigne).includes(GABARIT_AFFICHE));
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
