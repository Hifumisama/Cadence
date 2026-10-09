import assert from "node:assert/strict";
import { test } from "node:test";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "./plan-checks";
import {
  ESSAIS_GARDES,
  TEST_VIDEO_DUREE_MAX,
  TEST_VIDEO_DUREE_MIN,
  TEXTE_REFERENCE_DEFAUT,
  ajusterDureePromptTest,
  dureeVideoPourAudio,
  formaterPlageH3,
  changementDemandeConfirmation,
  checksInstruction,
  checksReference,
  compterPhrases,
  estEtapeVoix,
  etapeDepuisParametre,
  etatFiche,
  etatPhases,
  libelleEtapeVoix,
  lireEssais,
  manquePourAvancer,
  nomVoix,
  promptTestVoix,
  raisonFenetreInvalide,
  raisonGenerationReference,
  texteDuPromptTest,
  verdictSuppressionVoix,
} from "./voix";

const base = { source: "design" as const, instruction: null, referenceFichier: null, refText: "", statut: "a_produire", testVideo: null, nbRepliques: 0, nbRepliquesMesurees: 0 };
const DEUX_PHRASES = "Bonjour, ravi de vous voir. Installez-vous.";

test("scènes : rien de fait, seule l'identité existe", () => {
  assert.deepEqual(etatPhases(base), { identite: "on", origine: "vide", voix: "vide", reference: "vide", ressenti: "vide", repliques: "vide" });
});

test("scène du timbre : décrite = instruction + réplique d'écoute de deux phrases", () => {
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker" }).voix, "part");
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker", refText: "Bonjour." }).voix, "part");
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker", refText: DEUX_PHRASES }).voix, "on");
  assert.equal(etatPhases({ ...base, instruction: "A native French speaker" }).origine, "on");
});

test("scène de la source : fournie = audio isolé + transcription", () => {
  const v = { ...base, source: "reference" as const, referenceFichier: "VOICE_x.wav" };
  assert.equal(etatPhases(v).voix, "part");
  assert.equal(etatPhases({ ...v, refText: DEUX_PHRASES }).voix, "on");
  assert.equal(etatPhases({ ...v, refText: "Bonjour." }).voix, "on"); // une transcription fidèle peut ne faire qu'une phrase
});

test("scènes : référence, ressenti et répliques", () => {
  const e = etatPhases({ ...base, referenceFichier: "a.flac", testVideo: "t.mp4", nbRepliques: 2, nbRepliquesMesurees: 1 });
  assert.equal(e.reference, "on");
  assert.equal(e.ressenti, "part"); // un test vidéo existe, la voix n'est pas validée
  assert.equal(e.repliques, "part");
  assert.equal(etatPhases({ ...base, referenceFichier: "a.flac", statut: "valide" }).ressenti, "on");
  assert.equal(etatPhases({ ...base, statut: "valide" }).ressenti, "vide"); // « valide » sans référence ne compte pas
});

test("estEtapeVoix et scène demandée : la fiche s'ouvre sur l'identité sauf ?etape= explicite", () => {
  assert.ok(estEtapeVoix("ressenti"));
  assert.ok(estEtapeVoix("voix"));
  assert.ok(!estEtapeVoix("test"));
  assert.ok(!estEtapeVoix(undefined));
  assert.equal(etapeDepuisParametre(undefined), "identite");
  assert.equal(etapeDepuisParametre("n'importe quoi"), "identite");
  assert.equal(etapeDepuisParametre("repliques"), "repliques");
  assert.equal(etapeDepuisParametre("reference"), "reference");
  // anciens noms (liens du bandeau de suivi, ancien slider)
  assert.equal(etapeDepuisParametre("test"), "ressenti");
  assert.equal(etapeDepuisParametre("validation"), "ressenti");
  assert.equal(etapeDepuisParametre("fiche"), "identite");
});

test("ce qu'il manque pour avancer : un conseil par scène, null quand c'est fait", () => {
  const v = { source: "design" as const, instruction: null, refText: "", referenceFichier: null, valide: false, testVideo: false };
  assert.match(manquePourAvancer("voix", v)!, /timbre/);
  assert.match(manquePourAvancer("voix", { ...v, instruction: "A native French speaker" })!, /réplique d'écoute/);
  assert.equal(manquePourAvancer("voix", { ...v, instruction: "A native French speaker", refText: DEUX_PHRASES }), null);
  const f = { ...v, source: "reference" as const };
  assert.match(manquePourAvancer("voix", f)!, /source/);
  assert.match(manquePourAvancer("voix", { ...f, referenceFichier: "a.flac" })!, /transcription/);
  assert.equal(manquePourAvancer("voix", { ...f, referenceFichier: "a.flac", refText: "Bonjour" }), null);
  assert.match(manquePourAvancer("reference", v)!, /prise gardée/);
  assert.match(manquePourAvancer("reference", f)!, /voix isolée/);
  assert.equal(manquePourAvancer("reference", { ...v, referenceFichier: "a.flac" }), null);
  assert.match(manquePourAvancer("ressenti", v)!, /voix de référence/);
  assert.match(manquePourAvancer("ressenti", { ...v, referenceFichier: "a.flac" })!, /test vidéo/);
  assert.match(manquePourAvancer("ressenti", { ...v, referenceFichier: "a.flac", testVideo: true })!, /juger/);
  assert.equal(manquePourAvancer("ressenti", { ...v, referenceFichier: "a.flac", valide: true }), null);
  assert.equal(manquePourAvancer("identite", v), null);
  assert.equal(manquePourAvancer("repliques", v), null);
});

test("le texte dit dans un prompt de test se relit dans sa balise <d>", () => {
  const p = promptTestVoix({ texte: "Il y a des soirs où\nle silence parle.", personnage: null, decor: null, avecAudio: true });
  assert.equal(texteDuPromptTest(p), "Il y a des soirs où le silence parle.");
  assert.equal(texteDuPromptTest("pas de balise"), "");
});

test("durée de la vidéo de test = celle de l'audio + 1 s de silence, entre 5 et 15 s", () => {
  const duree = (a: number | null) => {
    const r = dureeVideoPourAudio(a);
    return r.ok ? r.duree : r.erreur;
  };
  assert.equal(duree(2.2), 5, "un audio très court : le minimum du modèle");
  assert.equal(duree(6.1), 8); // 6,1 + 1 = 7,1 → 8
  assert.equal(duree(6.0), 7);
  assert.equal(duree(13.2), 15, "14,2 → 15");
  assert.equal(duree(14.9), 15, "plafonné à 15 : l'audio tient, la queue est plus courte");
  assert.equal(duree(null), 8, "audio non mesuré : la durée d'avant");
  assert.match(String(duree(15.4)), /15 s au plus/);
  assert.match(String(duree(0)), /vide ou illisible/);
  // Les bornes sont celles des plans.
  assert.equal(TEST_VIDEO_DUREE_MIN, DUREE_GENERATION_MIN);
  assert.equal(TEST_VIDEO_DUREE_MAX, DUREE_GENERATION_MAX);
});

test("prompt de test : la plage du plan suit la durée, la balise suit la langue", () => {
  const base = { texte: "Hello there.", personnage: null, decor: null, avecAudio: true };
  assert.match(promptTestVoix(base), /\[Shot 1, 00:00\.000–00:08\.000\]/);
  assert.match(promptTestVoix({ ...base, dureeSecondes: 11 }), /\[Shot 1, 00:00\.000–00:11\.000\]/);
  assert.match(promptTestVoix(base), /<d>\[Français\] Hello there\.<\/d>/, "sans langue : Français, comme avant");
  assert.match(promptTestVoix({ ...base, langue: "English" }), /<d>\[English\] Hello there\.<\/d>/);
  assert.equal(formaterPlageH3(65.5), "01:05.500");
});

test("ajuster la plage d'un prompt déjà composé", () => {
  const p = promptTestVoix({ texte: "Bonjour.", personnage: null, decor: null, avecAudio: true });
  const ajuste = ajusterDureePromptTest(p, 12);
  assert.match(ajuste, /\[Shot 1, 00:00\.000–00:12\.000\]/);
  assert.equal(ajuste.replace("00:12.000", "00:08.000"), p, "rien d'autre ne change");
  assert.equal(ajusterDureePromptTest("sans plage", 12), "sans plage");
  assert.equal(texteDuPromptTest(ajuste), "Bonjour.");
});

test("libellé de la scène 3 : le timbre (décrite) ou la source (fournie)", () => {
  assert.equal(libelleEtapeVoix("voix", "design"), "Le timbre");
  assert.equal(libelleEtapeVoix("voix", "reference"), "La source");
  assert.equal(libelleEtapeVoix("ressenti", "reference"), "Ressenti");
});

test("fenêtre d'une source fournie : 30 secondes au plus, 3 au moins", () => {
  assert.equal(raisonFenetreInvalide(12, 38), null);
  assert.equal(raisonFenetreInvalide(0, 30), null);
  assert.match(raisonFenetreInvalide(0, 31)!, /30 secondes au maximum/);
  assert.match(raisonFenetreInvalide(5, 6)!, /au moins 3/);
  assert.match(raisonFenetreInvalide(-1, 10)!, /invalide/);
  assert.match(raisonFenetreInvalide(NaN, 10)!, /invalide/);
});

test("journal des essais : lecture tolérante, les plus récents seulement", () => {
  assert.deepEqual(lireEssais(null), []);
  assert.deepEqual(lireEssais([{ n: 1, instruction: "A warm voice", verdict: "ajuster", note: "trop posée" }, { n: "x" }, 4]), [
    { n: 1, instruction: "A warm voice", verdict: "ajuster", note: "trop posée" },
  ]);
  assert.equal(lireEssais([{ n: 1, instruction: "x", verdict: "bizarre" }])[0]!.verdict, null);
  const beaucoup = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, instruction: "x", verdict: null, note: "" }));
  assert.equal(lireEssais(beaucoup).length, ESSAIS_GARDES);
  assert.equal(lireEssais(beaucoup).at(-1)!.n, 20);
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
  assert.equal(nomVoix({ code: "VOICE_kai", personnageCode: "CHAR_maya", nom: "  Maya (voix douce) " }), "Maya (voix douce)"); // le nom choisi passe avant
  assert.equal(nomVoix({ code: "VOICE_kai", personnageCode: "CHAR_maya", nom: "   " }), "Maya"); // un nom vide retombe sur le nom dérivé
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
