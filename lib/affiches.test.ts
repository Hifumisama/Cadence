import assert from "node:assert/strict";
import { test } from "node:test";
import { TYPE_AFFICHE, avecTitreDansImage, cibleDeCodeAffiche, codeAffiche, formatAfficheParDefaut, personnagePrincipal, promptAffiche, titreDansPrompt } from "./affiches";
import { posterPorteLeTitre } from "./poster";

test("code d'affiche : un par projet, par saison, par épisode, et on retrouve la cible", () => {
  assert.equal(codeAffiche("projects", 12), "AFFICHE_P12");
  assert.equal(codeAffiche("episodes", 7), "AFFICHE_E7");
  assert.equal(codeAffiche("seasons", 3), "AFFICHE_S3");
  assert.deepEqual(cibleDeCodeAffiche("AFFICHE_P12"), { cible: "projects", id: 12 });
  assert.deepEqual(cibleDeCodeAffiche("AFFICHE_E7"), { cible: "episodes", id: 7 });
  assert.deepEqual(cibleDeCodeAffiche("AFFICHE_S3"), { cible: "seasons", id: 3 });
});

test("un code de registre ordinaire n'est jamais pris pour une affiche", () => {
  for (const code of ["CHAR_maya", "DEC_auberge", "AFFICHE_X1", "AFFICHE_P", "AFFICHE_P12x", "affiche_p1", "XAFFICHE_P1"]) {
    assert.equal(cibleDeCodeAffiche(code), null, code);
  }
});

test("le type d'asset d'affiche ne collisionne avec aucun type du registre", () => {
  assert.equal(TYPE_AFFICHE, "affiche");
  assert.ok(!["personnage", "decor", "voix", "prop", "vfx", "sfx", "keyframe", "oth"].includes(TYPE_AFFICHE));
});

test("format par défaut : 2:3 pour toutes les affiches", () => {
  assert.equal(formatAfficheParDefaut().aspect, "2:3");
});

test("prompt d'affiche : de la prose, sans étiquette ni titre cité, et il interdit tout texte", () => {
  const p = promptAffiche({ cible: "projects", titre: "La Nuit de Tanger", resume: "Une voleuse infiltre un riyad.", genreTon: "aventure légère" });
  assert.match(p, /aventure légère mood/);
  assert.match(p, /Une voleuse infiltre un riyad\./);
  assert.match(p, /Vertical poster composition/);
  assert.doesNotMatch(p, /Story:|Mood:|Nuit de Tanger/);
  assert.match(p, /No text, no lettering/);
  assert.equal(titreDansPrompt(p), false);
});

test("prompt d'affiche : sans résumé ni ton, rien d'inventé ; toutes les affiches sont verticales", () => {
  const p = promptAffiche({ cible: "episodes", titre: "Le sel", resume: "  ", genreTon: null });
  assert.doesNotMatch(p, /The scene:/);
  assert.doesNotMatch(p, /mood/);
  assert.match(p, /Vertical poster composition/);
});

test("titre dans l'image : la ligne de titre remplace la ligne « sans texte », et inversement", () => {
  const base = promptAffiche({ cible: "projects", titre: "Le Voile Écarlate", resume: "Une garde." });
  const avec = avecTitreDansImage(base, "Le Voile Écarlate", true);
  assert.equal(titreDansPrompt(avec), true);
  assert.match(avec, /Title lettering: "Le Voile Écarlate"/);
  assert.doesNotMatch(avec, /No text, no lettering/);
  // idempotent, et réversible sans toucher au reste
  assert.equal(avecTitreDansImage(avec, "Le Voile Écarlate", true), avec);
  assert.equal(avecTitreDansImage(avec, "Le Voile Écarlate", false), base);
  // un prompt écrit à la main garde son contenu
  assert.match(avecTitreDansImage("A knight at dawn.", "X", true), /^A knight at dawn\.\nTitle lettering: "X"/);
  // des guillemets dans le titre ne cassent pas la ligne
  assert.match(avecTitreDansImage("A.", 'Le "Rubis"', true), /Title lettering: "Le 'Rubis'"/);
});

test("un titre demandé dans l'image dès le gabarit donne la même chose qu'une bascule", () => {
  const direct = promptAffiche({ cible: "projects", titre: "Rubis", resume: "Une garde.", titreDansImage: true });
  assert.equal(direct, avecTitreDansImage(promptAffiche({ cible: "projects", titre: "Rubis", resume: "Une garde." }), "Rubis", true));
});

test("personnage principal : le premier du brief retrouvé dans le registre, sinon le premier avec image", () => {
  const registre = [
    { code: "CHAR_iris", description: "Iris, gardienne aux cheveux gris", aImage: false },
    { code: "CHAR_maya", description: "Maya, voleuse agile", aImage: true },
  ];
  assert.equal(personnagePrincipal([{ nom: "Maya" }, { nom: "Iris" }], registre)?.asset.code, "CHAR_maya");
  assert.equal(personnagePrincipal([{ nom: "Gardienne Iris" }], registre)?.asset.code, "CHAR_iris");
  // accents et casse ignorés
  assert.equal(personnagePrincipal([{ nom: "MÁYA" }], registre)?.asset.code, "CHAR_maya");
  // aucun nom reconnu : repli sur le premier personnage qui a une image
  const repli = personnagePrincipal([{ nom: "Inconnu" }], registre);
  assert.equal(repli?.asset.code, "CHAR_maya");
  assert.equal(repli?.nom, null);
  assert.equal(personnagePrincipal([], []), null);
});

test("une affiche dont le modèle a écrit le titre est reconnue à son nom de fichier", () => {
  assert.equal(posterPorteLeTitre("/api/media/projects/1/poster-abc-titre.png"), true);
  assert.equal(posterPorteLeTitre("/api/media/projects/1/poster-abc.png"), false);
  assert.equal(posterPorteLeTitre(null), false);
});
