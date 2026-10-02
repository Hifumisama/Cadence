import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASPECTS,
  ASPECTS_COMFYUI,
  estAspect,
  formatParDefaut,
  loraParDefaut,
  nomSourceDistante,
  nouvelleSeed,
  DUREE_AUDIO_DEFAUT,
  dureeAudioValide,
  formaterDuree,
  raisonAudioNonGenerable,
  raisonDemandeAudioInvalide,
  raisonDemandeInvalide,
  raisonNonGenerable,
  TEMPERATURE_VOIX_DEFAUT,
  TEMPERATURE_VOIX_MAX,
  TEMPERATURE_VOIX_MIN,
  langueDuTexteDeReference,
  raisonDemandeVoixInvalide,
  raisonVoixNonGenerable,
  temperatureVoixValide,
  type DemandeGeneration,
} from "./asset-generation";

test("format par défaut : décor en 16:9, le reste en carré", () => {
  assert.deepEqual(formatParDefaut("decor"), { aspect: "16:9", megapixels: 1.3 });
  assert.deepEqual(formatParDefaut("personnage"), { aspect: "1:1", megapixels: 1 });
  assert.ok(ASPECTS.every((a) => estAspect(a) && ASPECTS_COMFYUI[a].startsWith(a)));
  assert.ok(!estAspect("5:4"));
});

test("LoRA de fiche personnage : personnages seulement", () => {
  assert.equal(loraParDefaut("personnage"), true);
  assert.equal(loraParDefaut("decor"), false);
});

test("génération impossible au niveau asset : la voix seulement", () => {
  const ok = { type: "decor", promptGeneration: "A hall", methodeGeneration: null };
  assert.equal(raisonNonGenerable(ok), null);
  assert.equal(raisonNonGenerable({ type: "decor" }), null);
  // l'édition et le prompt vide ne bloquent plus l'asset : la popup les vérifie
  assert.equal(raisonNonGenerable({ ...ok, methodeGeneration: "edition" }), null);
  assert.equal(raisonNonGenerable({ ...ok, promptGeneration: "  " }), null);
  assert.match(raisonNonGenerable({ ...ok, type: "voix" }) ?? "", /casting vocal/);
});

const demande: DemandeGeneration = {
  mode: "texte",
  prompt: "A hall",
  aspect: "16:9",
  megapixels: 1.3,
  loraPersonnage: false,
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
  // format et mégapixels ne comptent pas en mode images
  assert.equal(raisonDemandeInvalide({ ...images, sources: [a] }), null);
  assert.equal(raisonDemandeInvalide({ ...images, sources: [a, b, c] }), null);
  assert.match(raisonDemandeInvalide({ ...images, sources: [] }) ?? "", /au moins une image/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [a, b, c, d] }) ?? "", /maximum/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [a, a] }) ?? "", /deux fois/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [c, { ...c }] }) ?? "", /deux fois/);
  assert.match(raisonDemandeInvalide({ ...images, sources: [{ origine: "web" } as never] }) ?? "", /inconnue/);
});

test("un son (sfx) ne se génère pas par image, une image pas par audio", () => {
  assert.match(raisonNonGenerable({ type: "sfx" }) ?? "", /audio/);
  assert.equal(raisonAudioNonGenerable("sfx"), null);
  assert.match(raisonAudioNonGenerable("decor") ?? "", /sons/);
  assert.match(raisonAudioNonGenerable("voix") ?? "", /casting vocal/);
});

test("demande audio : prompt non vide, durée entre 1 et 60 s", () => {
  const ok = { prompt: "Heavy oak door creaking open slowly.", dureeSecondes: DUREE_AUDIO_DEFAUT };
  assert.equal(raisonDemandeAudioInvalide(ok), null);
  assert.equal(raisonDemandeAudioInvalide({ ...ok, dureeSecondes: 2.5 }), null);
  assert.equal(raisonDemandeAudioInvalide({ ...ok, dureeSecondes: 1 }), null);
  assert.equal(raisonDemandeAudioInvalide({ ...ok, dureeSecondes: 60 }), null);
  assert.match(raisonDemandeAudioInvalide({ ...ok, prompt: "  " }) ?? "", /prompt/);
  assert.match(raisonDemandeAudioInvalide({ ...ok, dureeSecondes: 0.5 }) ?? "", /Durée/);
  assert.match(raisonDemandeAudioInvalide({ ...ok, dureeSecondes: 61 }) ?? "", /Durée/);
  assert.match(raisonDemandeAudioInvalide({ ...ok, dureeSecondes: Number.NaN }) ?? "", /Durée/);
  assert.equal(dureeAudioValide("4"), false);
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

test("voix : créativité de 0,8 à 1,2, 1,1 par défaut", () => {
  assert.equal(TEMPERATURE_VOIX_MIN, 0.8);
  assert.equal(TEMPERATURE_VOIX_MAX, 1.2);
  assert.equal(TEMPERATURE_VOIX_DEFAUT, 1.1);
  assert.equal(temperatureVoixValide(TEMPERATURE_VOIX_DEFAUT), true);
  for (const v of [0.8, 1, 1.2]) assert.equal(temperatureVoixValide(v), true, String(v));
  for (const v of [0.79, 1.21, Number.NaN, "1.1", null]) assert.equal(temperatureVoixValide(v), false, String(v));
});

test("voix : une demande exige instruction, texte et créativité valides", () => {
  const ok = { instruction: "A calm native French speaker.", texteReference: "Welcome adventurer.", temperature: 1.1 };
  assert.equal(raisonDemandeVoixInvalide(ok), null);
  assert.match(raisonDemandeVoixInvalide({ ...ok, instruction: "  " }) ?? "", /instruction/i);
  assert.match(raisonDemandeVoixInvalide({ ...ok, texteReference: "" }) ?? "", /texte/i);
  assert.match(raisonDemandeVoixInvalide({ ...ok, temperature: 1.5 }) ?? "", /Créativité/);
});

test("voix : seul un asset voix se génère ainsi", () => {
  assert.equal(raisonVoixNonGenerable("voix"), null);
  assert.match(raisonVoixNonGenerable("personnage") ?? "", /voix/);
  assert.match(raisonVoixNonGenerable("sfx") ?? "", /voix/);
});

test("voix : langue du texte lu, anglais pour le texte du projet", () => {
  const defaut = "Welcome adventurer, and be my guest.";
  assert.equal(langueDuTexteDeReference(defaut, defaut, "French"), "English");
  assert.equal(langueDuTexteDeReference(`  ${defaut} `, defaut, "French"), "English");
  assert.equal(langueDuTexteDeReference("Bienvenue, aventurier.", defaut, "French"), "French");
  assert.equal(langueDuTexteDeReference("Bienvenue.", defaut, "  "), "French");
});
