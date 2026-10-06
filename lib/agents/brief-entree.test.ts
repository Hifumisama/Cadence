import { test } from "node:test";
import assert from "node:assert/strict";
import { MARQUE_FICHE, entreeTour, messageBriefPret, messagesPourLlm } from "./brief-entree";
import type { Fiche } from "./fiche";

const conv = [
  { role: "user" as const, content: "Un trentenaire découvre ses pouvoirs." },
  { role: "assistant" as const, content: "Quel ton ?" },
  { role: "user" as const, content: "Léger, un peu absurde." },
];
const fiche: Fiche = { contenu: { arc: "Un héros malgré lui", lieux: [] }, statuts: { arc: "fourni" } };

test("une conversation qui commence par l'agent (accroche) reçoit un « Bonjour » d'ouverture : le modèle de chat veut un utilisateur d'abord", () => {
  const ouverte = [{ role: "assistant" as const, content: "Salut ! Ça te dirait de faire un film ?" }, ...conv];
  const m = messagesPourLlm(ouverte);
  assert.equal(m.length, ouverte.length + 1);
  assert.equal(m[0]!.role, "user");
  assert.deepEqual(messagesPourLlm(conv), conv);
});

test("tour : la fiche rejoint le dernier message utilisateur (sans les sections vides), l'historique reste intact", () => {
  const e = entreeTour(conv, fiche, { manques: ["le ton"], complete: false });
  assert.equal(e.length, conv.length);
  assert.deepEqual(e.slice(0, 2), conv.slice(0, 2));
  assert.ok(e[2]!.content.startsWith("Léger, un peu absurde."));
  assert.ok(e[2]!.content.includes(MARQUE_FICHE));
  assert.match(e[2]!.content, /Un héros malgré lui/);
  assert.ok(!e[2]!.content.includes('"lieux"'), "une section vide n'est pas montrée");
  assert.equal(conv[2]!.content, "Léger, un peu absurde."); // pas de mutation
});

test("tour : ce qui manque est un rappel et non un questionnaire", () => {
  const e = entreeTour(conv, fiche, { manques: ["le ton et le genre", "la durée visée"], complete: false });
  assert.match(e[2]!.content, /pas encore dit : le ton et le genre ; la durée visée/);
  assert.match(e[2]!.content, /Ce n'est pas un programme/);
  assert.match(e[2]!.content, /dans l'ordre que tu veux/);
});

test("tour : fiche complète et l'utilisateur continue, l'agent creuse ce qui est supposé sans jamais annoncer la fin", () => {
  const f: Fiche = { contenu: { arc: "A", titre: "Un titre" }, statuts: { arc: "fourni", titre: "deduit" } };
  const e = entreeTour(conv, f, { manques: [], complete: true });
  assert.match(e[2]!.content, /la fiche est complète et l'utilisateur continue à l'affiner/);
  assert.match(e[2]!.content, /Ce qui reste supposé : titre/);
  assert.match(e[2]!.content, /Ne dis jamais que le briefing est prêt/);
  assert.match(entreeTour(conv, f, { manques: ["le ton"], complete: false })[2]!.content, /Ne dis jamais que le briefing est prêt/);
});

test("message de fin d'entretien écrit par le code : résumé, suppositions, la main à l'utilisateur", () => {
  const f: Fiche = {
    contenu: { titre: "L'Éveil", arc: "Un homme sauve une passante.", genreTon: "Comédie douce.", style: { nom: "Live-action", clause: "x" }, dureeEpisodeSecondes: 180, rythme: "soutenu", personnages: [{ nom: "Théo" }, { nom: "Mamie" }], lieux: [{ nom: "La rue" }] },
    statuts: { arc: "fourni", genreTon: "fourni", style: "fourni", dureeEpisodeSecondes: "fourni", personnages: "fourni", titre: "deduit", lieux: "deduit", rythme: "delegue" },
  };
  const m = messageBriefPret(f);
  assert.match(m, /^Le briefing est prêt\./);
  assert.match(m, /« L'Éveil » : Un homme sauve une passante\./);
  assert.match(m, /ton Comédie douce · style Live-action · durée visée 180 s · rythme soutenu\./);
  assert.match(m, /Personnages : Théo, Mamie\./);
  assert.match(m, /à garder ou à jeter : titre, rythme, lieux/);
  assert.match(m, /Veux-tu encore affiner d'autres points \? Sinon, passe à l'étape suivante/);
  assert.match(messageBriefPret({ contenu: {}, statuts: {} }), /Le briefing est prêt\./);
});

test("tour : ce que l'agent a proposé et que l'utilisateur n'a pas contesté ne se redemande pas", () => {
  const f: Fiche = { contenu: { arc: "A", style: { nom: "2D façon série", clause: "x" }, rythme: "variable" }, statuts: { arc: "fourni", style: "deduit", rythme: "deduit" } };
  const e = entreeTour(conv, f, { manques: ["le ton et le genre"], complete: false });
  assert.match(e[2]!.content, /Déjà tranché par l'utilisateur, à ne JAMAIS redemander : le cœur de l'histoire/);
  assert.match(e[2]!.content, /Déjà proposé dans la conversation et non contesté.*style visuel : 2D façon série ; rythme : variable/);
});

test("tour : si le dernier message n'est pas de l'utilisateur, rien n'est ajouté", () => {
  const fin = [...conv, { role: "assistant" as const, content: "ok" }];
  assert.deepEqual(entreeTour(fin, fiche, { manques: [], complete: false }), fin);
});
