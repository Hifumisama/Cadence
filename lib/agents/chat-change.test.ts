import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apercu,
  carteChangement,
  carteVue,
  conceptionApresDecision,
  ficheApresDecision,
  messageDecision,
  normaliserCarteChangement,
  pointsCadre,
  pointsDetailles,
  valeurCadre,
} from "./chat-change";
import { SECTIONS_CADRE, appliquerNotes, changementsDeFiche, type Fiche } from "./sheet";
import type { Conception } from "../projects/design";

const avant: Fiche = {
  contenu: {
    genreTon: "Drame mélancolique",
    moments: ["Elle danse", "Elle se fane"],
    musique: "Slow solo piano",
    dureeEpisodeSecondes: 120,
    langueDialogues: "Français",
  },
  statuts: { genreTon: "fourni", moments: "fourni", musique: "deduit", dureeEpisodeSecondes: "fourni", langueDialogues: "fourni" },
};
const messages = ["Une danseuse dans un jardin", "En fait je veux que ce soit joyeux, et en 3 minutes !"];
const sortie = {
  modifications: { genreTon: "Comédie joyeuse", moments: ["Elle danse", "Elle rit", "Elle s'envole"], musique: "Bright marimba", dureeEpisodeSecondes: 180 },
  sources: [
    { section: "genreTon", origine: "dit", citation: "je veux que ce soit joyeux" },
    { section: "dureeEpisodeSecondes", origine: "dit", citation: "en 3 minutes" },
  ],
};

test("valeurCadre : durée dans les bornes, langue de la liste (ou son nom en français)", () => {
  assert.equal(valeurCadre("dureeEpisodeSecondes", 180), 180);
  assert.equal(valeurCadre("dureeEpisodeSecondes", "90"), 90);
  assert.equal(valeurCadre("dureeEpisodeSecondes", 5), null);
  assert.equal(valeurCadre("langueDialogues", "anglais"), "English");
  assert.equal(valeurCadre("langueDialogues", "english"), "English");
  assert.equal(valeurCadre("langueDialogues", "film muet"), "Sans dialogue");
  assert.equal(valeurCadre("langueDialogues", "Klingon"), null);
  assert.equal(valeurCadre("style", "x"), null);
});

test("carteChangement : l'histoire et le cadre, avec ce qu'il faut revoir ; rien quand rien ne change", () => {
  const apres = appliquerNotes(avant, sortie, messages, undefined, SECTIONS_CADRE);
  const changements = changementsDeFiche(avant, apres, sortie, messages);
  const cadre = pointsCadre(avant, sortie, SECTIONS_CADRE, messages);
  assert.deepEqual(cadre, [{ cle: "dureeEpisodeSecondes", valeur: 180 }]);
  const carte = carteChangement(avant, changements, cadre)!;
  assert.deepEqual(
    carte.points.map((p) => [p.cle, p.avant, p.apres, p.cadre]),
    [
      ["dureeEpisodeSecondes", "2 min", "3 min", true],
      ["genreTon", "Drame mélancolique", "Comédie joyeuse", false],
    ],
  );
  assert.equal(carte.points[0]!.libelle, "durée du film");
  assert.ok(carte.aRevoir.some((r) => /moments/.test(r)), "les moments dépendent du ton");
  assert.ok(!carte.aRevoir.includes("le nombre de moments"), "pas de doublon avec les moments à revoir");
  assert.deepEqual(carteChangement(avant, [], cadre)!.aRevoir, ["le nombre de moments"]);
  assert.deepEqual(carte.cadre, { dureeEpisodeSecondes: 180 });
  assert.equal(carte.restaurer!.contenu.genreTon, "Drame mélancolique");
  assert.equal(carteChangement(avant, [], []), null);
  // A frame value not quoted in the last message is not a request.
  assert.deepEqual(pointsCadre(avant, { ...sortie, sources: [] }, SECTIONS_CADRE, messages), []);
});

test("décision : garder remet l'histoire d'avant, prendre le nouveau écrit le cadre dans la fiche et la conception", () => {
  const apres = appliquerNotes(avant, sortie, messages, undefined, SECTIONS_CADRE);
  const carte = carteChangement(avant, changementsDeFiche(avant, apres, sortie, messages), pointsCadre(avant, sortie, SECTIONS_CADRE, messages))!;

  const gardee = ficheApresDecision(apres, carte, "garder");
  assert.equal(gardee.contenu.genreTon, "Drame mélancolique");
  assert.deepEqual(gardee.contenu.moments, ["Elle danse", "Elle se fane"]);
  assert.equal(gardee.statuts.moments, "fourni");
  assert.equal(gardee.contenu.dureeEpisodeSecondes, 120);

  const prise = ficheApresDecision(apres, carte, "nouveau");
  assert.equal(prise.contenu.genreTon, "Comédie joyeuse");
  assert.equal(prise.contenu.dureeEpisodeSecondes, 180);
  assert.equal(prise.statuts.dureeEpisodeSecondes, "fourni");

  const c = { genres: [], dureeSecondes: 120, dureeChoisie: false, rythme: "variable", langue: "Français", langueChoisie: false, style: { source: "bibliotheque", styleId: "g" } } as Conception;
  assert.deepEqual(conceptionApresDecision(c, carte, "nouveau"), { ...c, dureeSecondes: 180, dureeChoisie: true });
  assert.equal(conceptionApresDecision(c, carte, "garder"), null);

  assert.match(messageDecision(carte, "garder"), /^Je garde l'ancienne version/);
  assert.match(messageDecision(carte, "nouveau"), /^Je prends la nouvelle direction.*Revois ce qui en dépend/);
});

test("normaliserCarteChangement : aller-retour, forme abîmée refusée ; la vue ne garde que l'affichage", () => {
  const apres = appliquerNotes(avant, sortie, messages, undefined, SECTIONS_CADRE);
  const carte = carteChangement(avant, changementsDeFiche(avant, apres, sortie, messages), pointsCadre(avant, sortie, SECTIONS_CADRE, messages))!;
  assert.deepEqual(normaliserCarteChangement(JSON.parse(JSON.stringify(carte))), carte);
  assert.equal(normaliserCarteChangement({ points: [] }), null);
  assert.equal(normaliserCarteChangement("x"), null);
  const vue = carteVue({ ...carte, choix: "garder" });
  assert.deepEqual(Object.keys(vue).sort(), ["aRevoir", "choix", "points"]);
});

test("apercu : noms des listes, durée lisible, texte court", () => {
  assert.equal(apercu("lieux", [{ nom: "Le Jardin" }, { nom: "La Gare" }]), "Le Jardin, La Gare");
  assert.equal(apercu("dureeEpisodeSecondes", 150), "2 min 30");
  assert.equal(apercu("arc", ""), "—");
  assert.ok(apercu("arc", "x".repeat(300)).length <= 140);
});

test("pointsDetailles : un personnage comparé champ par champ, les moments rang par rang (projet 264)", () => {
  const avantP = [{ nom: "La jeune femme", age: "25 ans", tenue: { coupe: "robe longue", couleurs: "bleu nuit", statut: "deduit" } }];
  const apresP = [{ nom: "La jeune femme", age: "25 ans", tenue: { coupe: "salopette", couleurs: "ocre", statut: "fourni" } }];
  assert.deepEqual(pointsDetailles("personnages", avantP, apresP), [
    { cle: "personnages", sujet: "personnages", libelle: "La jeune femme (personnage) · tenue", avant: "robe longue · bleu nuit", apres: "salopette · ocre" },
  ]);
  const ajout = pointsDetailles("personnages", avantP, [...avantP, { nom: "Le chat", description: "un chat roux" }])!;
  assert.deepEqual([ajout[0]!.libelle, ajout[0]!.apres], ["Le chat (personnage)", "ajouté : un chat roux"]);
  const m = pointsDetailles("moments", ["Elle arrive.", "Elle peint.", "Elle part."], ["Elle arrive.", "Elle danse.", "Elle part."])!;
  assert.deepEqual(m.map((p) => [p.libelle, p.avant, p.apres]), [["moment 2", "Elle peint.", "Elle danse."]]);
  // Too many differences: the section is shown as a whole.
  assert.equal(pointsDetailles("moments", ["a", "b", "c", "d"], ["w", "x", "y", "z"]), null);
  assert.equal(pointsDetailles("genreTon", "a", "b"), null);
});
