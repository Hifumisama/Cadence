import { test } from "node:test";
import assert from "node:assert/strict";
import { choixActif, formulerReponse, normaliserChoix, selectionValide } from "./choix";
import type { MessageConversation } from "./types";

const DECIDER = { libelle: "Je te laisse décider" };
const simple = { multiple: false, options: [{ libelle: "Mélancolique", description: "Lent, des silences" }, { libelle: "Léger" }, DECIDER] };

test("un choix valide est rendu tel quel, la description et la question facultatives", () => {
  assert.deepEqual(normaliserChoix({ question: "Le ton ?", ...simple }), { question: "Le ton ?", ...simple });
  assert.deepEqual(normaliserChoix({ multiple: true, options: [{ libelle: "A" }, { libelle: "B" }, DECIDER] }), {
    multiple: true,
    options: [{ libelle: "A" }, { libelle: "B" }, DECIDER],
  });
});

test("les libellés et descriptions sont nettoyés ; une description vide disparaît", () => {
  const n = normaliserChoix({ multiple: false, options: [{ libelle: "  Léger  ", description: "   " }, { libelle: "Dur", description: "x".repeat(300) }, DECIDER] });
  assert.ok(n);
  assert.deepEqual(n.options[0], { libelle: "Léger" });
  assert.equal(n.options[1]!.description!.length, 160);
});

test("une question qui n'est pas du texte est ignorée sans invalider le choix", () => {
  const n = normaliserChoix({ question: 42, ...simple });
  assert.ok(n);
  assert.equal("question" in n, false);
});

test("absent, nul ou d'une autre forme : rien, sans erreur", () => {
  assert.equal(normaliserChoix(undefined), null);
  assert.equal(normaliserChoix(null), null);
  assert.equal(normaliserChoix("Léger, Dur"), null);
  assert.equal(normaliserChoix(["A", "B"]), null);
  assert.equal(normaliserChoix({ options: simple.options }), null, "multiple doit être un booléen");
  assert.equal(normaliserChoix({ multiple: "non", options: simple.options }), null);
});

test("trop peu ou trop d'options : invalide", () => {
  assert.equal(normaliserChoix({ multiple: false, options: [DECIDER] }), null);
  assert.equal(normaliserChoix({ multiple: false, options: [{ libelle: "A" }, { libelle: "B" }, { libelle: "C" }, { libelle: "D" }, DECIDER] }), null);
});

test("un libellé vide, trop long, ou dupliqué : invalide", () => {
  assert.equal(normaliserChoix({ multiple: false, options: [{ libelle: "  " }, DECIDER] }), null);
  assert.equal(normaliserChoix({ multiple: false, options: [{ libelle: "x".repeat(61) }, DECIDER] }), null);
  assert.equal(normaliserChoix({ multiple: false, options: [{ libelle: "Léger" }, { libelle: "léger" }, DECIDER] }), null);
  assert.equal(normaliserChoix({ multiple: false, options: [{ description: "sans libellé" }, DECIDER] }), null);
});

test("sans l'option « Je te laisse décider » (à la casse et aux accents près) : invalide ; avec, elle suffit", () => {
  assert.equal(normaliserChoix({ multiple: false, options: [{ libelle: "A" }, { libelle: "B" }] }), null);
  const n = normaliserChoix({ multiple: false, options: [{ libelle: "A" }, { libelle: "je te laisse decider" }] });
  assert.ok(n);
});

test("selection simple : une seule option, qui existe", () => {
  const c = normaliserChoix({ ...simple })!;
  assert.equal(selectionValide(c, ["Léger"]), true);
  assert.equal(selectionValide(c, ["Léger", "Mélancolique"]), false);
  assert.equal(selectionValide(c, []), false);
  assert.equal(selectionValide(c, ["Inconnu"]), false);
});

test("selection multiple : au moins une option, sans doublon ; « Je te laisse décider » seule", () => {
  const c = normaliserChoix({ multiple: true, options: [{ libelle: "A" }, { libelle: "B" }, DECIDER] })!;
  assert.equal(selectionValide(c, ["A", "B"]), true);
  assert.equal(selectionValide(c, ["A", "A"]), false);
  assert.equal(selectionValide(c, ["A", DECIDER.libelle]), false);
  assert.equal(selectionValide(c, [DECIDER.libelle]), true);
});

test("le texte de la réponse suit l'ordre des options, et reprend les libellés", () => {
  const c = normaliserChoix({ multiple: true, options: [{ libelle: "A" }, { libelle: "B" }, { libelle: "C" }, DECIDER] })!;
  assert.equal(formulerReponse(c, ["C", "A"]), "A, C");
  assert.equal(formulerReponse(c, ["B"]), "B");
});

test("les cartes ne répondent que si le dernier message est celui de l'agent", () => {
  const agent: MessageConversation = { role: "assistant", content: "Le ton ?", at: "1", choix: normaliserChoix({ ...simple })! };
  const user: MessageConversation = { role: "user", content: "Léger", at: "2" };
  assert.deepEqual(choixActif([agent]), agent.choix);
  assert.equal(choixActif([agent, user]), null);
  assert.equal(choixActif([{ role: "assistant", content: "Pas de cartes", at: "3" }]), null);
  assert.equal(choixActif([]), null);
});
