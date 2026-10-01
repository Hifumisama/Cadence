import assert from "node:assert/strict";
import { test } from "node:test";
import { TEXTE_REFERENCE_DEFAUT, checksInstruction, checksReference, estEtapeVoix, etatPhases, promptTestVoix } from "./voix";

const base = { source: "design" as const, instruction: null, referenceFichier: null, refText: "", testVideo: null, nbRepliques: 0, nbRepliquesMesurees: 0 };

test("étapes : rien de fait, tout est vide", () => {
  assert.deepEqual(etatPhases(base), { voix: "vide", reference: "vide", test: "vide", repliques: "vide" });
});

test("étape voix : design = instruction + texte de référence", () => {
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker" }).voix, "part");
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker", refText: "Bonjour." }).voix, "on");
});

test("étape voix : audio fourni = fichier + texte de référence", () => {
  const v = { ...base, source: "reference" as const, referenceFichier: "VOICE_x.wav" };
  assert.equal(etatPhases(v).voix, "part");
  assert.equal(etatPhases({ ...v, refText: "Bonjour." }).voix, "on");
});

test("étapes : référence, test et répliques", () => {
  const e = etatPhases({ ...base, referenceFichier: "a.flac", testVideo: "t.mp4", nbRepliques: 2, nbRepliquesMesurees: 1 });
  assert.equal(e.reference, "on");
  assert.equal(e.test, "on");
  assert.equal(e.repliques, "part");
});

test("estEtapeVoix", () => {
  assert.ok(estEtapeVoix("test"));
  assert.ok(!estEtapeVoix("tenue"));
  assert.ok(!estEtapeVoix(undefined));
});

test("garde-fous de l'instruction", () => {
  assert.deepEqual(checksInstruction(""), []);
  const titres = checksInstruction("A posh voice, not loud, close-miked").map((c) => c.titre);
  assert.ok(titres.includes("Langue native non nommée"));
  assert.ok(titres.includes("Négations"));
  assert.ok(titres.includes("Description de prise de son"));
  assert.ok(titres.includes("Mot qui traîne un accent"));
  assert.deepEqual(checksInstruction("A native French speaker, warm and slow"), []);
});

test("garde-fous de la référence", () => {
  assert.deepEqual(checksReference({ fichier: null, refText: "" }), []);
  assert.equal(checksReference({ fichier: "a.mp3", refText: "x" }).length, 1);
  assert.equal(checksReference({ fichier: "a.flac", refText: " " }).length, 1);
});

test("prompt de test : la réplique est citée telle quelle dans <d>", () => {
  const texte = "Vous êtes déjà venu ici, non ? Non... je m'en souviendrais.";
  const p = promptTestVoix({ texte, personnage: { code: "CHAR_maya", description: "a tall woman." }, decor: null, avecAudio: true });
  assert.ok(p.includes(`<d>[Français] ${texte}</d>`));
  assert.ok(p.includes("<Picture 1>"));
  assert.ok(p.includes("<Audio 1>"));
  const sans = promptTestVoix({ texte, personnage: null, decor: { code: "DEC_x", description: null }, avecAudio: false });
  assert.ok(!sans.includes("<Audio 1>"));
  assert.ok(sans.includes("<Picture 1>"));
});

test("texte de référence par défaut : non vide, en anglais", () => {
  assert.ok(TEXTE_REFERENCE_DEFAUT.trim().length > 20);
  assert.match(TEXTE_REFERENCE_DEFAUT, /welcome/i);
});
