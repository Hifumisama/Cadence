import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_VALIDER_SYNOPSIS, etatSynopsis, normaliserSynopsis, synopsisDejaValide, synopsisValide } from "./chat-synopsis";
import { contenuPourLlm } from "./chat-sequence";

const S1 = "Dans un phare battu par le sel, Lina, quinze ans, veille seule depuis la disparition de son père. Elle veut rallumer la lanterne avant l'hiver, mais la mer monte chaque nuit un peu plus haut.";
const S2 = "Dans un phare au bord d'une mer gelée, Lina, quinze ans, attend un bateau qui ne vient pas. Elle veut prévenir le village, mais la glace a coupé le seul chemin.";

test("normaliserSynopsis : un texte de 3 à 5 phrases, sinon rien", () => {
  assert.equal(normaliserSynopsis(`  ${S1}\n `), S1);
  assert.equal(normaliserSynopsis("Un phare."), null, "trop court");
  assert.equal(normaliserSynopsis("x".repeat(1300)), null, "trop long");
  assert.equal(normaliserSynopsis({ texte: S1 }), null);
});

test("synopsisValide : le texte de la dernière carte quand l'utilisateur vient de la valider", () => {
  const conv = [
    { role: "assistant", content: "Voilà ce que je vois :", synopsis: S1 },
    { role: "user", content: "Change la mer en glace." },
    { role: "assistant", content: "Revu :", synopsis: S2 },
    { role: "user", content: MESSAGE_VALIDER_SYNOPSIS },
  ];
  assert.equal(synopsisValide(conv), S2);
  assert.equal(synopsisValide(conv.slice(0, 2)), null, "une remarque n'est pas une validation");
  assert.ok(synopsisDejaValide(["Un phare.", MESSAGE_VALIDER_SYNOPSIS, "Plutôt sombre"]));
  assert.ok(!synopsisDejaValide(["Un phare.", "Je valide la séquence telle quelle."]));
  assert.equal(etatSynopsis(0, conv), "remplacee");
  assert.equal(etatSynopsis(2, conv), "validee");
  assert.equal(etatSynopsis(2, conv.slice(0, 3)), "proposee");
});

test("contenuPourLlm : les modèles lisent le synopsis proposé", () => {
  assert.match(contenuPourLlm({ content: "Voilà :", synopsis: S1 }), /Synopsis proposé :\nDans un phare battu par le sel/);
});
