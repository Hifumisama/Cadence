import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASPECTS,
  ASPECTS_COMFYUI,
  estAspect,
  methodeDEssai,
  raisonConsigneInvalide,
  formatParDefaut,
  nomSourceDistante,
  nouvelleSeed,
  formaterDuree,
  raisonDemandeInvalide,
  type DemandeGeneration,
} from "./asset-generation";

test("format par défaut : décor en 16:9, le reste en carré", () => {
  assert.deepEqual(formatParDefaut("decor"), { aspect: "16:9", megapixels: 1.3 });
  assert.deepEqual(formatParDefaut("personnage"), { aspect: "16:9", megapixels: 1.3 });
  assert.ok(ASPECTS.every((a) => estAspect(a) && ASPECTS_COMFYUI[a].startsWith(a)));
  assert.ok(!estAspect("5:4"));
});

const demande: DemandeGeneration = {
  mode: "texte",
  prompt: "A hall",
  aspect: "16:9",
  megapixels: 1.3,
  sources: [],
};

test("demande : mode texte", () => {
  assert.equal(raisonDemandeInvalide(demande), null);
  assert.match(raisonDemandeInvalide({ ...demande, prompt: "  " }) ?? "", /prompt/);
  assert.match(raisonDemandeInvalide({ ...demande, aspect: "5:4" as never }) ?? "", /Format/);
  assert.match(raisonDemandeInvalide({ ...demande, megapixels: 9 }) ?? "", /Mégapixels/);
  assert.match(raisonDemandeInvalide({ ...demande, megapixels: Number.NaN }) ?? "", /Mégapixels/);
});

test("demande : mode images, de 1 à 3 sources sans doublon", () => {
  const images = { ...demande, mode: "images" as const, aspect: "nimporte" as never, megapixels: 99 };
  const a = { origine: "asset" as const, assetId: 1 };
  const b = { origine: "asset" as const, assetId: 2 };
  const c = { origine: "import" as const, fichier: "x.png" };
  const d = { origine: "import" as const, fichier: "y.png" };
  // format and megapixels do not count in images mode
  assert.equal(raisonDemandeInvalide({ ...images, sources: [a] }), null);
  assert.equal(raisonDemandeInvalide({ ...images, sources: [a, b, c] }), null);
  assert.match(raisonDemandeInvalide({ ...images, sources: [] }) ?? "", /au moins une image/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [a, b, c, d] }) ?? "", /maximum/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [a, a] }) ?? "", /deux fois/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [c, { ...c }] }) ?? "", /deux fois/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [{ origine: "web" } as never] }) ?? "", /inconnue/);
});

test("durée affichée : décimale à la française", () => {
  assert.equal(formaterDuree(4), "4 s");
  assert.equal(formaterDuree(2.5), "2,5 s");
  assert.equal(formaterDuree(2.449), "2,4 s");
});

test("nom de source côté ComfyUI : unique par génération et par rang", () => {
  assert.equal(nomSourceDistante("abc", 2, ".png"), "cadence_abc_2.png");
  assert.notEqual(nomSourceDistante("abc", 1, ".png"), nomSourceDistante("abc", 2, ".png"));
});

test("seed : entier positif sûr", () => {
  const s = Number(nouvelleSeed());
  assert.ok(Number.isSafeInteger(s) && s >= 0);
});

test("master de voix : paramètres, vidéo à côté de l'audio", async () => {
  const g = await import("./asset-generation");
  assert.deepEqual(g.parametresMasterVoix({ personnage: "assets/CHAR_maya.png" }), { personnage: "assets/CHAR_maya.png" });
  assert.deepEqual(g.parametresMasterVoix({ personnage: " " }), { personnage: null });
  assert.equal(g.parametresMasterVoix(null), null);
  assert.equal(g.videoDeMaster("abc-123.mp3"), "abc-123.mp4");
  assert.equal(g.videoDeMaster("sans-extension"), "sans-extension.mp4");
});

test("méthode d'un essai : sans image de base Krea 2 (génération), avec image Qwen Image Edit (édition)", () => {
  assert.equal(methodeDEssai(false), "generation");
  assert.equal(methodeDEssai(true), "edition");
});

test("consigne d'un essai : une retouche exige une consigne, une création peut partir de la description", () => {
  assert.equal(raisonConsigneInvalide("les cheveux plus courts", true, null), null);
  assert.match(raisonConsigneInvalide("  ", true, "Une danseuse")!, /changer/);
  assert.equal(raisonConsigneInvalide("", false, "Une danseuse"), null);
  assert.match(raisonConsigneInvalide("", false, "  ")!, /Décris/);
  assert.equal(raisonConsigneInvalide("une danseuse rousse", false, null), null);
  assert.match(raisonConsigneInvalide("x".repeat(2001), false, "d")!, /trop longue/);
});
