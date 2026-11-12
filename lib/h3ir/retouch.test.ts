import assert from "node:assert/strict";
import { test } from "node:test";
import { depuisRetouche } from "./conversion";
import { preparerDepart, messageRetouche, passagesChanges, repliquesDeDescription, sectionsDuPrompt, verifierRetouche, etenduePassage, type SectionsPrompt, type SortieRetouche } from "./retouch";

const SECTIONS: SectionsPrompt = {
  subject_definitions: "<Subject 1> is the young woman in <Picture 1>, long black hair, white robe.",
  summary: "[reference generation] <Subject 1> performs slow movements. A character forms in the air.",
  retention_analysis: "<Subject 1> (appears in [Shot 1]): fully_preserved - hair and robe retained.",
  detailed_description: "A cinematic style.\n[Shot 1] A wide shot of <Subject 1> on the temple.\n[Shot 2] At 00:08.000, the shot cuts to an extreme close-up of <Subject 1>'s face. The whirlwinds form the character in the air.",
  overall_soundscape: "A low rumbling wind.",
  non_diegetic_music: "A full orchestra swells.",
};
const PROMPT = Object.entries(SECTIONS).map(([k, v]) => `${k}:\n${v}`).join("\n\n");

const retouchee = (): SortieRetouche => ({
  refonte: false,
  raison: "",
  modifications: ["Réplique de Katara ajoutée en fin de plan."],
  sections: { ...SECTIONS, detailed_description: `${SECTIONS.detailed_description} Katara's voice is heard in voice-over, <d>[French] l'Air.</d>` },
});

test("sectionsDuPrompt : un prompt assemblé se redécoupe en six sections, un prompt incomplet donne null", () => {
  assert.deepEqual(sectionsDuPrompt(PROMPT), SECTIONS);
  assert.equal(sectionsDuPrompt(null), null);
  assert.equal(sectionsDuPrompt("summary:\nseulement ça"), null);
});

test("repliquesDeDescription : le point après le guillemet et les trois points sont acceptés", () => {
  assert.deepEqual(repliquesDeDescription("Elle lève les mains.\nKatara : « l'Air »."), [{ nom: "Katara", texte: "l'Air" }]);
  assert.deepEqual(repliquesDeDescription("Texte.\nKatara : « Il était une fois... »"), [{ nom: "Katara", texte: "Il était une fois…" }]);
});

test("messageRetouche : consigne, description, répliques et prompt, dans cet ordre", () => {
  const m = messageRetouche({ numeroRendu: 7, consigne: "Ajoute la réplique.", sections: SECTIONS, repliques: [{ nom: "Katara", texte: "l'Air" }], descriptionApres: "Elle lève les mains." });
  assert.ok(m.indexOf("INSTRUCTION:") < m.indexOf("PLAN DESCRIPTION NOW:") && m.indexOf("PLAN DESCRIPTION NOW:") < m.indexOf("SPOKEN LINES REQUIRED:") && m.indexOf("SPOKEN LINES REQUIRED:") < m.indexOf("PROMPT:"));
  assert.ok(m.includes("Katara | l'Air"));
  assert.ok(m.includes("subject_definitions:\n<Subject 1>"));
});

test("verifierRetouche : une retouche propre passe", () => {
  assert.deepEqual(verifierRetouche(SECTIONS, retouchee(), [{ texte: "l'Air" }]), []);
});

test("verifierRetouche : réplique absente, doublée ou non voulue", () => {
  const sans = { ...retouchee(), sections: { ...SECTIONS, detailed_description: `${SECTIONS.detailed_description} Elle respire.` } };
  assert.match(verifierRetouche(SECTIONS, sans, [{ texte: "l'Air" }]).join(" | "), /n'est pas reprise mot pour mot/);
  const deux = { ...retouchee(), sections: { ...SECTIONS, detailed_description: `${SECTIONS.detailed_description} <d>[French] l'Air.</d> <d>[French] l'Air</d>` } };
  assert.match(verifierRetouche(SECTIONS, deux, [{ texte: "l'Air" }]).join(" | "), /dite 2 fois/);
  assert.match(verifierRetouche(SECTIONS, retouchee(), []).join(" | "), /n'est pas dans les répliques voulues/);
});

test("verifierRetouche : un mot changé dans la réplique est refusé (ponctuation comprise)", () => {
  // « l'Air. » (point) ≠ « l'Air » : la réplique voulue est « l'Air. » ici, le prompt la porte sans point.
  assert.match(verifierRetouche(SECTIONS, retouchee(), [{ texte: "L'air" }]).join(" | "), /n'est pas reprise mot pour mot/);
});

test("verifierRetouche : étiquettes changées, rien changé, section réécrite", () => {
  const etiquette = { ...retouchee(), sections: { ...retouchee().sections, summary: SECTIONS.summary.replace("<Subject 1>", "<Subject 2>") } };
  assert.match(verifierRetouche(SECTIONS, etiquette, [{ texte: "l'Air" }]).join(" | "), /étiquettes/);
  assert.match(verifierRetouche(SECTIONS, { ...retouchee(), sections: SECTIONS }, []).join(" | "), /rien n'a été changé/);
  const longue = "x".repeat(400);
  const base = { ...SECTIONS, overall_soundscape: longue };
  const refaite = { ...retouchee(), sections: { ...retouchee().sections, overall_soundscape: "y".repeat(400) } };
  assert.match(verifierRetouche(base, refaite, [{ texte: "l'Air" }]).join(" | "), /réécrite en grande partie/);
});

test("etenduePassage : un ajout en fin est petit, un remplacement complet est total", () => {
  assert.equal(etenduePassage("abc", "abc"), 0);
  assert.ok(etenduePassage("a".repeat(100), `${"a".repeat(100)} fin`) < 0.1);
  assert.equal(etenduePassage("a".repeat(10), "b".repeat(10)), 1);
});

test("depuisRetouche : une fiche aux six sections, sans références, ancien prompt gardé", () => {
  const sortie = retouchee();
  const res = { moteur: "retouche" as const, planUuid: "u", depuisNumero: 7, sections: sortie.sections, passages: passagesChanges(SECTIONS, sortie.sections), modifications: sortie.modifications, modeleRetouche: "gemma" };
  const [c] = depuisRetouche(res, { uuid: "u", titre: "Plan 3" });
  assert.equal(c!.cibleType, "fiche");
  const apres = c!.apres as { sections: Record<string, string>; refs?: unknown; moteur: string; passages: { section: string }[] };
  assert.equal(apres.moteur, "h3ir");
  assert.equal(apres.refs, undefined);
  assert.equal(Object.keys(apres.sections).length, 6);
  assert.deepEqual(apres.passages.map((p) => p.section), ["detailed_description"]);
  assert.ok(c!.avertissements!.some((a) => a.texte.includes("essai n°7") && a.texte.includes("Réplique de Katara")));
  assert.ok(!c!.avertissements!.some((a) => a.type === "bloque_controle"));
});

const ESSAI = { prompt: PROMPT, description: "Elle lève les mains.", duree: 10 };
const ok = (n: number) => n >= 4 && n <= 10;

test("preparerDepart : seule la description change → retouche du prompt de l'essai, durée et description de l'essai", () => {
  const d = preparerDepart({ description: "Elle lève les mains.\nKatara : « l'Air »", duree: null, references: false, reglages: false }, 7, ESSAI, " Ajoute la réplique. ", ok);
  assert.equal(d.retouche?.numeroRendu, 7);
  assert.equal(d.retouche?.consigne, "Ajoute la réplique.");
  assert.deepEqual(d.retouche?.repliques, [{ nom: "Katara", texte: "l'Air" }]);
  assert.equal(d.duree, 10);
  assert.deepEqual(d.retouche?.sections, SECTIONS);
});

test("preparerDepart : sans description décidée, celle de l'essai sert ; sans essai de départ ou avec autre chose que la description, on recompile", () => {
  assert.equal(preparerDepart({ description: null, duree: null, references: false, reglages: false }, 7, ESSAI, "c", ok).description, "Elle lève les mains.");
  const base = { description: "x", duree: null, references: false, reglages: false };
  assert.equal(preparerDepart(base, null, ESSAI, "c", ok).retouche, null, "pas d'essai de départ");
  assert.equal(preparerDepart({ ...base, references: true }, 7, ESSAI, "c", ok).retouche, null);
  assert.equal(preparerDepart({ ...base, reglages: true }, 7, ESSAI, "c", ok).retouche, null);
  assert.equal(preparerDepart({ ...base, duree: 6 }, 7, ESSAI, "c", ok).retouche, null, "la durée change : recompilation");
  assert.equal(preparerDepart(base, 7, { ...ESSAI, prompt: "pas un prompt" }, "c", ok).retouche, null);
  assert.equal(preparerDepart(base, 7, { ...ESSAI, duree: null }, "c", ok).retouche, null);
  assert.deepEqual(preparerDepart({ ...base, duree: 6 }, 7, ESSAI, "c", ok), { retouche: null, description: "x", duree: 6 }, "rien ne change sur le chemin de recompilation");
});

test("messageRetouche : la description d'avant n'est donnée que si elle diffère de celle d'après", () => {
  const base = { numeroRendu: 7, consigne: "c", sections: SECTIONS, repliques: [], descriptionApres: "Elle lève les mains." };
  assert.ok(!messageRetouche(base).includes("BEFORE"));
  assert.ok(!messageRetouche({ ...base, descriptionAvant: "Elle lève les mains." }).includes("BEFORE"));
  const m = messageRetouche({ ...base, descriptionAvant: "Elle baisse les mains." });
  assert.ok(m.indexOf("PLAN DESCRIPTION BEFORE") < m.indexOf("PLAN DESCRIPTION NOW") && m.includes("Elle baisse les mains."));
});

test("preparerDepart : le texte de l'essai devient la description d'avant quand les décisions en donnent une autre", () => {
  const d = preparerDepart({ description: "Elle ouvre les mains.", duree: null, references: false, reglages: false }, 7, ESSAI, "c", ok);
  assert.equal(d.retouche?.descriptionAvant, "Elle lève les mains.");
  assert.equal(preparerDepart({ description: null, duree: null, references: false, reglages: false }, 7, ESSAI, "c", ok).retouche?.descriptionAvant, undefined);
});
