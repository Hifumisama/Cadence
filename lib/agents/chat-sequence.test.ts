import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_VALIDER_SEQUENCE, matiere, messageProposerSuite, contenuPourLlm, estTempsFort, etatSequence, messageValiderSequence, normaliserSequence, sansMarqueTempsFort, sequenceValidee } from "./chat-sequence";

test("normaliserSequence : moments nettoyés (numéros retirés), temps fort borné", () => {
  assert.deepEqual(normaliserSequence({ moments: ["1. Marc entre", " 2) Lina se retourne ", ""], tempsFort: 2 }), { moments: ["Marc entre", "Lina se retourne"], tempsFort: 2 });
  assert.deepEqual(normaliserSequence({ moments: ["a", "b"], tempsFort: 5 }), { moments: ["a", "b"], tempsFort: null });
  assert.equal(normaliserSequence({ moments: ["seul"] }), null);
  assert.equal(normaliserSequence("1. a 2. b"), null);
  assert.equal(normaliserSequence(undefined), null);
});

test("contenuPourLlm : la séquence suit le texte, en liste numérotée", () => {
  assert.equal(contenuPourLlm({ content: "Voilà :" }), "Voilà :");
  assert.equal(
    contenuPourLlm({ content: "Voilà :", sequence: { moments: ["Marc entre", "Le sac vole"], tempsFort: 2 } }),
    "Voilà :\n\nSéquence proposée :\n1. Marc entre\n2. Le sac vole (temps fort)",
  );
});

test("etatSequence : validée si les notes tiennent cette liste, remplacée si une autre l'a suivie", () => {
  const s = { moments: ["Marc entre", "Le sac vole"], tempsFort: null };
  assert.equal(etatSequence(s, true, { moments: ["Marc  entre", "Le sac vole"], tranche: true }), "validee");
  assert.equal(etatSequence(s, true, { moments: ["Marc entre", "Le sac vole"], tranche: false }), "proposee");
  assert.equal(etatSequence(s, false, { moments: ["Autre"], tranche: true }), "remplacee");
});

test("temps fort : message de validation, liste reprise par le code avec la marque, carte toujours reconnue comme validée", () => {
  assert.equal(messageValiderSequence(null), MESSAGE_VALIDER_SEQUENCE);
  assert.equal(messageValiderSequence(2), "Je valide la séquence telle quelle (temps fort : moment 2).");
  const carte = { moments: ["Marc entre", "Le sac vole", "Tout le monde rit"], tempsFort: 2 };
  const fil = [
    { role: "assistant", content: "Voilà :", sequence: carte },
    { role: "user", content: "Je valide la séquence telle quelle (temps fort : moment 3)." },
  ];
  assert.deepEqual(sequenceValidee(fil), ["Marc entre", "Le sac vole", "Tout le monde rit (temps fort)"]);
  assert.deepEqual(sequenceValidee([fil[0]!, { role: "user", content: MESSAGE_VALIDER_SEQUENCE }]), ["Marc entre", "Le sac vole (temps fort)", "Tout le monde rit"], "sans choix : celui de l'IA");
  assert.equal(sequenceValidee([fil[0]!, { role: "user", content: "Je change le moment 2" }]), null);
  assert.equal(etatSequence(carte, true, { moments: ["Marc entre", "Le sac vole", "Tout le monde rit (temps fort)"], tranche: true }), "validee");
  assert.ok(estTempsFort("Tout le monde rit (temps fort)"));
  assert.equal(sansMarqueTempsFort("Tout le monde rit (temps fort)"), "Tout le monde rit");
});

test("matiere : secondes couvertes (10 s par moment) sur la durée visée, cases vides pour ce qui manque", () => {
  assert.deepEqual(matiere(9, 120), { couvertes: 90, visees: 120, cases: 12, pleines: 9, manquants: 3 });
  assert.deepEqual(matiere(14, 120), { couvertes: 140, visees: 120, cases: 14, pleines: 14, manquants: 0 });
  assert.equal(matiere(5, null), null);
  assert.match(messageProposerSuite(matiere(9, 120)!), /^Propose-moi la suite : il manque 3 moments \(environ 30 s\)/);
});
