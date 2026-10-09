import assert from "node:assert/strict";
import { test } from "node:test";
import { interpreterAnalyse, type EtatAvantTour, type SortieAnalyse } from "./analyse";
import { construireEntreeAnalyse } from "./entrees";
import { vueLeSel } from "./fixture-le-sel";
import { assemblerConstats, tourPur } from "./tour-pur";

const vue = vueLeSel();
const sortie = (o: Partial<SortieAnalyse>): SortieAnalyse => ({ decisions: [], retirer: [], pistes: [], retenirPistes: [], narratif: [], ...o });
const coupes = (...n: number[]) => n.map((x) => ({ type: "couper_plan", plan: `P${x}` }));

/** Rejoue un tour entier SANS base : l'analyse du modèle (écrite à la main), le réducteur, les faits. */
function tour(etat: EtatAvantTour, s: SortieAnalyse) {
  const res = interpreterAnalyse(etat, s);
  const { decisions, faits } = tourPur(vue, res);
  const suivant: EtatAvantTour = {
    vue,
    decisions: res.decisions.map((d) => ({ ...d, narratifs: d.narratifs })),
    pistes: res.pistes,
    ordreSuivant: res.ordreSuivant,
  };
  return { res, decisions, faits, suivant };
}

test("parcours « les deux » sans base : une décision, des pistes chiffrées sur l'épisode SANS le plan coupé", () => {
  const t = tour(
    { vue, decisions: [], pistes: [], ordreSuivant: 1 },
    sortie({
      decisions: [{ id: null, titre: "Supprimer le plan 04", raison: "", operations: coupes(4) }],
      pistes: [
        { titre: "Accélérer la scène 1", resume: "", operations: [{ type: "duree_plan", plan: "P01", secondes: 6 }, { type: "duree_plan", plan: "P02", secondes: 6 }, { type: "duree_plan", plan: "P03", secondes: 7 }, { type: "duree_plan", plan: "P05", secondes: 5 }] },
        { titre: "Resserrer la scène 3", resume: "", operations: [{ type: "couper_plan", plan: "P11" }, { type: "duree_plan", plan: "P13", secondes: 12 }] },
      ],
    }),
  );
  assert.equal(t.faits.duree.actuelle, "2:34");
  assert.equal(t.faits.duree.avecBrouillon, "2:26");
  assert.equal(t.faits.duree.ecartSecondes, 26);
  assert.deepEqual(t.faits.pistes.map((p) => [p.gain, p.dureeApres]), [["−13 s", "2:13"], ["−13 s", "2:13"]]);
  assert.equal(t.faits.decisions[0]!.statut, "attention", "un plan à rendu réussi coupé : à surveiller");
  assert.ok(t.faits.decisions[0]!.constats.some((c) => /Écrase le rendu réussi de P04/.test(c.texte)));
});

test("parcours « ressenti » sans base : le conflit narratif du modèle bloque, sa résolution le lève", () => {
  let etat: EtatAvantTour = { vue, decisions: [], pistes: [], ordreSuivant: 1 };
  etat = tour(etat, sortie({ decisions: [{ id: null, titre: "Couper 4 plans", raison: "", operations: coupes(5, 10, 2, 8) }] })).suivant;
  const t2 = tour(
    etat,
    sortie({
      decisions: [{ id: null, titre: "Réplique plus sobre", raison: "", operations: [{ type: "remplacer_replique", replique: "R01", texte: "Je ne reviendrai pas." }] }],
      narratif: [{ decision: "D2", niveau: "conflit", texte: "Le 08 est coupé parce que la réplique disait ce qu'il montre." }],
    }),
  );
  assert.equal(t2.faits.decisions.find((d) => d.id === "D2")!.statut, "conflit");
  assert.ok(t2.faits.decisions[1]!.constats.some((c) => c.source === "modele" && c.niveau === "bloquant"));
  assert.ok(t2.faits.decisions[1]!.constats.some((c) => c.source === "code" && /fiche de P07/.test(c.texte)));
  const t3 = tour(
    t2.suivant,
    sortie({
      decisions: [
        { id: "D1", titre: "Couper 3 plans", raison: "", operations: coupes(5, 10, 2) },
        { id: "D2", titre: "Réplique plus sobre", raison: "", operations: [{ type: "remplacer_replique", replique: "R01", texte: "Je ne reviendrai pas." }] },
      ],
    }),
  );
  assert.equal(t3.faits.decisions.find((d) => d.id === "D2")!.statut, "attention");
  assert.deepEqual(t3.faits.ceTour.modifiees, ["D1", "D2"]);
});

test("une opération refusée n'est jamais perdue : elle arrive dans les faits", () => {
  const t = tour({ vue, decisions: [], pistes: [], ordreSuivant: 1 }, sortie({ decisions: [{ id: null, titre: "Inventé", raison: "", operations: coupes(99) }] }));
  assert.equal(t.faits.decisions.length, 0);
  assert.equal(t.faits.refus.length, 1, "la raison du refus de l'opération");
  assert.match(t.faits.refus[0]!.raison, /P99/);
});

test("constats assemblés : conflits, jugements du modèle et « à relire » ; un « ok » seul s'efface dès qu'il y a autre chose", () => {
  const base = { operationsExistantes: [], vue, manquantes: 0, desApplicateurs: [], conflits: [], narratifs: [], aRelire: false };
  assert.deepEqual(assemblerConstats(base).map((c) => c.niveau), ["ok"]);
  const c = assemblerConstats({ ...base, manquantes: 2, conflits: ["x"], narratifs: [{ niveau: "alerte", texte: "n", source: "modele" }], aRelire: true });
  assert.deepEqual(c.map((x) => x.niveau), ["bloquant", "bloquant", "alerte", "alerte"]);
  assert.ok(c.every((x) => x.niveau !== "ok"));
  assert.match(c[0]!.texte, /2 cibles n'existent plus/);
});

test("entrée de l'analyse sans base : poignées, brouillon, pistes chiffrées, prochain id", () => {
  const t1 = tour({ vue, decisions: [], pistes: [], ordreSuivant: 1 }, sortie({ decisions: [{ id: null, titre: "Couper 3", raison: "", operations: coupes(5, 10, 2) }], pistes: [{ titre: "Accélérer", resume: "", operations: [{ type: "duree_plan", plan: "P01", secondes: 6 }] }] }));
  const { entree, controle } = construireEntreeAnalyse({
    vue,
    decisions: t1.decisions,
    prochainOrdre: t1.suivant.ordreSuivant,
    pistes: t1.suivant.pistes,
    messages: [
      { role: "assistant", content: "Bonjour.", at: "t" },
      { role: "user", content: "Garde le 08.", at: "t" },
    ],
    brief: { arc: "Maya quitte le port.", dureeEpisodeSecondes: 120, personnages: [{ nom: "Maya" }], continuite: [] },
  });
  assert.equal(entree.plans.length, 14);
  assert.deepEqual(entree.plans[4]!.brouillon, { coupe: true });
  assert.equal(entree.plans[5]!.brouillon, null);
  assert.equal(entree.episode.duree, "2:34");
  assert.equal(entree.episode.dureeAvecBrouillonSecondes, 154 - 8 - 10 - 9);
  assert.equal(entree.episode.aEconomiserSecondes, 154 - 27 - 120);
  assert.equal(entree.prochainId, "D2");
  assert.deepEqual(entree.decisions[0]!.operations[0], { type: "couper_plan", plan: "P05" });
  assert.equal(entree.pistesEnAttente[0]!.numero, 1);
  assert.equal(entree.message, "Garde le 08.");
  assert.deepEqual(entree.conversation, [{ qui: "realisateur", texte: "Bonjour." }]);
  assert.deepEqual(entree.brief, { arc: "Maya quitte le port.", dureeEpisodeSecondes: 120 }, "le brief se réduit à ce qui sert : pas de registre, pas de listes vides");
  assert.deepEqual(controle.ordres, [1]);
});
