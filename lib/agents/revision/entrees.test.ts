import assert from "node:assert/strict";
import { test } from "node:test";
import type { SortieAnalyse } from "./analyse";
import { controleurAnalyse, entreeReponse } from "./entrees";
import { planUuid, vueLeSel } from "./fixture-le-sel";
import { operationEnPoignees, validerOperations } from "./operations";
import type { Operation } from "./types";

const vue = vueLeSel();
const op = (o: Operation): Operation => o;
const couper = (n: number) => op({ type: "couper_plan", planUuid: planUuid(n) });
const duree = (n: number, secondes: number) => op({ type: "duree_plan", planUuid: planUuid(n), secondes });
const sortie = (o: Partial<SortieAnalyse>): SortieAnalyse => ({ decisions: [], retirer: [], pistes: [], retenirPistes: [], narratif: [], ...o });

test("opération stockée → poignées d'aujourd'hui (ce que le modèle relit dans le brouillon)", () => {
  assert.deepEqual(operationEnPoignees(couper(5), vue), { type: "couper_plan", plan: "P05" });
  assert.deepEqual(operationEnPoignees(duree(1, 6), vue), { type: "duree_plan", plan: "P01", secondes: 6 });
  assert.deepEqual(operationEnPoignees(op({ type: "deplacer_plan", planUuid: planUuid(9), position: { apresPlanUuid: planUuid(3) } }), vue), { type: "deplacer_plan", plan: "P09", apres: "P03" });
  assert.deepEqual(operationEnPoignees(op({ type: "deplacer_plan", planUuid: planUuid(9), position: { fin: true } }), vue), { type: "deplacer_plan", plan: "P09", position: "fin" });
  assert.deepEqual(operationEnPoignees(op({ type: "remplacer_replique", repliqueUuid: vue.repliques[0]!.uuid, texte: "Autre." }), vue), { type: "remplacer_replique", replique: "R01", texte: "Autre." });
  assert.equal(operationEnPoignees(op({ type: "couper_plan", planUuid: "inconnu" }), vue).plan, "?", "une cible disparue devient « ? »");
  // Aller-retour : ce que le code écrit pour le modèle, le code le relit.
  const brutes = [couper(5), duree(1, 6), op({ type: "supprimer_replique", repliqueUuid: vue.repliques[1]!.uuid })].map((o) => operationEnPoignees(o, vue));
  assert.equal(validerOperations(brutes, vue).valides.length, 3);
});

test("contrôle de l'analyse : poignée inventée, durée hors limites, id inconnu → renvoyés au modèle (une fois)", () => {
  const controle = controleurAnalyse({ vue, ordres: [1, 2], prochainOrdre: 3 });
  assert.deepEqual(controle(sortie({ decisions: [{ id: null, titre: "ok", raison: "", operations: [{ type: "couper_plan", plan: "P05" }] }] })), []);
  const soucis = controle(
    sortie({
      decisions: [
        { id: null, titre: "Inventé", raison: "", operations: [{ type: "couper_plan", plan: "P99" }] },
        { id: "D9", titre: "Inconnue", raison: "", operations: [{ type: "couper_plan", plan: "P05" }] },
      ],
      pistes: [{ titre: "Trop long", resume: "", operations: [{ type: "duree_plan", plan: "P01", secondes: 20 }] }],
      retirer: ["D7"],
      narratif: [{ decision: "D8", niveau: "conflit", texte: "x" }],
    }),
  );
  assert.equal(soucis.length, 5);
  assert.match(soucis[0]!, /P99/);
  assert.match(soucis.join(" | "), /D9.*n'existe pas/);
  assert.match(soucis.join(" | "), /5 à 15 s entières/);
  assert.match(soucis.join(" | "), /Retirer « D7 »/);
  assert.match(soucis.join(" | "), /Jugement sur « D8 »/);
  // Un jugement sur la NOUVELLE décision de ce tour (D3, annoncée par prochainOrdre) est valide.
  assert.deepEqual(
    controle(sortie({ decisions: [{ id: null, titre: "Neuve", raison: "", operations: [{ type: "couper_plan", plan: "P05" }] }], narratif: [{ decision: "D3", niveau: "conflit", texte: "x" }] })),
    [],
  );
});

test("entrée de la réponse : derniers échanges, dernier message de l'utilisateur à part, faits tels quels", () => {
  const faits = {
    ceTour: { creees: [], modifiees: [], retirees: [], pistesChoisies: [] },
    decisions: [],
    duree: { actuelle: "2:34", avecBrouillon: "2:34", objectif: "2:00", objectifTenu: false, ecartSecondes: 34 },
    pistes: [],
    refus: [],
    conflits: [],
  };
  const messages = [
    { role: "assistant" as const, content: "Bonjour.", at: "t" },
    { role: "user" as const, content: "Trop long.", at: "t" },
  ];
  const e = entreeReponse({ episode: { numero: 1, titre: "Le sel" }, messages, faits });
  assert.equal(e.message, "Trop long.");
  assert.deepEqual(e.conversation, [{ qui: "realisateur", texte: "Bonjour." }]);
  assert.equal(e.faits, faits);
});
