import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDRE_NOTES, notesPourAffichage, resumerSection, synopsisPourAffichage } from "./sheet-display";
import { FICHE_VIDE, type Fiche } from "./sheet";

test("fiche vide : quatre sujets requis, tous absents, rien d'autre", () => {
  const n = notesPourAffichage(FICHE_VIDE);
  assert.deepEqual(n.map((x) => [x.cle, x.statut, x.texte, x.requis]), [
    ["arc", "absent", "", true],
    ["fin", "absent", "", true],
    ["personnages", "absent", "", true],
    ["moments", "absent", "", true],
  ]);
});

test("ce que la conception a posé n'est pas une note de l'entretien", () => {
  const f: Fiche = {
    contenu: { genreTon: "Drame", style: { nom: "G", clause: "c" }, rythme: "mesure", dureeEpisodeSecondes: 120, langueDialogues: "Français", arc: "Une cartographe retrouve une carte." },
    statuts: { genreTon: "fourni", style: "fourni", rythme: "fourni", dureeEpisodeSecondes: "fourni", langueDialogues: "fourni", arc: "fourni" },
  };
  const n = notesPourAffichage(f);
  assert.deepEqual(n.map((x) => x.cle), ["arc", "fin", "personnages", "moments"]);
  assert.equal(n[0]!.texte, "Une cartographe retrouve une carte.");
  assert.equal(n[0]!.statut, "fourni");
});

test("la fin : un fait (dite, ou laissée au scénariste), jamais un texte inventé", () => {
  const dite = notesPourAffichage({ contenu: {}, statuts: { fin: "fourni" } }).find((x) => x.cle === "fin")!;
  assert.match(dite.texte, /Dite par toi/);
  const deleguee = notesPourAffichage({ contenu: {}, statuts: { fin: "delegue" } }).find((x) => x.cle === "fin")!;
  assert.match(deleguee.texte, /Laissée au scénariste/);
});

test("personnages, lieux et autres sections en lignes lisibles, dans l'ordre de lecture", () => {
  const f: Fiche = {
    contenu: {
      personnages: [{ nom: "Maya", role: "héroïne", age: "la trentaine", apparence: "manteau trop grand" }, { nom: "Le marchand", role: "mentor" }],
      lieux: [{ nom: "Le port", description: "brumeux" }],
      univers: "Une œuvre existante.",
      inventions: ["x"],
      notes: "n",
    },
    statuts: { personnages: "fourni", lieux: "deduit" },
  };
  const n = notesPourAffichage(f);
  assert.deepEqual(n.map((x) => x.cle), ["arc", "fin", "univers", "personnages", "lieux", "moments"]);
  assert.equal(n[3]!.texte, "Maya : héroïne, la trentaine, manteau trop grand.\nLe marchand : mentor.");
  assert.deepEqual([n[4]!.statut, n[4]!.requis, n[4]!.texte], ["deduit", false, "Le port : brumeux."]);
  assert.equal(n[2]!.statut, "deduit", "sans statut connu : supposée");
});

test("resumerSection : valeurs vides et formes inattendues", () => {
  assert.equal(resumerSection("arc", "  "), "");
  assert.equal(resumerSection("lieux", []), "");
  assert.equal(resumerSection("lieux", 3), "");
  assert.equal(resumerSection("inventions",["a", " b "]), "a\nb");
});

test("ordre de lecture : titre, histoire, fin, univers, personnages, lieux, effets, moments, épisodes ; l'inconnu à la fin", () => {
  assert.deepEqual([...ORDRE_NOTES], ["titre", "arc", "fin", "univers", "personnages", "lieux", "elements", "moments", "episodes"]);
  const f: Fiche = {
    contenu: {
      episodes: [{ titre: "Un", resume: "r" }],
      autre: "x",
      moments: ["Maya court sur le quai."],
      elements: [{ nom: "La carte", description: "qui brille" }],
      lieux: [{ nom: "Le port" }],
      personnages: [{ nom: "Maya" }],
      univers: "u",
      arc: "a",
      titre: "La carte",
    },
    statuts: {},
  };
  assert.deepEqual(notesPourAffichage(f).map((x) => x.cle), ["titre", "arc", "fin", "univers", "personnages", "lieux", "elements", "moments", "episodes", "autre"]);
});

test("synopsis : toute la fiche, choix de la conception compris ; titre provisoire tu", () => {
  const f: Fiche = {
    contenu: {
      titre: "Sans titre",
      arc: " Une cartographe retrouve une carte. ",
      genreTon: "Drame",
      style: { nom: "Gravure", clause: "c" },
      dureeEpisodeSecondes: 30,
      langueDialogues: "Français",
      personnages: [{ nom: "Maya", role: "héroïne", tenue: { couleurs: "bleu" } }],
      lieux: [{ nom: "Le port", aspect: { lumiere: "aube" } }],
      moments: ["Maya court.", "Elle saute.", "Elle tombe."],
    },
    statuts: { fin: "delegue", moments: "fourni" },
  };
  const s = synopsisPourAffichage(f);
  assert.equal(s.titre, "");
  assert.equal(s.arc, "Une cartographe retrouve une carte.");
  assert.equal(s.fin, "Laissée au scénariste.");
  assert.deepEqual([s.genreTon, s.dureeSecondes, s.style, s.langue], ["Drame", 30, "Gravure", "Français"]);
  assert.deepEqual(s.personnages, [{ nom: "Maya", detail: "héroïne.", extra: "Tenue : bleu." }]);
  assert.deepEqual(s.lieux, [{ nom: "Le port", detail: "", extra: "aube." }]);
  assert.deepEqual([s.elements, s.episodes], [[], []]);
  assert.equal(s.sequence.moments.length, 3);
  assert.equal(s.sequence.status, "fourni");
  assert.equal(synopsisPourAffichage({ contenu: { titre: "La carte" }, statuts: {} }).titre, "La carte");
  assert.equal(synopsisPourAffichage({ contenu: { dureeEpisodeSecondes: "60" }, statuts: {} }).dureeSecondes, null);
});
