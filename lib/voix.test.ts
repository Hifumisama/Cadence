import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TEXTE_REFERENCE_DEFAUT,
  changementDemandeConfirmation,
  checksInstruction,
  checksReference,
  compterPhrases,
  estEtapeVoix,
  etapeDepuisParametre,
  etatFiche,
  etatPhases,
  nomVoix,
  promptTestVoix,
  raisonGenerationReference,
  verdictSuppressionVoix,
} from "./voix";

const base = { source: "design" as const, instruction: null, referenceFichier: null, refText: "", statut: "a_produire", testVideo: null, nbRepliques: 0, nbRepliquesMesurees: 0 };
const DEUX_PHRASES = "Bonjour, ravi de vous voir. Installez-vous.";

test("étapes : rien de fait, tout est vide", () => {
  assert.deepEqual(etatPhases(base), { fiche: "vide", reference: "vide", validation: "vide", repliques: "vide" });
});

test("étape fiche : design = instruction + réplique d'écoute de deux phrases", () => {
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker" }).fiche, "part");
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker", refText: "Bonjour." }).fiche, "part");
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker", refText: DEUX_PHRASES }).fiche, "on");
});

test("étape fiche : audio fourni = fichier + réplique d'écoute", () => {
  const v = { ...base, source: "reference" as const, referenceFichier: "VOICE_x.wav" };
  assert.equal(etatPhases(v).fiche, "part");
  assert.equal(etatPhases({ ...v, refText: DEUX_PHRASES }).fiche, "on");
});

test("étapes : référence, validation et répliques", () => {
  const e = etatPhases({ ...base, referenceFichier: "a.flac", testVideo: "t.mp4", nbRepliques: 2, nbRepliquesMesurees: 1 });
  assert.equal(e.reference, "on");
  assert.equal(e.validation, "part"); // un test vidéo existe, la voix n'est pas validée
  assert.equal(e.repliques, "part");
  assert.equal(etatPhases({ ...base, referenceFichier: "a.flac", statut: "valide" }).validation, "on");
  assert.equal(etatPhases({ ...base, statut: "valide" }).validation, "vide"); // « valide » sans référence ne compte pas
});

test("estEtapeVoix et étape demandée : la fiche s'ouvre sur l'étape 1 sauf ?etape= explicite", () => {
  assert.ok(estEtapeVoix("validation"));
  assert.ok(!estEtapeVoix("test"));
  assert.ok(!estEtapeVoix(undefined));
  assert.equal(etapeDepuisParametre(undefined), "fiche");
  assert.equal(etapeDepuisParametre("n'importe quoi"), "fiche");
  assert.equal(etapeDepuisParametre("repliques"), "repliques");
  assert.equal(etapeDepuisParametre("test"), "validation"); // ancien nom (liens du bandeau de suivi)
  assert.equal(etapeDepuisParametre("voix"), "fiche");
});

test("état d'une fiche : à créer sans référence, à valider avec, validée si le statut l'est", () => {
  assert.equal(etatFiche({ fichier: null, statut: "a_produire" }), "a_creer");
  assert.equal(etatFiche({ fichier: null, statut: "valide" }), "a_creer");
  assert.equal(etatFiche({ fichier: "VOICE_x.wav", statut: "a_produire" }), "a_valider");
  assert.equal(etatFiche({ fichier: "VOICE_x.wav", statut: "en_cours" }), "a_valider");
  assert.equal(etatFiche({ fichier: "VOICE_x.wav", statut: "valide" }), "validee");
});

test("nom d'une voix : le personnage assigné, sinon le code de la voix, sans préfixe", () => {
  assert.equal(nomVoix({ code: "VOICE_maya", personnageCode: "CHAR_conspirateur_nerveux" }), "Conspirateur nerveux");
  assert.equal(nomVoix({ code: "VOICE_voix_off", personnageCode: null }), "Voix off");
  assert.equal(nomVoix({ code: "VOICE_kai" }), "Kai");
  assert.equal(nomVoix({ code: "VOICE_", personnageCode: null }), "VOICE_");
});

test("phrases : segments séparés par . ! ? …, la dernière sans ponctuation compte", () => {
  assert.equal(compterPhrases(""), 0);
  assert.equal(compterPhrases("Bonjour."), 1);
  assert.equal(compterPhrases("Bonjour. Installez-vous"), 2);
  assert.equal(compterPhrases("Quoi ?! Non... Ah."), 3);
  assert.equal(compterPhrases(" ... "), 0);
  assert.equal(compterPhrases(TEXTE_REFERENCE_DEFAUT), 2);
});

test("génération de la référence : mode Décrire, instruction non vide, réplique d'écoute de 2 phrases", () => {
  const ok = { source: "design" as const, instruction: "A native French speaker.", refText: DEUX_PHRASES };
  assert.equal(raisonGenerationReference(ok), null);
  assert.match(raisonGenerationReference({ ...ok, instruction: "  " }) ?? "", /description/);
  assert.match(raisonGenerationReference({ ...ok, refText: "Bonjour." }) ?? "", /2 phrases/);
  assert.match(raisonGenerationReference({ ...ok, source: "reference" }) ?? "", /Cloner/);
});

test("changer la voix de référence : confirmation seulement si une référence existe et que des prises ou le test en dépendent", () => {
  assert.equal(changementDemandeConfirmation(false, { nbPrises: 3, testVideo: true }), false); // première référence : directe
  assert.equal(changementDemandeConfirmation(true, { nbPrises: 0, testVideo: false }), false);
  assert.equal(changementDemandeConfirmation(true, { nbPrises: 1, testVideo: false }), true);
  assert.equal(changementDemandeConfirmation(true, { nbPrises: 0, testVideo: true }), true);
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

test("suppression d'une voix : libre, bloquée par une citation ou des répliques directes, avertie pour celles du personnage", () => {
  const v = (citations: number, repliquesDirectes: number, repliquesDuPersonnage: number, perso: string | null = "CHAR_maya") => verdictSuppressionVoix({ citations, repliquesDirectes, repliquesDuPersonnage }, perso);
  assert.deepEqual(v(0, 0, 0), { bloque: false, raison: null, avertissement: null });
  assert.equal(v(2, 0, 0).bloque, true);
  assert.match(v(2, 0, 0).raison!, /2 fiches de plan/);
  assert.equal(v(0, 1, 0).bloque, true);
  assert.match(v(0, 1, 0).raison!, /1 réplique/);
  const a = v(0, 0, 3);
  assert.equal(a.bloque, false);
  assert.match(a.avertissement!, /3 répliques de CHAR_maya repasseront « sans voix »/);
  assert.match(v(0, 0, 1, null).avertissement!, /1 réplique repassera/);
});
