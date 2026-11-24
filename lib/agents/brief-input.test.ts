import { test } from "node:test";
import assert from "node:assert/strict";
import { MARQUE_FICHE, entreeTour, messageBriefPret, messagesPourLlm } from "./brief-input";
import { manquesEssentiels, type Fiche } from "./sheet";
import { MESSAGE_VALIDER_SYNOPSIS } from "./chat-synopsis";

const conv = [
  { role: "user" as const, content: "Un trentenaire découvre ses pouvoirs." },
  { role: "assistant" as const, content: "Quel ton ?" },
  { role: "user" as const, content: "Léger, un peu absurde." },
];
const fiche: Fiche = { contenu: { arc: "Un héros malgré lui", lieux: [] }, statuts: { arc: "fourni" } };
/** The same interview, once the synopsis is validated (the order then moves on). */
const convS = [
  { role: "user" as const, content: "Un trentenaire découvre ses pouvoirs." },
  { role: "assistant" as const, content: "Voilà le synopsis.\n\nSynopsis proposé :\nUn héros malgré lui." },
  { role: "user" as const, content: MESSAGE_VALIDER_SYNOPSIS },
];

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
  assert.equal(conv[2]!.content, "Léger, un peu absurde."); // no mutation
});

test("tour : le synopsis d'abord ; tant qu'il n'est pas validé, rien d'autre ne se creuse (retours 2026-11-23)", () => {
  const e = entreeTour(conv, fiche, { manques: ["le ton et le genre", "la durée visée"], complete: false })[2]!.content;
  assert.match(e, /première étape, le synopsis, pas encore validé/);
  assert.match(e, /champ « synopsis » : 3 à 5 phrases.*SANS la fin/);
  assert.match(e, /Ne passe ni au ton, ni au héros, ni aux moments tant qu'il n'est pas validé/);
  assert.ok(!/voici ce qui reste/.test(e));
  // Interview already complete (started before the change): it keeps refining, no synopsis forced.
  assert.ok(!/le synopsis, pas encore validé/.test(entreeTour(conv, fiche, { manques: [], complete: true })[2]!.content));
});

test("tour : le synopsis validé, ce qui reste se construit dans l'ordre, le premier point d'abord", () => {
  const e = entreeTour(convS, fiche, { manques: ["le ton et le genre", "la durée visée"], complete: false })[2]!.content;
  assert.match(e, /dans cet ordre, et voici ce qui reste : le ton et le genre ; la durée visée/);
  assert.match(e, /avance sur le PREMIER point de cette liste, et seulement lui/);
  assert.ok(!/dans l'ordre que tu veux/.test(e));
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
  assert.match(m, /proposé moi-même, à relire : titre, rythme, lieux/);
  assert.match(m, /Encore à compléter dans le Brief : les moments du film./, "après un arrêt, ce qui reste VIDE est dit (le supposé est déjà listé)");
  assert.match(m, /Veux-tu encore affiner d'autres points \? Sinon, passe à l'étape suivante/);
  assert.match(messageBriefPret({ contenu: {}, statuts: {} }), /Le briefing est prêt\./);
});

test("tour : ce que l'agent a proposé et que l'utilisateur n'a pas contesté ne se redemande pas", () => {
  const f: Fiche = { contenu: { arc: "A", style: { nom: "2D façon série", clause: "x" }, rythme: "variable" }, statuts: { arc: "fourni", style: "deduit", rythme: "deduit" } };
  const e = entreeTour(convS, f, { manques: ["le ton et le genre"], complete: false });
  assert.match(e[2]!.content, /Déjà tranché par l'utilisateur, à ne JAMAIS redemander : le synopsis/);
  assert.match(e[2]!.content, /Déjà proposé dans la conversation et non contesté.*style visuel : 2D façon série ; rythme : variable/);
});

test("tour : l'essentiel noté, l'agent passe aux détails, un par un et dans l'ordre", () => {
  const e = entreeTour(convS, fiche, { manques: [], details: ["la tenue de Théo (coupe, couleurs, matières)", "le décor « La rue » (lumière, matières, palette)"], complete: false });
  assert.match(e[2]!.content, /Détails à préciser, dans cet ordre : la tenue de Théo/);
  assert.match(e[2]!.content, /UNE question ciblée sur le premier détail/);
  assert.match(e[2]!.content, /Ne dis jamais que le briefing est prêt/);
  // Everything is noted but the interview is young (big first block): never an empty list of gaps.
  const jeune = entreeTour(convS, fiche, { manques: [], details: [], complete: false });
  assert.ok(!/pas encore dit : \./.test(jeune[2]!.content));
  assert.match(jeune[2]!.content, /encore jeune/);
});

test("tour : un gros premier message se déplie en plusieurs échanges", () => {
  const bloc = [{ role: "assistant" as const, content: "Raconte-moi." }, { role: "user" as const, content: "Une très longue histoire. ".repeat(40) }];
  assert.match(entreeTour(bloc, fiche, { manques: ["la fin"], complete: false }).at(-1)!.content, /premier message est un gros bloc/);
  assert.ok(!/gros bloc/.test(entreeTour(conv, fiche, { manques: ["la fin"], complete: false })[2]!.content));
});

test("tour : les moments sont l'étape en cours : le scénariste vérifie le basculement, propose la suite lui-même et la fait valider", () => {
  const f: Fiche = { contenu: { arc: "Une danseuse bascule dans un enfer vert.", dureeEpisodeSecondes: 120, moments: ["a", "b", "c"] }, statuts: { arc: "fourni", dureeEpisodeSecondes: "fourni", moments: "fourni" } };
  const manques = manquesEssentiels(f).filter((m) => m.startsWith("les moments"));
  assert.deepEqual(manques, ["les moments du film (3 sur 12)"]);
  const e = entreeTour(convS, f, { manques, complete: false })[2]!.content;
  assert.match(e, /voici ce qui reste : les moments du film \(3 sur 12\)/);
  assert.match(e, /Les moments sont l'étape en cours \(3 notés ; la durée en appelle au moins 12/);
  assert.match(e, /ce qui fait basculer l'histoire/);
  assert.match(e, /propose toi-même la suite complète dans le champ « sequence »/);
  assert.match(e, /demande-lui de la valider ou de la changer/);
  const tranche = /Déjà tranché par l'utilisateur, à ne JAMAIS redemander : ([^.]*)\./.exec(e)?.[1] ?? "";
  assert.ok(tranche.includes("le synopsis") && !tranche.includes("moments"), "une suite trop courte n'est pas « déjà tranchée »");
  // The moments are not the next step yet (the hero comes first): no instruction to propose the sequence.
  const sansCoeur = entreeTour(convS, { contenu: {}, statuts: {} }, { manques: ["le héros : son âge et son apparence", "les moments du film"], complete: false })[2]!.content;
  assert.ok(!/propose toi-même la suite/.test(sansCoeur));
});

test("tour : si le dernier message n'est pas de l'utilisateur, rien n'est ajouté", () => {
  const fin = [...conv, { role: "assistant" as const, content: "ok" }];
  assert.deepEqual(entreeTour(fin, fiche, { manques: [], complete: false }), fin);
});
