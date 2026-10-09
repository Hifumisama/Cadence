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
  assert.deepEqual(formatParDefaut("personnage"), { aspect: "16:9", megapixels: 1.3 });
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

test("voix : créativité de 0,8 à 1,2, 1,2 par défaut", () => {
  assert.equal(TEMPERATURE_VOIX_MIN, 0.8);
  assert.equal(TEMPERATURE_VOIX_MAX, 1.2);
  assert.equal(TEMPERATURE_VOIX_DEFAUT, 1.2);
  assert.equal(temperatureVoixValide(TEMPERATURE_VOIX_DEFAUT), true);
  for (const v of [0.8, 1, 1.2]) assert.equal(temperatureVoixValide(v), true, String(v));
  for (const v of [0.79, 1.21, Number.NaN, "1.1", null]) assert.equal(temperatureVoixValide(v), false, String(v));
});

test("voix : une demande exige instruction, texte et créativité valides", () => {
  const ok = { instruction: "A calm native French speaker.", texteReference: "Welcome adventurer. Come have a seat.", temperature: 1.1 };
  assert.equal(raisonDemandeVoixInvalide(ok), null);
  assert.match(raisonDemandeVoixInvalide({ ...ok, instruction: "  " }) ?? "", /instruction/i);
  assert.match(raisonDemandeVoixInvalide({ ...ok, texteReference: "" }) ?? "", /texte/i);
  assert.match(raisonDemandeVoixInvalide({ ...ok, temperature: 1.5 }) ?? "", /Créativité/);
  // La réplique d'écoute doit compter au moins deux phrases.
  assert.match(raisonDemandeVoixInvalide({ ...ok, texteReference: "Welcome adventurer." }) ?? "", /2 phrases/);
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

test("test de voix : les méthodes sont des méthodes à part, l'audio d'un test est un son", async () => {
  const g = await import("./asset-generation");
  assert.equal(g.estMethodeTestVoix(g.METHODE_TEST_AUDIO), true);
  assert.equal(g.estMethodeTestVoix(g.METHODE_TEST_VIDEO), true);
  assert.equal(g.estMethodeTestVoix(g.METHODE_VOIX), false);
  assert.equal(g.estMethodeSon(g.METHODE_TEST_AUDIO), true);
  assert.equal(g.estMethodeSon(g.METHODE_VOIX), true);
  assert.equal(g.estMethodeSon(g.METHODE_TEST_VIDEO), false);
  assert.ok(g.METHODE_TEST_AUDIO.length <= 12 && g.METHODE_TEST_VIDEO.length <= 12, "la colonne `methode` est un varchar(12)");
});

test("test de voix : un test audio exige une référence et un texte, un test vidéo un audio et un texte", async () => {
  const g = await import("./asset-generation");
  assert.match(g.raisonTestAudioInvalide({ texte: "Bonjour", referenceFichier: null }) ?? "", /voix de référence/);
  assert.match(g.raisonTestAudioInvalide({ texte: "  ", referenceFichier: "VOICE_maya.mp3" }) ?? "", /texte/);
  assert.equal(g.raisonTestAudioInvalide({ texte: "Bonjour", referenceFichier: "VOICE_maya.mp3" }), null);
  assert.match(g.raisonTestVideoInvalide({ texte: "Bonjour", audio: null }) ?? "", /audio/);
  assert.match(g.raisonTestVideoInvalide({ texte: "", audio: "assets/x.mp3" }) ?? "", /texte/);
  assert.equal(g.raisonTestVideoInvalide({ texte: "Bonjour", audio: "assets/x.mp3" }), null);
});

test("test de voix : les paramètres figés sont relus avec prudence", async () => {
  const g = await import("./asset-generation");
  assert.deepEqual(g.parametresTestVideo({ upscale: true, personnage: "assets/a.png", decor: "", audio: "voix/1/test_audio.mp3" }), {
    personnage: "assets/a.png",
    decor: null,
    audio: "voix/1/test_audio.mp3",
    audioGenerationId: null,
  });
  assert.equal(g.parametresTestVideo(null), null);
  assert.equal(g.parametresTestVideo("x"), null);
  assert.deepEqual(g.parametresTestVideo({ personnage: "x" }), { personnage: "x", decor: null, audio: null, audioGenerationId: null }, "plus de mode : l'ancien champ `upscale` est ignoré");
  // L'audio peut venir d'une génération « test audio » posée juste avant (texte ≠ réplique d'écoute).
  assert.equal(g.parametresTestVideo({ audioGenerationId: 42 })!.audioGenerationId, 42);
  assert.equal(g.parametresTestVideo({ audioGenerationId: "42" })!.audioGenerationId, null);
  assert.equal(g.parametresTestVideo({ audioGenerationId: 4.5 })!.audioGenerationId, null);
  assert.deepEqual(g.parametresTestAudio({ reference: "assets/VOICE_maya.mp3" }), { reference: "assets/VOICE_maya.mp3" });
  assert.equal(g.parametresTestAudio({ reference: " " }), null);
  assert.equal(g.parametresTestAudio("x"), null);
});

test("seed TTS : toujours dans la plage 32 bits du moteur vocal (HTTP 400 de ComfyUI au-delà)", async () => {
  const g = await import("./asset-generation");
  assert.equal(g.SEED_TTS_MAX, 4294967295);
  for (let i = 0; i < 2000; i++) {
    const n = Number(g.nouvelleSeedTts());
    assert.ok(Number.isInteger(n) && n >= 0 && n <= g.SEED_TTS_MAX, String(n));
  }
  // Les seeds des images/sons/vidéos restent larges (KSampler, easy seed).
  assert.ok(Number.MAX_SAFE_INTEGER > 2 ** 48);
});

test("seedTts : une seed valide est inchangée, une trop grande est repliée de façon déterministe", async () => {
  const g = await import("./asset-generation");
  assert.equal(g.seedTts("0"), 0);
  assert.equal(g.seedTts("4294967295"), 4294967295);
  assert.equal(g.seedTts("4294967296"), 0);
  assert.equal(g.seedTts("391417644818565"), 391417644818565 % 4294967296);
  assert.equal(g.seedTts("391417644818565"), g.seedTts(391417644818565), "même seed, même résultat");
  assert.ok(g.seedTts(String(2 ** 48 - 1)) <= g.SEED_TTS_MAX);
  assert.throws(() => g.seedTts("abc"), /Seed invalide/);
  assert.throws(() => g.seedTts("-1"), /Seed invalide/);
});
