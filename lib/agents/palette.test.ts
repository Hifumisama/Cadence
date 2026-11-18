import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliserNuancier, normaliserPieces, nuancierEnTexte, piecesEnTexte, sansHex } from "./palette";
import { formulerReponse, messageAutresPalettes, normaliserChoix } from "./choice";
import { descriptionPersonnage } from "./registry";
import { entrees } from "./sheet-display";

test("nuancier et pièces : formes abîmées retirées, doublons retirés, texte pour les prompts (sans hex)", () => {
  const n = normaliserNuancier([{ nom: "Bleu nuit", hex: "#1B2A4A" }, { nom: "bleu nuit", hex: "#000000" }, { nom: "Ocre", hex: "ocre" }, { nom: "", hex: "#ffffff" }, { nom: "Ocre", hex: "#c8862f" }]);
  assert.deepEqual(n, [{ nom: "Bleu nuit", hex: "#1b2a4a" }, { nom: "Ocre", hex: "#c8862f" }]);
  assert.equal(nuancierEnTexte(n), "Bleu nuit, Ocre");
  const p = normaliserPieces([{ piece: "veste courte", couleur: "bleu nuit", matiere: "laine bouillie" }, { piece: "" }, { piece: "bottes", matiere: "cuir patiné" }]);
  assert.equal(piecesEnTexte(p), "veste courte en laine bouillie bleu nuit, bottes en cuir patiné");
  assert.deepEqual(normaliserNuancier("x"), []);
});

test("le prompt d'un personnage se compose des pièces quand elles existent, sinon des anciens champs", () => {
  const avec = descriptionPersonnage({ nom: "Mia", age: "25 ans", apparence: "cheveux courts", tenue: { coupe: "robe", pieces: [{ piece: "salopette", couleur: "ocre", matiere: "toile" }], nuancier: [{ nom: "Ocre", hex: "#c8862f" }] } } as never);
  assert.match(avec, /Tenue : salopette en toile ocre/);
  assert.doesNotMatch(avec, /#c8862f/);
  const sans = descriptionPersonnage({ nom: "Mia", age: "25 ans", apparence: "cheveux courts", tenue: { coupe: "robe longue", couleurs: "bleu" } } as never);
  assert.match(sans, /Tenue : robe longue, bleu/);
});

test("cartes palette : couleurs gardées (deux au moins), réponse avec les couleurs, « Propose-m'en d'autres »", () => {
  const choix = normaliserChoix({
    question: "La tenue de Marc ?",
    multiple: false,
    options: [
      { libelle: "Blouson néon", matieres: "Synthétique noir, bandes cyan", couleurs: [{ nom: "Noir", hex: "#111114" }, { nom: "Cyan", hex: "#22d3ee" }] },
      { libelle: "Costume chromé", couleurs: [{ nom: "Anthracite", hex: "#3f3f46" }] },
      { libelle: "Je te laisse décider" },
    ],
  })!;
  assert.equal(choix.options[0]!.couleurs!.length, 2);
  assert.equal(choix.options[1]!.couleurs, undefined, "une seule couleur : pas une palette");
  assert.equal(formulerReponse(choix, ["Blouson néon"]), "Blouson néon (couleurs : Noir #111114, Cyan #22d3ee ; matières : Synthétique noir, bandes cyan)");
  assert.equal(formulerReponse(choix, ["Je te laisse décider"]), "Je te laisse décider");
  assert.match(messageAutresPalettes(choix), /^Propose-m'en d'autres pour « La tenue de Marc » : trois autres palettes/);
});

test("le synopsis montre le nuancier d'un personnage et d'un lieu", () => {
  const [p] = entrees("personnages", [{ nom: "Mia", tenue: { nuancier: [{ nom: "Ocre", hex: "#c8862f" }, { nom: "Bleu", hex: "#1b2a4a" }] } }]);
  assert.equal(p!.nuancier!.length, 2);
  const [l] = entrees("lieux", [{ nom: "La place", aspect: { nuancier: [{ nom: "Terracotta", hex: "#c0623b" }] } }]);
  assert.deepEqual(l!.nuancier, [{ nom: "Terracotta", hex: "#c0623b" }]);
});

test("sansHex : les valeurs hex ne passent jamais dans un prompt", () => {
  assert.equal(sansHex("Beige #e5d9c9, Bleu gris #8a9ba8."), "Beige, Bleu gris.");
  assert.equal(sansHex("ocre (#c8862f) et blanc"), "ocre et blanc");
  const d = descriptionPersonnage({ nom: "Mia", apparence: "cheveux courts", tenue: { couleurs: "Beige #e5d9c9, Bleu gris #8a9ba8.", coupe: "tablier" } } as never);
  assert.doesNotMatch(d, /#/);
});
