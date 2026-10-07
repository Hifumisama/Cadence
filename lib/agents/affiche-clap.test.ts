import { test } from "node:test";
import assert from "node:assert/strict";
import { entreeAfficheClap, signatureAffiche, type DonneesAffiche } from "./affiche-clap";

const base: DonneesAffiche = {
  titre: "",
  arc: "Une voleuse infiltre un riad à Tanger pour reprendre ce qu'on lui a pris. Tout bascule : on l'attendait.",
  personnages: [
    { nom: "Yasmine", reconnaissable: "manteau sombre", age: "30 ans", apparence: "cheveux courts, manteau sombre", gestuelle: "gestes précis" },
    { nom: "Idrissi", reconnaissable: "costume clair", age: "55 ans", apparence: "costume clair" },
  ],
  lieux: "la médina, le riad",
  genres: ["Aventure", "Thriller"],
  ton: 80,
  styleImage: "A moody noir look.",
  clauseStyle: "Noir.",
};
const { titre: _t, clauseStyle: _c, ...nourrit } = base;

test("signature de l'affiche : stable, et seul ce qui nourrit l'image la change", () => {
  const s = signatureAffiche(nourrit);
  assert.equal(signatureAffiche({ ...nourrit }), s, "stable");
  assert.equal(signatureAffiche({ ...nourrit, genres: ["Thriller", "Aventure"] }), s, "l'ordre des genres ne compte pas");
  assert.equal(signatureAffiche({ ...nourrit, ton: 75 }), s, "un curseur qui bouge sans changer de mot ne refait rien");
  assert.equal(signatureAffiche({ ...nourrit, arc: `  ${nourrit.arc}  ` }), s, "les espaces ne comptent pas");
  assert.notEqual(signatureAffiche({ ...nourrit, arc: `${nourrit.arc} Elle garde la boîte.` }), s, "l'histoire");
  assert.notEqual(signatureAffiche({ ...nourrit, personnages: [{ ...nourrit.personnages[0]!, age: "45 ans" }, nourrit.personnages[1]!] }), s, "le héros");
  assert.notEqual(signatureAffiche({ ...nourrit, lieux: "le désert" }), s, "les lieux");
  assert.notEqual(signatureAffiche({ ...nourrit, genres: ["Comédie"] }), s, "le genre");
  assert.notEqual(signatureAffiche({ ...nourrit, ton: 20 }), s, "le ton (autre mot)");
  assert.notEqual(signatureAffiche({ ...nourrit, styleImage: "A watercolour look." }), s, "le style");
});

test("entrée du skill prompt-affiche pour le clap : texte seul, héros décrit, titre hors image", () => {
  const e = entreeAfficheClap(base) as Record<string, unknown> & { personnagePrincipal: { nom: string; description: string; imageDisponible: boolean } };
  assert.equal(e.cible, "projet");
  assert.equal(e.titreDansImage, false);
  assert.equal(e.personnagePrincipal.nom, "Yasmine");
  assert.equal(e.personnagePrincipal.imageDisponible, false);
  assert.match(e.personnagePrincipal.description, /30 ans/);
  assert.match(String(e.resume), /Idrissi/);
  assert.match(String(e.resume), /Lieux : la médina/);
  assert.match(String(e.genreTon), /Aventure \+ Thriller, ton grave|Aventure \+ Thriller, ton sombre/);
  assert.equal(entreeAfficheClap({ ...base, personnages: [] }).personnagePrincipal, null);
});
