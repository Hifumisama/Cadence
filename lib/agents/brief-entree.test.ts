import { test } from "node:test";
import assert from "node:assert/strict";
import { MARQUE_BRIEF_COURANT, entreeBrief, entreeTour, messageBriefRedige } from "./brief-entree";

const conv = [
  { role: "user" as const, content: "Un trentenaire découvre ses pouvoirs." },
  { role: "assistant" as const, content: "Quel ton ?" },
  { role: "user" as const, content: "Léger, un peu absurde." },
];

test("brief : sans brouillon, consigne de première version", () => {
  const e = entreeBrief(conv, null);
  assert.equal(e.length, conv.length + 1);
  assert.ok(!e[e.length - 1]!.content.includes(MARQUE_BRIEF_COURANT));
});

test("brief : avec brouillon, il est joint à la consigne de mise à jour", () => {
  const e = entreeBrief(conv, { arc: "Un héros malgré lui" });
  assert.match(e[e.length - 1]!.content, /Un héros malgré lui/);
  assert.ok(e[e.length - 1]!.content.includes(MARQUE_BRIEF_COURANT));
});

test("tour : le brouillon rejoint le dernier message utilisateur, l'historique reste intact", () => {
  const e = entreeTour(conv, { arc: "Un héros malgré lui" });
  assert.equal(e.length, conv.length);
  assert.deepEqual(e.slice(0, 2), conv.slice(0, 2));
  assert.ok(e[2]!.content.startsWith("Léger, un peu absurde."));
  assert.match(e[2]!.content, /Un héros malgré lui/);
  assert.equal(conv[2]!.content, "Léger, un peu absurde."); // pas de mutation
});

test("tour : ce que la grille de couverture n'a pas vu « dit » est rappelé à l'agent", () => {
  const e = entreeTour(conv, null, ["le ton et le genre", "la durée, le nombre d'épisodes et les dialogues"]);
  assert.equal(e.length, conv.length);
  assert.match(e[2]!.content, /n'a pas encore DIT : le ton et le genre ; la durée/);
  assert.ok(e[2]!.content.startsWith("Léger, un peu absurde."));
  assert.deepEqual(entreeTour(conv, null, []), conv);
});

test("tour : sans brouillon, rien ne change", () => {
  assert.deepEqual(entreeTour(conv, null), conv);
});

test("message de rendu de main : arc, personnages, inventions et ce qui reste à creuser", () => {
  const m = messageBriefRedige(
    { titre: "L'Éveil", arc: "Un homme ordinaire sauve une passante.", dureeEpisodeSecondes: 180, rythme: "soutenu", personnages: [{ nom: "Théo" }, { nom: "Mamie" }], inventions: ["Le pouvoir est la télékinésie"] },
    ["Fixer le ton de la fin"],
  );
  assert.match(m, /« L'Éveil »/);
  assert.match(m, /Personnages : Théo, Mamie/);
  assert.match(m, /180 s, rythme soutenu/);
  assert.match(m, /télékinésie/);
  assert.match(m, /il me reste 1 point à creuser/);
  assert.equal(messageBriefRedige({}, []).includes("Dis-moi ce qui sonne faux, ou ce qui manque"), true);
});
