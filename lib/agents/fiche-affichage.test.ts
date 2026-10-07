import { test } from "node:test";
import assert from "node:assert/strict";
import { notesPourAffichage, resumerSection } from "./fiche-affichage";
import { FICHE_VIDE, type Fiche } from "./fiche";

test("fiche vide : trois sujets requis, tous absents, rien d'autre", () => {
  const n = notesPourAffichage(FICHE_VIDE);
  assert.deepEqual(n.map((x) => [x.cle, x.statut, x.texte, x.requis]), [
    ["arc", "absent", "", true],
    ["fin", "absent", "", true],
    ["personnages", "absent", "", true],
  ]);
});

test("ce que la conception a posé n'est pas une note de l'entretien", () => {
  const f: Fiche = {
    contenu: { genreTon: "Drame", style: { nom: "G", clause: "c" }, rythme: "mesure", dureeEpisodeSecondes: 120, langueDialogues: "Français", arc: "Une cartographe retrouve une carte." },
    statuts: { genreTon: "fourni", style: "fourni", rythme: "fourni", dureeEpisodeSecondes: "fourni", langueDialogues: "fourni", arc: "fourni" },
  };
  const n = notesPourAffichage(f);
  assert.deepEqual(n.map((x) => x.cle), ["arc", "fin", "personnages"]);
  assert.equal(n[0]!.texte, "Une cartographe retrouve une carte.");
  assert.equal(n[0]!.statut, "fourni");
});

test("la fin : un fait (dite, ou laissée au scénariste), jamais un texte inventé", () => {
  const dite = notesPourAffichage({ contenu: {}, statuts: { fin: "fourni" } }).find((x) => x.cle === "fin")!;
  assert.match(dite.texte, /Dite par toi/);
  const deleguee = notesPourAffichage({ contenu: {}, statuts: { fin: "delegue" } }).find((x) => x.cle === "fin")!;
  assert.match(deleguee.texte, /Laissée au scénariste/);
});

test("personnages, lieux et autres sections en lignes lisibles ; les notes complémentaires suivent les sujets", () => {
  const f: Fiche = {
    contenu: {
      personnages: [{ nom: "Maya", role: "héroïne", age: "la trentaine", apparence: "manteau trop grand" }, { nom: "Le marchand", role: "mentor" }],
      lieux: [{ nom: "Le port", description: "brumeux" }],
      pieges: [{ cliche: "le mentor qui meurt", formulationPositive: "…" }],
      inventions: ["x"],
      notes: "n",
    },
    statuts: { personnages: "fourni", lieux: "deduit" },
  };
  const n = notesPourAffichage(f);
  assert.deepEqual(n.map((x) => x.cle), ["arc", "fin", "personnages", "lieux", "pieges"]);
  assert.equal(n[2]!.texte, "Maya : héroïne, la trentaine, manteau trop grand\nLe marchand : mentor");
  assert.deepEqual([n[3]!.statut, n[3]!.requis, n[3]!.texte], ["deduit", false, "Le port : brumeux"]);
  assert.equal(n[4]!.statut, "deduit", "sans statut connu : supposée");
});

test("resumerSection : valeurs vides et formes inattendues", () => {
  assert.equal(resumerSection("arc", "  "), "");
  assert.equal(resumerSection("lieux", []), "");
  assert.equal(resumerSection("lieux", 3), "");
  assert.equal(resumerSection("continuite", ["a", " b "]), "a\nb");
});
