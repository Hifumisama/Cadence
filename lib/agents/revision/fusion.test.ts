import assert from "node:assert/strict";
import { test } from "node:test";
import { interpreterAnalyse, type EtatAvantTour, type SortieAnalyse } from "./analyse";
import { recoupementsEntreDecisions } from "./constats";
import { planUuid, vueLeSel } from "./fixture-le-sel";
import { tourPur } from "./tour-pur";
import type { Operation } from "./types";

const vue = vueLeSel();
const sortie = (o: Partial<SortieAnalyse>): SortieAnalyse => ({ decisions: [], retirer: [], pistes: [], retenirPistes: [], narratif: [], ...o });
const coupes = (...n: number[]) => n.map((x) => ({ type: "couper_plan", plan: `P${x}` }));
const couper = (n: number): Operation => ({ type: "couper_plan", planUuid: planUuid(n) });
const duree = (n: number, secondes: number): Operation => ({ type: "duree_plan", planUuid: planUuid(n), secondes });

test("recoupement : « seulement le 04 » posté comme une décision de plus est signalé sur la plus récente", () => {
  const etat: EtatAvantTour = { vue, decisions: [], pistes: [], ordreSuivant: 1 };
  const t1 = interpreterAnalyse(etat, sortie({ decisions: [{ id: null, titre: "Supprimer les plans 04 et 07", raison: "", operations: coupes(4, 7) }] }));
  const t2 = interpreterAnalyse({ vue, decisions: t1.decisions, pistes: [], ordreSuivant: t1.ordreSuivant }, sortie({ decisions: [{ id: null, titre: "Supprimer le plan 04", raison: "", operations: coupes(4) }] }));
  const { faits } = tourPur(vue, t2);
  const d2 = faits.decisions.find((d) => d.id === "D2")!;
  assert.ok(d2.constats.some((c) => c.niveau === "alerte" && /Recoupe une décision plus ancienne : P04 est déjà coupé par D1/.test(c.texte)));
  assert.ok(!faits.decisions.find((d) => d.id === "D1")!.constats.some((c) => /Recoupe/.test(c.texte)), "l'alerte est sur la plus récente seulement");
  assert.equal(faits.duree.avecBrouillon, "2:11", "la durée ne compte pas deux fois le plan");
});

test("recoupements : même durée, même plan coupé ; des durées différentes sont un conflit, pas un recoupement", () => {
  const a = { id: "D1", titre: "A", operations: [duree(1, 6), { type: "refondre_fiche", planUuid: planUuid(12), consigne: "" } as Operation] };
  const b = { id: "D2", titre: "B", operations: [duree(1, 6), { type: "refondre_fiche", planUuid: planUuid(12), consigne: "" } as Operation] };
  assert.equal(recoupementsEntreDecisions([a, b], vue).length, 1, "la durée recoupe ; refondre deux fois une fiche n'est pas signalé");
  assert.equal(recoupementsEntreDecisions([a, { id: "D2", titre: "B", operations: [duree(1, 7)] }], vue).length, 0);
  assert.equal(recoupementsEntreDecisions([a], vue).length, 0);
});

test("« les deux » : deux pistes retenues ensemble qui se recouvrent sont fusionnées (couper l'emporte), et on le dit", () => {
  const rythme = { titre: "Resserrer le rythme global", resume: "", operations: [duree(5, 6), duree(11, 8), duree(1, 6), couper(2)] };
  const elaguer = { titre: "Élaguer des plans de transition", resume: "", operations: [couper(5), couper(11), couper(2)] };
  const r = interpreterAnalyse({ vue, decisions: [], pistes: [rythme, elaguer], ordreSuivant: 1 }, sortie({ retenirPistes: [1, 2] }));
  assert.deepEqual(r.pistesChoisies, [1, 2]);
  assert.equal(r.decisions.length, 2);
  const [d1, d2] = r.decisions;
  // La piste 1 coupe P02 en premier : les durées de P05 et P11 sont dominées par les coupes de la piste 2, qui garde P05 et P11 et abandonne P02 (déjà coupé).
  assert.deepEqual(d1!.operations, [duree(1, 6), couper(2)]);
  assert.deepEqual(d2!.operations, [couper(5), couper(11)]);
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0]!, /Resserrer le rythme global.*2 opérations écartées/);
  assert.match(r.notes[1]!, /Élaguer des plans de transition.*1 opération écartée/);
  const { faits } = tourPur(vue, r);
  assert.equal(faits.conflits.length, 0, "plus aucun conflit : la fusion les a levés");
  assert.equal(faits.notes.length, 2, "…et les notes arrivent dans les faits de la réponse");
  assert.ok(faits.decisions.every((d) => d.statut === "retenue"));
});

test("fusion : une seule piste retenue, ou des pistes indépendantes, ne changent rien ; une piste vidée disparaît", () => {
  const a = { titre: "A", resume: "", operations: [couper(5)] };
  const b = { titre: "B", resume: "", operations: [duree(1, 6)] };
  const seule = interpreterAnalyse({ vue, decisions: [], pistes: [a, b], ordreSuivant: 1 }, sortie({ retenirPistes: [1] }));
  assert.deepEqual(seule.decisions[0]!.operations, [couper(5)]);
  assert.deepEqual(seule.notes, []);
  const deux = interpreterAnalyse({ vue, decisions: [], pistes: [a, b], ordreSuivant: 1 }, sortie({ retenirPistes: [1, 2] }));
  assert.equal(deux.decisions.length, 2);
  assert.deepEqual(deux.notes, []);
  const doublon = interpreterAnalyse({ vue, decisions: [], pistes: [a, { titre: "A bis", resume: "", operations: [couper(5)] }], ordreSuivant: 1 }, sortie({ retenirPistes: [1, 2] }));
  assert.equal(doublon.decisions.length, 1, "la deuxième piste ne fait plus rien : elle disparaît");
  assert.equal(doublon.notes.length, 1);
  // un numéro répété ne crée pas deux fois la même décision
  const repete = interpreterAnalyse({ vue, decisions: [], pistes: [a, b], ordreSuivant: 1 }, sortie({ retenirPistes: [1, 1] }));
  assert.equal(repete.decisions.length, 1);
});
