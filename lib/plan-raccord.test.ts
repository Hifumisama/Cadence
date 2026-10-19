import { test } from "node:test";
import assert from "node:assert/strict";
import { argsDerniereImage, emplacementLibre, etatRaccord, extraireDerniereImage, sectionsAvecRaccord } from "./plan-raccord";

const fiche = [
  { section: "subject_definitions", contenu: "<Subject 1> is Mai from <Picture 1>, a young woman." },
  { section: "summary", contenu: "[reference generation + audio reference] The target video shows <Subject 1>." },
  { section: "retention_analysis", contenu: "<Subject 1> (appears in [Shot 1]): fully_preserved - Mai." },
  { section: "detailed_description", contenu: "[Shot 1] A medium shot of <Subject 1>." },
];
const section = (l: { section: string; contenu: string }[], nom: string) => l.find((s) => s.section === nom)?.contenu ?? "";

test("emplacement : le plus petit libre, null au plafond de 6 références visuelles (images + vidéos)", () => {
  assert.equal(emplacementLibre([], 0), 1);
  assert.equal(emplacementLibre([1, 2, 3], 0), 4);
  assert.equal(emplacementLibre([1, 3], 0), 2);
  assert.equal(emplacementLibre([1, 2, 3, 4], 2), null);
  assert.equal(emplacementLibre([1, 2, 3, 4, 5, 6], 0), null);
});

test("raccord : l'image est déclarée dans la définition, la rétention et le type de tâche, sans toucher au reste", () => {
  const r = sectionsAvecRaccord(fiche, 4);
  assert.match(section(r, "subject_definitions"), /<Picture 4> is the first frame of \[Shot 1\]/);
  assert.match(section(r, "retention_analysis"), /<Picture 4> \(\[Shot 1\] first frame\): fully_preserved/);
  assert.match(section(r, "summary"), /^\[reference generation \+ audio reference \+ keyframe completion\] The target video/);
  assert.equal(section(r, "detailed_description"), section(fiche, "detailed_description"));
  assert.ok(section(r, "subject_definitions").startsWith(section(fiche, "subject_definitions")), "les lignes existantes restent en tête");
  assert.match(section(fiche, "summary"), /^\[reference generation \+ audio reference\]/, "la fiche d'origine n'est pas modifiée");
});

test("raccord : sans effet si la fiche déclare déjà une première image du shot 1 ; type jamais répété ; section absente ajoutée", () => {
  const deja = [{ section: "subject_definitions", contenu: "<Picture 2> is the first frame of [Shot 1], a café." }, ...fiche.slice(1)];
  assert.deepEqual(sectionsAvecRaccord(deja, 5), deja);
  const avecType = [{ section: "summary", contenu: "[keyframe completion] The video." }];
  assert.equal(section(sectionsAvecRaccord(avecType, 1), "summary"), "[keyframe completion] The video.");
  const sansCrochets = sectionsAvecRaccord([{ section: "summary", contenu: "The video." }], 1);
  assert.equal(section(sansCrochets, "summary"), "[keyframe completion] The video.");
  assert.match(section(sansCrochets, "subject_definitions"), /<Picture 1> is the first frame/, "une section manquante est ajoutée");
});

test("dernière image : seek juste avant la fin (jamais négatif), PNG sur la sortie standard", () => {
  assert.deepEqual(argsDerniereImage("a.mp4", 6).slice(2, 4), ["-ss", "5.9"]);
  assert.equal(argsDerniereImage("a.mp4", 0.05)[3], "0");
  assert.ok(argsDerniereImage("a.mp4", 6).includes("png"));
});

test("dernière image : durée mesurée par ffprobe puis une seule commande ffmpeg ; une sortie vide est une erreur", async () => {
  const appels: string[][] = [];
  const executer = async (binaire: string, args: string[]) => {
    appels.push([binaire, ...args]);
    return /ffprobe/.test(binaire) ? Buffer.from("6.0\n") : Buffer.from([137, 80, 78, 71]);
  };
  const png = await extraireDerniereImage("rendu.mp4", { executer, env: {} });
  assert.equal(png.length, 4);
  assert.equal(appels.length, 2);
  assert.equal(appels[1]![0], "ffmpeg");
  await assert.rejects(extraireDerniereImage("rendu.mp4", { executer: async (b) => (/ffprobe/.test(b) ? Buffer.from("6") : Buffer.alloc(0)), env: {} }), /aucune image/);
});

test("état du raccord affiché : utilisé et à jour, périmé, absent alors que le plan enchaîne, rien à dire sinon", () => {
  const actuel = { id: 40, numeroRendu: 3 };
  const base = { liaison: "suite", precedentTitre: "Mai face au feu" };
  assert.deepEqual(etatRaccord({ ...base, utilise: 40, actuel })?.perime, false);
  assert.match(etatRaccord({ ...base, utilise: 40, actuel })!.texte, /essai n°3 de « Mai face au feu »/);
  const perime = etatRaccord({ ...base, utilise: 38, actuel })!;
  assert.equal(perime.perime, true);
  assert.match(perime.texte, /essai n°3/);
  assert.equal(etatRaccord({ ...base, utilise: 38, actuel: null })!.perime, true, "le précédent n'a plus de rendu : périmé aussi");
  assert.match(etatRaccord({ ...base, utilise: null, actuel })!.texte, /n'a pas d'image de raccord/);
  assert.equal(etatRaccord({ ...base, utilise: null, actuel: null }), null);
  assert.equal(etatRaccord({ liaison: "coupe", precedentTitre: null, utilise: null, actuel: null }), null);
});

test("raccord sans place : seulement quand les références visuelles sont au plafond", async () => {
  const { raccordSansPlace } = await import("./plan-raccord");
  assert.equal(raccordSansPlace(5), false);
  assert.equal(raccordSansPlace(6), true);
  const dit = etatRaccord({ liaison: "suite", utilise: null, actuel: { id: 9, numeroRendu: 2 }, precedentTitre: "Le quai", refsVisuelles: 6 });
  assert.match(dit?.texte ?? "", /Pas d'image de raccord : le plan enchaîne sur « Le quai », mais ses 6 références/);
  assert.equal(dit?.perime, true);
  const normal = etatRaccord({ liaison: "suite", utilise: null, actuel: { id: 9, numeroRendu: 2 }, precedentTitre: "Le quai", refsVisuelles: 4 });
  assert.match(normal?.texte ?? "", /nouvelle génération prendra la dernière image/);
});
