import test from "node:test";
import assert from "node:assert/strict";
import { depuisScenarioScene, depuisTraitement, type SortieScenarioScene, type SortieTraitement } from "./conversion";
import type { EpisodeCourant } from "./conversion";

const scene = (titre: string, poids: number) => ({ titre, fonction: "f", genre: "action", ambiance: "Nuit", intention: "Elle avance.", etatEntree: "Au camp", etatSortie: "Sur la route", poids, momentsDeLAuteur: "" });

test("traitement : une scène créée par ligne, durées calculées depuis les poids, traitement posé", () => {
  const sortie: SortieTraitement = { scenes: [scene("Départ", 1), scene("Duel", 3)], inventions: ["Un chien"], notes: "" };
  const ch = depuisTraitement(sortie, { id: 7, scenes: [] }, { dureeEpisodeSecondes: 400 });
  assert.equal(ch.length, 2);
  const [a, b] = ch.map((c) => (c.apres as { traitement: { dureeCibleSecondes: number } }).traitement.dureeCibleSecondes);
  assert.equal(a! + b!, 400);
  assert.ok(b! > a!);
  assert.equal(ch[0]!.cibleType, "scene");
  assert.equal((ch[0]!.apres as { episodeId: number }).episodeId, 7);
  assert.equal(ch[0]!.avertissements?.[0]?.type, "invention");
});

test("traitement : deux scènes de même titre sont distinguées, une scène déjà là n'est pas doublée", () => {
  const sortie: SortieTraitement = { scenes: [scene("Duel", 1), scene("duel", 1), scene("Fin", 1)], inventions: [], notes: "" };
  const ch = depuisTraitement(sortie, { id: 1, scenes: [{ id: 3, titre: "Fin" }] }, { dureeEpisodeSecondes: 300 });
  const titres = ch.map((c) => (c.apres as { titre: string }).titre);
  assert.deepEqual(titres, ["Duel", "duel (2)", "Fin (2)"]);
});

const ep: EpisodeCourant = {
  id: 1,
  titre: "Pilote",
  resume: "Un film.",
  scenes: [{ id: 10, titre: "Duel" }],
  plans: [{ uuid: "autre", titre: "Le coup", sceneId: 11 }],
};

test("scénario d'une scène : les plans prennent la scène existante, durées ramenées à la cible, titre repris ailleurs sans écraser", () => {
  const sortie: SortieScenarioScene = {
    plans: [
      { titre: "Le coup", description: "Il frappe. État en fin de plan : debout.", liaison: "coupe", dureeSecondes: 15 },
      { titre: "La chute", description: "Elle tombe. État en fin de plan : au sol.", liaison: "suite", dureeSecondes: 15 },
    ],
    inventions: [],
    notes: "",
  };
  const ch = depuisScenarioScene(sortie, ep, { id: 10, titre: "Duel", fonction: "f", dureeCibleSecondes: 20 }, { prefixeCle: "sc10-", groupe: "ep-1" });
  assert.ok(ch.every((c) => c.operation === "creer" && c.cibleType === "plan"), "aucun plan d'une autre scène n'est modifié");
  assert.equal(ch.length, 2);
  const durees = ch.map((c) => (c.apres as { dureeGenerationSecondes: number }).dureeGenerationSecondes);
  assert.equal(durees[0]! + durees[1]!, 20);
  assert.ok(ch.every((c) => (c.apres as { sceneId: number }).sceneId === 10));
  assert.ok(ch.every((c) => c.groupe === "ep-1" && c.cle?.startsWith("sc10-")));
});
