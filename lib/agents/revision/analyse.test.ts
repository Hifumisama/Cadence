import assert from "node:assert/strict";
import { test } from "node:test";
import { chiffresPiste, idCourt, interpreterAnalyse, ordreDeDecision, statutDeDecision, type EtatAvantTour, type SortieAnalyse } from "./analyse";
import { appliquerAuBrouillon } from "./brouillon";
import { construireFaits } from "./faits";
import { fmtDuree } from "./format";
import { planUuid, vueLeSel } from "./fixture-le-sel";
import type { Operation } from "./types";

const vue = vueLeSel();
const vide = (): EtatAvantTour => ({ vue, decisions: [], pistes: [], ordreSuivant: 1 });
const sortie = (o: Partial<SortieAnalyse>): SortieAnalyse => ({ decisions: [], retirer: [], pistes: [], retenirPistes: [], narratif: [], ...o });
const coupes = (...n: number[]) => n.map((x) => ({ type: "couper_plan", plan: `P${x}` }));

test("identifiant court : D3 ↔ 3, jamais autre chose", () => {
  assert.equal(idCourt(3), "D3");
  for (const s of ["D3", "d03", " D 3 "]) assert.equal(ordreDeDecision(s), 3, s);
  assert.equal(ordreDeDecision("P3"), null);
  assert.equal(ordreDeDecision("D0"), null);
  assert.equal(ordreDeDecision(null), null);
});

test("parcours « demande précise » : une décision créée, ses opérations validées, aucun refus", () => {
  const r = interpreterAnalyse(vide(), sortie({ decisions: [{ id: null, titre: "Supprimer le plan 04", raison: "doublon du 07", operations: coupes(4) }] }));
  assert.deepEqual(r.creees, [1]);
  assert.equal(r.decisions[0]!.titre, "Supprimer le plan 04");
  assert.deepEqual(r.decisions[0]!.operations, [{ type: "couper_plan", planUuid: planUuid(4) }]);
  assert.equal(r.ordreSuivant, 2);
  assert.deepEqual(r.refus, []);
});

test("une opération inventée est refusée avec sa raison ; une décision sans opération valide n'est pas créée", () => {
  const r = interpreterAnalyse(
    vide(),
    sortie({
      decisions: [
        { id: null, titre: "Couper le 99", raison: "", operations: coupes(99) },
        { id: null, titre: "Mixte", raison: "", operations: [...coupes(5), { type: "duree_plan", plan: "P01", secondes: 30 }] },
      ],
    }),
  );
  assert.deepEqual(r.creees, [1], "seule la décision « Mixte » existe, avec son opération valide");
  assert.equal(r.decisions[0]!.operations.length, 1);
  assert.equal(r.refus.length, 2);
  assert.match(r.refus.map((x) => x.raison).join(" | "), /P99/);
  assert.match(r.refus.map((x) => x.raison).join(" | "), /5 à 15 s entières/);
});

test("le modèle répète une décision déjà retenue : pas de doublon", () => {
  const e = vide();
  const a = interpreterAnalyse(e, sortie({ decisions: [{ id: null, titre: "Couper", raison: "", operations: coupes(5) }] }));
  const b = interpreterAnalyse({ ...e, decisions: a.decisions, ordreSuivant: a.ordreSuivant }, sortie({ decisions: [{ id: null, titre: "Couper encore", raison: "", operations: coupes(5) }] }));
  assert.equal(b.decisions.length, 1);
  assert.deepEqual(b.creees, []);
});

test("parcours « ressenti » : des pistes, chiffrées par le code ; « combine 1 et 3 » les transforme en décisions", () => {
  const t1 = interpreterAnalyse(
    vide(),
    sortie({
      pistes: [
        { titre: "Couper quatre plans d'ambiance", resume: "05, 10, 02, 08", operations: coupes(5, 10, 2, 8) },
        { titre: "Raccourcir tous les plans", resume: "-15 %", operations: [{ type: "duree_plan", plan: "P06", secondes: 12 }] },
        { titre: "Accélérer la scène 1", resume: "durées 5 à 7 s", operations: [{ type: "duree_plan", plan: "P01", secondes: 6 }, { type: "duree_plan", plan: "P03", secondes: 7 }] },
      ],
    }),
  );
  assert.equal(t1.pistes.length, 3);
  assert.equal(t1.decisions.length, 0, "un ressenti ne crée aucune décision");
  const c1 = chiffresPiste(vue, [], t1.pistes[0]!);
  assert.deepEqual([c1.gain, fmtDuree(c1.totalApres)], [35, "1:59"]);

  const t2 = interpreterAnalyse({ vue, decisions: t1.decisions, pistes: t1.pistes, ordreSuivant: t1.ordreSuivant }, sortie({ retenirPistes: [1, 3] }));
  assert.deepEqual(t2.pistesChoisies, [1, 3]);
  assert.deepEqual(t2.creees, [1, 2]);
  assert.deepEqual(t2.pistes, [], "les pistes sont consommées");
  const ops = t2.decisions.flatMap((d) => d.operations);
  assert.equal(fmtDuree(appliquerAuBrouillon(vue, ops).total), "1:52");
});

test("pistes : sans nouvelles pistes ni choix, les pistes en attente restent ; une piste inconnue est signalée", () => {
  const piste = { titre: "P", resume: "r", operations: [{ type: "couper_plan", planUuid: planUuid(5) } as Operation] };
  const e: EtatAvantTour = { vue, decisions: [], pistes: [piste], ordreSuivant: 1 };
  assert.equal(interpreterAnalyse(e, sortie({})).pistes.length, 1);
  const r = interpreterAnalyse(e, sortie({ retenirPistes: [4] }));
  assert.equal(r.decisions.length, 0);
  assert.match(r.refus[0]!.raison, /Piste 4 introuvable \(il y en a 1\)/);
});

test("modifier une décision (id donné) remplace ses opérations et efface ses jugements d'avant ; retirer une décision", () => {
  const t1 = interpreterAnalyse(
    vide(),
    sortie({
      decisions: [
        { id: null, titre: "Couper 4 plans d'ambiance", raison: "", operations: coupes(5, 10, 2, 8) },
        { id: null, titre: "Réplique plus sobre", raison: "", operations: [{ type: "refondre_fiche", plan: "P07", consigne: "réplique plus sobre" }] },
      ],
      narratif: [{ decision: "D2", niveau: "conflit", texte: "Le plan 08 est coupé parce que la réplique disait ce qu'il montre." }],
    }),
  );
  assert.equal(t1.decisions[1]!.narratifs.length, 1);
  assert.equal(t1.decisions[1]!.narratifs[0]!.niveau, "bloquant");
  assert.equal(t1.decisions[1]!.narratifs[0]!.source, "modele");

  const e1: EtatAvantTour = { vue, decisions: t1.decisions, pistes: [], ordreSuivant: t1.ordreSuivant };
  const t2 = interpreterAnalyse(
    e1,
    sortie({
      decisions: [
        { id: "D1", titre: "Couper 3 plans d'ambiance", raison: "le 08 reste", operations: coupes(5, 10, 2) },
        { id: "D2", titre: "Réplique plus sobre", raison: "", operations: [{ type: "refondre_fiche", plan: "P07", consigne: "réplique plus sobre" }] },
      ],
    }),
  );
  assert.deepEqual(t2.modifiees, [1, 2]);
  assert.equal(t2.decisions[0]!.operations.length, 3);
  assert.deepEqual(t2.decisions[1]!.narratifs, [], "la décision a été re-posée : le conflit d'avant est levé");
  assert.equal(t2.decisions.length, 2);

  const t3 = interpreterAnalyse(e1, sortie({ retirer: ["D1", "D9"] }));
  assert.deepEqual(t3.retirees, [1]);
  assert.equal(t3.decisions.length, 1);
  assert.match(t3.refus[0]!.raison, /D9/);
  const t4 = interpreterAnalyse(e1, sortie({ decisions: [{ id: "D7", titre: "x", raison: "", operations: coupes(5) }] }));
  assert.match(t4.refus[0]!.raison, /D7.*introuvable/);
});

test("statut d'une décision : dérivé des constats", () => {
  const c = (niveau: "ok" | "alerte" | "bloquant") => ({ niveau, texte: "t", source: "code" as const });
  assert.equal(statutDeDecision([c("ok")], false), "retenue");
  assert.equal(statutDeDecision([c("ok"), c("alerte")], false), "attention");
  assert.equal(statutDeDecision([c("alerte"), c("bloquant")], false), "conflit");
  assert.equal(statutDeDecision([c("ok")], true), "conflit");
});

test("faits du tour : tous les chiffres viennent du code", () => {
  const faits = construireFaits({
    ceTour: { creees: ["D1"], modifiees: [], retirees: [], pistesChoisies: [] },
    decisions: [{ id: "D1", titre: "Supprimer le plan 04", statut: "attention", gainSecondes: 8, constats: [{ niveau: "alerte", texte: "Écrase le rendu réussi de P04.", source: "code" }], aReverifier: false }],
    dureeActuelle: 154,
    dureeAvecBrouillon: 146,
    objectifSecondes: 120,
    pistes: [{ numero: 1, titre: "Accélérer la scène 1", resume: "", gainSecondes: 13, dureeApres: "2:13" }],
    refus: [{ contexte: "Décision « x »", raison: "Plan « P99 » introuvable." }],
    conflits: [],
  });
  assert.equal(faits.duree.actuelle, "2:34");
  assert.equal(faits.duree.avecBrouillon, "2:26");
  assert.equal(faits.duree.objectif, "2:00");
  assert.equal(faits.duree.objectifTenu, false);
  assert.equal(faits.duree.ecartSecondes, 26);
  assert.equal(faits.decisions[0]!.gain, "−8 s");
  assert.equal(faits.pistes[0]!.gain, "−13 s");
  const sans = construireFaits({ ceTour: { creees: [], modifiees: [], retirees: [], pistesChoisies: [] }, decisions: [], dureeActuelle: 90, dureeAvecBrouillon: 90, objectifSecondes: null, pistes: [], refus: [], conflits: [] });
  assert.equal(sans.duree.objectif, null);
  assert.equal(sans.duree.objectifTenu, null);
});
