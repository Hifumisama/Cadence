import assert from "node:assert/strict";
import { test } from "node:test";
import { appliquerAuBrouillon, gainSecondes } from "./brouillon";
import { conflitsEntreDecisions, constatDuree, constatsOperations } from "./constats";
import { fmtDuree } from "./format";
import { planUuid, vueLeSel } from "./fixture-le-sel";
import { validerOperations } from "./operations";
import { operationsVersChangements } from "./operations-vers-changements";
import type { Operation, OperationBrute } from "./types";
import { dureeTotale, numeroDePoignee } from "./vue-episode";

const vue = vueLeSel();
const op = (o: Operation): Operation => o;
const couper = (n: number) => op({ type: "couper_plan", planUuid: planUuid(n) });
const duree = (n: number, secondes: number) => op({ type: "duree_plan", planUuid: planUuid(n), secondes });

test("vue : poignées de plans et de répliques sur l'ordre réel, durée totale", () => {
  assert.equal(vue.plans.length, 14);
  assert.deepEqual(vue.plans.slice(0, 3).map((p) => p.handle), ["P01", "P02", "P03"]);
  assert.equal(vue.plans[6]!.handle, "P07");
  assert.equal(dureeTotale(vue), 154);
  assert.equal(fmtDuree(154), "2:34");
  assert.deepEqual(vue.repliques.map((r) => r.handle), ["R01", "R02", "R03"]);
  assert.deepEqual(vue.plans[6]!.repliques, [vue.repliques[0]!.uuid], "P07 cite R01");
  assert.deepEqual(vue.repliques[2]!.plans, [planUuid(12)]);
  assert.equal(vue.plans[3]!.etat, "rendu");
  assert.equal(vue.plans[1]!.etat, "fiche");
  assert.equal(vue.plans[0]!.etat, "brouillon");
});

test("poignée : P7, p07, « P 07 » sont le même plan ; le mauvais préfixe ou zéro, non", () => {
  for (const s of ["P7", "p07", " P 07 ", "P007"]) assert.equal(numeroDePoignee(s, "P"), 7, s);
  assert.equal(numeroDePoignee("R07", "P"), null);
  assert.equal(numeroDePoignee("P00", "P"), null);
  assert.equal(numeroDePoignee("plan 7", "P"), null);
  assert.equal(numeroDePoignee(null, "P"), null);
});

test("validation : les poignées deviennent des uuid, les inventions sont refusées avec une raison", () => {
  const brutes: OperationBrute[] = [
    { type: "couper_plan", plan: "P05" },
    { type: "duree_plan", plan: "P01", secondes: 6 },
    { type: "deplacer_plan", plan: "P09", apres: "P03" },
    { type: "deplacer_plan", plan: "P09", position: "fin" },
    { type: "modifier_plan", plan: "P02", titre: "  Les filets  " },
    { type: "remplacer_replique", replique: "R01", texte: "Je ne reviendrai pas." },
    { type: "supprimer_replique", replique: "R02" },
  ];
  const { valides, refusees } = validerOperations(brutes, vue);
  assert.equal(refusees.length, 0);
  assert.deepEqual(valides[0], { type: "couper_plan", planUuid: planUuid(5) });
  assert.deepEqual(valides[2], { type: "deplacer_plan", planUuid: planUuid(9), position: { apresPlanUuid: planUuid(3) } });
  assert.deepEqual(valides[3], { type: "deplacer_plan", planUuid: planUuid(9), position: { fin: true } });
  assert.deepEqual(valides[4], { type: "modifier_plan", planUuid: planUuid(2), titre: "Les filets" });
  assert.deepEqual(valides[5], { type: "remplacer_replique", repliqueUuid: vue.repliques[0]!.uuid, texte: "Je ne reviendrai pas." });

  const mauvaises: OperationBrute[] = [
    { type: "couper_plan", plan: "P99" },
    { type: "duree_plan", plan: "P01", secondes: 17 },
    { type: "duree_plan", plan: "P01", secondes: 4 },
    { type: "duree_plan", plan: "P01", secondes: 7.5 },
    { type: "duree_plan", plan: "P01" },
    { type: "deplacer_plan", plan: "P01", apres: "P01" },
    { type: "deplacer_plan", plan: "P01", apres: "P77" },
    { type: "deplacer_plan", plan: "P01" },
    { type: "modifier_plan", plan: "P01", titre: " ", description: "" },
    { type: "remplacer_replique", replique: "R01", texte: "" },
    { type: "supprimer_replique", replique: "R09" },
    { type: "fusionner_plans", plan: "P01" },
  ];
  const r = validerOperations(mauvaises, vue);
  assert.equal(r.valides.length, 0);
  assert.equal(r.refusees.length, mauvaises.length);
  assert.match(r.refusees[0]!.raison, /P99.*14 plans/);
  assert.match(r.refusees[1]!.raison, /5 à 15 s entières/);
  assert.match(r.refusees[11]!.raison, /inconnue/);
});

test("validation : déplacer « avant » un plan = après son précédent (ou au début) ; un seul repère, jamais deux", () => {
  const ok = validerOperations(
    [
      { type: "deplacer_plan", plan: "P05", avant: "P02" },
      { type: "deplacer_plan", plan: "P05", avant: "P01" },
    ],
    vue,
  );
  assert.equal(ok.refusees.length, 0);
  assert.deepEqual(ok.valides[0], { type: "deplacer_plan", planUuid: planUuid(5), position: { apresPlanUuid: planUuid(1) } });
  assert.deepEqual(ok.valides[1], { type: "deplacer_plan", planUuid: planUuid(5), position: { debut: true } });

  const mauvaises: OperationBrute[] = [
    { type: "deplacer_plan", plan: "P05", avant: "P02", apres: "P01" },
    { type: "deplacer_plan", plan: "P05", avant: "P02", position: "fin" },
    { type: "deplacer_plan", plan: "P05", avant: "P05" },
    { type: "deplacer_plan", plan: "P05", avant: "P06" },
    { type: "deplacer_plan", plan: "P05", avant: "P77" },
  ];
  const r = validerOperations(mauvaises, vue);
  assert.equal(r.valides.length, 0);
  assert.equal(r.refusees.length, mauvaises.length);
  assert.match(r.refusees[0]!.raison, /Un seul repère/);
  assert.match(r.refusees[3]!.raison, /déjà juste avant/);
});

test("brouillon : les chiffres de la maquette, parcours « ressenti » (1:59 puis 1:50, 1:52, 2:00 pile)", () => {
  const coupes = [couper(5), couper(10), couper(2), couper(8)];
  assert.equal(gainSecondes(vue, coupes), 35);
  assert.equal(fmtDuree(appliquerAuBrouillon(vue, coupes).total), "1:59");
  const rythme = [duree(1, 6), duree(3, 7), duree(4, 6)];
  assert.equal(fmtDuree(appliquerAuBrouillon(vue, [...coupes, ...rythme]).total), "1:50");
  assert.equal(fmtDuree(appliquerAuBrouillon(vue, [...coupes, duree(1, 6), duree(3, 7)]).total), "1:52");
  // Le 08 est gardé : les coupes se réduisent à 05, 10, 02, et on retrouve l'objectif pile.
  assert.equal(appliquerAuBrouillon(vue, [couper(5), couper(10), couper(2), duree(1, 6), duree(3, 7)]).total, 120);
});

test("brouillon : parcours « les deux » (146 s, puis 133 s, puis 120 s) ; une opération sur un plan coupé est ignorée", () => {
  assert.equal(appliquerAuBrouillon(vue, [couper(4)]).total, 146);
  const rythme = [duree(1, 6), duree(2, 6), duree(3, 7), duree(5, 5)];
  assert.equal(appliquerAuBrouillon(vue, [couper(4), ...rythme]).total, 133);
  assert.equal(appliquerAuBrouillon(vue, [couper(4), ...rythme, couper(11), duree(13, 12)]).total, 120);
  const b = appliquerAuBrouillon(vue, [couper(5), duree(5, 6)]);
  assert.equal(b.total, 146);
  assert.equal(b.ignorees.length, 1);
  assert.match(b.ignorees[0]!.raison, /P05 est déjà coupé/);
});

test("brouillon : déplacer un plan change l'ordre ; un repère coupé est ignoré ; remplacer une réplique", () => {
  const b = appliquerAuBrouillon(vue, [op({ type: "deplacer_plan", planUuid: planUuid(9), position: { apresPlanUuid: planUuid(3) } })]);
  assert.deepEqual(b.plans.slice(0, 5).map((p) => p.handle), ["P01", "P02", "P03", "P09", "P04"]);
  assert.equal(b.plans[3]!.deplace, true);
  const fin = appliquerAuBrouillon(vue, [op({ type: "deplacer_plan", planUuid: planUuid(1), position: { fin: true } })]);
  assert.equal(fin.plans.at(-1)!.handle, "P01");
  const coupe = appliquerAuBrouillon(vue, [couper(3), op({ type: "deplacer_plan", planUuid: planUuid(9), position: { apresPlanUuid: planUuid(3) } })]);
  assert.equal(coupe.ignorees.length, 1);
  const rep = appliquerAuBrouillon(vue, [op({ type: "remplacer_replique", repliqueUuid: vue.repliques[0]!.uuid, texte: "Je ne reviendrai pas." })]);
  assert.equal(rep.repliques[0]!.texte, "Je ne reviendrai pas.");
  assert.equal(rep.repliques[0]!.texteOriginal, "Je ne reviendrai jamais.");
});

test("constats : le rendu réussi est écrasé, la réplique cite sa fiche, le reste est « aucun rendu touché »", () => {
  const c4 = constatsOperations([couper(4)], vue);
  assert.equal(c4.length, 1);
  assert.equal(c4[0]!.niveau, "alerte");
  assert.match(c4[0]!.texte, /Écrase le rendu réussi de P04/);
  assert.deepEqual(constatsOperations([couper(5)], vue).map((c) => c.niveau), ["ok"]);

  const rep = constatsOperations([op({ type: "remplacer_replique", repliqueUuid: vue.repliques[0]!.uuid, texte: "Je ne reviendrai pas." })], vue);
  assert.ok(rep.some((c) => /fiche de P07 ne cite pas l'ancienne réplique mot pour mot/.test(c.texte)));
  assert.ok(rep.some((c) => /rendu de P07 sera périmé/.test(c.texte)));
  assert.ok(rep.every((c) => c.source === "code"));
  const vueVerbatim = { ...vue, repliques: vue.repliques.map((r, i) => (i === 0 ? { ...r, plansVerbatim: r.plans } : r)) };
  const rep2 = constatsOperations([op({ type: "remplacer_replique", repliqueUuid: vue.repliques[0]!.uuid, texte: "Je ne reviendrai pas." })], vueVerbatim);
  assert.ok(rep2.some((c) => c.niveau === "alerte" && /mot pour mot : son dialogue est mis à jour/.test(c.texte)));
  assert.ok(rep2.some((c) => /rendu de P07 sera périmé : le prompt/.test(c.texte)));

  const duree4 = constatsOperations([duree(4, 6)], vue);
  assert.match(duree4[0]!.texte, /périmé le rendu de P04/);
  assert.match(constatsOperations([duree(1, 10)], vue)[0]!.texte, /dure déjà 10 s/);
  assert.match(constatsOperations([couper(7)], vue).map((c) => c.texte).join(" "), /1 réplique reste dans l'épisode, sans plan/);
});

test("constat de durée : objectif tenu, manquant, absent", () => {
  assert.equal(constatDuree(120, 120).niveau, "ok");
  const c = constatDuree(133, 120);
  assert.equal(c.niveau, "alerte");
  assert.match(c.texte, /il manque encore 13 s pour tenir 2:00/);
  assert.match(constatDuree(133, null).texte, /pas d'objectif/);
});

test("conflits entre décisions : couper et modifier le même plan, déplacer après un plan coupé, deux durées, réplique modifiée et supprimée", () => {
  const r0 = vue.repliques[0]!.uuid;
  const decisions = [
    { id: "a", titre: "Couper l'ambiance", operations: [couper(5), couper(8)] },
    { id: "b", titre: "Accélérer", operations: [duree(5, 6), duree(1, 6)] },
    { id: "c", titre: "Ranger", operations: [op({ type: "deplacer_plan", planUuid: planUuid(9), position: { apresPlanUuid: planUuid(8) } })] },
    { id: "d", titre: "Durée A", operations: [duree(1, 7)] },
    { id: "e", titre: "Réplique", operations: [op({ type: "remplacer_replique", repliqueUuid: r0, texte: "Autre." })] },
    { id: "f", titre: "Retirer la réplique", operations: [op({ type: "supprimer_replique", repliqueUuid: r0 })] },
  ];
  const textes = conflitsEntreDecisions(decisions, vue).map((x) => x.texte);
  assert.ok(textes.some((t) => /« Couper l'ambiance » coupe P05, que « Accélérer » veut aussi modifier/.test(t)));
  assert.ok(textes.some((t) => /« Ranger » place un plan après P08, que « Couper l'ambiance » coupe/.test(t)));
  assert.ok(textes.some((t) => /« Accélérer » et « Durée A » donnent deux durées différentes à P01/.test(t)));
  assert.ok(textes.some((t) => /« Réplique » modifie R01, que « Retirer la réplique » supprime/.test(t)));
  assert.equal(conflitsEntreDecisions([decisions[0]!, decisions[3]!], vue).length, 0, "décisions indépendantes : aucun conflit");
});

test("opérations vers changements : la forme attendue par les applicateurs", () => {
  const r0 = vue.repliques[0]!;
  const bruts = operationsVersChangements(
    [
      couper(4),
      duree(1, 6),
      op({ type: "deplacer_plan", planUuid: planUuid(9), position: { apresPlanUuid: planUuid(3) } }),
      op({ type: "modifier_plan", planUuid: planUuid(2), titre: "Filets" }),
      op({ type: "remplacer_replique", repliqueUuid: r0.uuid, texte: "Je ne reviendrai pas." }),
      op({ type: "supprimer_replique", repliqueUuid: vue.repliques[1]!.uuid }),
    ],
    vue,
  );
  assert.equal(bruts.length, 6);
  assert.deepEqual([bruts[0]!.cibleType, bruts[0]!.operation, bruts[0]!.cibleRef, bruts[0]!.groupe], ["plan", "supprimer", planUuid(4), "plans"]);
  assert.deepEqual(bruts[1]!.apres, { dureeGenerationSecondes: 6 });
  assert.deepEqual(bruts[2]!.position, { apresPlanUuid: planUuid(3) });
  assert.deepEqual(bruts[2]!.apres, {});
  assert.deepEqual(bruts[3]!.apres, { titre: "Filets" });
  assert.deepEqual([bruts[4]!.cibleType, bruts[4]!.operation, bruts[4]!.groupe], ["replique", "modifier", "repliques"]);
  assert.deepEqual(bruts[4]!.apres, { texte: "Je ne reviendrai pas." });
  assert.equal(bruts[5]!.operation, "supprimer");
  assert.match(bruts[0]!.libelle, /Supprimer P04 · Gros plan/);
});

test("3c : ajouter_plan et refondre_fiche sont validés, les inventions refusées", () => {
  const { valides, refusees } = validerOperations(
    [
      { type: "ajouter_plan", apres: "P03", titre: "  Transition  ", description: "Un plan de passage.", secondes: 6 },
      { type: "ajouter_plan", position: "fin", titre: "Fin", description: "", secondes: 8 },
      { type: "refondre_fiche", plan: "P07", consigne: "  réplique plus sèche " },
      { type: "refondre_fiche", plan: "P07" },
    ],
    vue,
  );
  assert.equal(refusees.length, 0);
  assert.equal(valides[0]!.type, "ajouter_plan");
  const a = valides[0] as Extract<Operation, { type: "ajouter_plan" }>;
  assert.deepEqual({ ...a, ref: "x" }, { type: "ajouter_plan", ref: "x", position: { apresPlanUuid: planUuid(3) }, titre: "Transition", description: "Un plan de passage.", secondes: 6 });
  assert.match(a.ref, /^[0-9a-f-]{36}$/);
  assert.deepEqual(valides[2], { type: "refondre_fiche", planUuid: planUuid(7), consigne: "réplique plus sèche" });
  assert.deepEqual(valides[3], { type: "refondre_fiche", planUuid: planUuid(7), consigne: "" });

  const mauvaises = validerOperations(
    [
      { type: "ajouter_plan", apres: "P03", titre: "", secondes: 6 },
      { type: "ajouter_plan", apres: "P03", titre: "x", secondes: 30 },
      { type: "ajouter_plan", apres: "P99", titre: "x", secondes: 6 },
      { type: "ajouter_plan", titre: "x", secondes: 6 },
      { type: "refondre_fiche", plan: "P99" },
    ],
    vue,
  );
  assert.equal(mauvaises.valides.length, 0);
  assert.equal(mauvaises.refusees.length, 5);
});

test("3c : un plan ajouté entre dans le brouillon (durée, place, scène), une refonte n'en change pas la durée", () => {
  const ajout: Operation = { type: "ajouter_plan", ref: "11111111-1111-4111-8111-111111111111", position: { apresPlanUuid: planUuid(3) }, titre: "Transition", description: "d", secondes: 6 };
  const b = appliquerAuBrouillon(vue, [ajout]);
  assert.equal(b.plans.length, 15);
  assert.equal(b.plans[3]!.uuid, ajout.ref);
  assert.equal(b.plans[3]!.ajoute, true);
  assert.equal(b.total, 160);
  assert.equal(gainSecondes(vue, [ajout]), -6);

  const refonte = appliquerAuBrouillon(vue, [op({ type: "refondre_fiche", planUuid: planUuid(7), consigne: "" })]);
  assert.equal(refonte.total, 154);
  assert.equal(refonte.plans[6]!.fiche, true);

  const coupe = appliquerAuBrouillon(vue, [couper(7), op({ type: "refondre_fiche", planUuid: planUuid(7), consigne: "" })]);
  assert.equal(coupe.ignorees.length, 1, "refondre la fiche d'un plan coupé est sans effet");
  const reperePerdu = appliquerAuBrouillon(vue, [couper(3), { ...ajout }]);
  assert.equal(reperePerdu.plans.length, 14, "un repère coupé annule l'ajout");
});

test("3c : constats et conflits des nouvelles opérations, et passage aux changements des applicateurs", () => {
  const ajout: Operation = { type: "ajouter_plan", ref: "11111111-1111-4111-8111-111111111111", position: { apresPlanUuid: planUuid(3) }, titre: "Transition", description: "d", secondes: 6 };
  assert.match(constatsOperations([ajout], vue)[0]!.texte, /créé sans fiche/);
  const sur4 = constatsOperations([op({ type: "refondre_fiche", planUuid: planUuid(4), consigne: "" })], vue);
  assert.ok(sur4.some((c) => /rendu de P04 sera périmé si tu acceptes/.test(c.texte)));
  assert.ok(sur4.some((c) => c.niveau === "ok" && /réécrite juste après l'application/.test(c.texte)));
  assert.ok(constatsOperations([op({ type: "refondre_fiche", planUuid: planUuid(1), consigne: "" })], vue).some((c) => /n'a pas encore de fiche/.test(c.texte)));

  const conflits = conflitsEntreDecisions(
    [
      { id: "D1", titre: "Couper le 3", operations: [couper(3)] },
      { id: "D2", titre: "Ajouter après le 3", operations: [ajout] },
      { id: "D3", titre: "Refaire la fiche du 3", operations: [op({ type: "refondre_fiche", planUuid: planUuid(3), consigne: "" })] },
    ],
    vue,
  );
  assert.equal(conflits.length, 2);

  const bruts = operationsVersChangements([ajout, op({ type: "refondre_fiche", planUuid: planUuid(7), consigne: "x" })], vue);
  assert.equal(bruts.length, 1, "une refonte n'écrit rien dans la transaction");
  assert.equal(bruts[0]!.operation, "creer");
  assert.equal(bruts[0]!.cle, ajout.ref);
  assert.deepEqual(bruts[0]!.position, { apresPlanUuid: planUuid(3) });
  assert.equal((bruts[0]!.apres as Record<string, unknown>).dureeGenerationSecondes, 6);
});

test("3c bis : « avant », durée absente, réplique d'un plan ajouté, ajouter_replique", () => {
  const { valides, refusees } = validerOperations(
    [
      { type: "ajouter_plan", avant: "P01", titre: "L'eau", description: "d", secondes: 6, texte: "L'eau...", locuteur: "CHAR_katara" },
      { type: "ajouter_plan", avant: "P05", titre: "X", description: "", secondes: 7 },
      { type: "ajouter_replique", plan: "P12", texte: "Tu pars ?", locuteur: "CHAR_pecheur" },
    ],
    vue,
  );
  assert.equal(refusees.length, 0);
  const a = valides[0] as Extract<Operation, { type: "ajouter_plan" }>;
  assert.deepEqual(a.position, { debut: true }, "« avant le premier plan » = au début");
  assert.deepEqual(a.replique, { locuteur: "CHAR_katara", texte: "L'eau..." });
  assert.deepEqual((valides[1] as Extract<Operation, { type: "ajouter_plan" }>).position, { apresPlanUuid: planUuid(4) }, "« avant P05 » = après P04");
  assert.deepEqual(valides[2], { type: "ajouter_replique", planUuid: planUuid(12), locuteur: "CHAR_pecheur", texte: "Tu pars ?" });

  const mauvaises = validerOperations(
    [
      { type: "ajouter_plan", avant: "P01", titre: "L'eau", consigne: "6 secondes" },
      { type: "ajouter_plan", avant: "P01", titre: "x", secondes: 6, texte: "Seul" },
      { type: "ajouter_replique", plan: "P12", texte: "Tu pars ?" },
    ],
    vue,
  );
  assert.equal(mauvaises.valides.length, 0);
  assert.match(mauvaises.refusees[0]!.raison, /"secondes"/, "le refus nomme le champ manquant");
  assert.match(mauvaises.refusees[1]!.raison, /locuteur/);
});

test("3c bis : quatre plans ajoutés avant le premier se lisent dans l'ordre demandé, brouillon comme application", () => {
  const ajouts = ["L'eau", "Le feu", "La terre", "L'air"].map((titre, i): Operation => ({ type: "ajouter_plan", ref: `0000000${i + 1}-0000-4000-8000-000000000000`, position: { debut: true }, titre, description: "", secondes: 6, replique: { locuteur: "CHAR_katara", texte: `${titre}...` } }));
  const b = appliquerAuBrouillon(vue, ajouts);
  assert.deepEqual(b.plans.slice(0, 5).map((p) => p.titre), ["L'eau", "Le feu", "La terre", "L'air", "Plan large du port, brume"]);
  assert.equal(b.total, 154 + 24);

  const bruts = operationsVersChangements(ajouts, vue);
  const plansCrees = bruts.filter((c) => c.cibleType === "plan").map((c) => c.cle);
  assert.deepEqual(plansCrees, [...ajouts].reverse().map((o) => (o as { ref: string }).ref), "appliqués en sens inverse : chacun s'insère au début, l'ordre de lecture final est le bon");
  const i = bruts.findIndex((c) => c.cle === (ajouts[0] as { ref: string }).ref);
  assert.equal(bruts[i + 1]!.cibleType, "replique", "la réplique suit immédiatement son plan");
  assert.equal((bruts[i + 1]!.apres as Record<string, unknown>).planCle, (ajouts[0] as { ref: string }).ref);

  const fin = ["A", "B"].map((titre, k): Operation => ({ type: "ajouter_plan", ref: `1000000${k}-0000-4000-8000-000000000000`, position: { fin: true }, titre, description: "", secondes: 5 }));
  assert.deepEqual(operationsVersChangements(fin, vue).map((c) => c.libelle.slice(0, 11)), ["Ajouter « A", "Ajouter « B"], "à la fin, l'ordre direct");
  assert.deepEqual(appliquerAuBrouillon(vue, fin).plans.slice(-2).map((p) => p.titre), ["A", "B"]);

  const rep = operationsVersChangements([{ type: "ajouter_replique", planUuid: planUuid(12), locuteur: "CHAR_pecheur", texte: "Tu pars ?" }], vue);
  assert.equal(rep.length, 1);
  assert.equal((rep[0]!.apres as Record<string, unknown>).planUuid, planUuid(12));
  assert.ok(constatsOperations([op({ type: "ajouter_replique", planUuid: planUuid(12), locuteur: "x", texte: "y" })], vue).some((c) => c.niveau === "ok" && /liée au plan/.test(c.texte)));
  const pleine = constatsOperations([op({ type: "ajouter_replique", planUuid: planUuid(12), locuteur: "x", texte: "y" })], { ...vue, plans: vue.plans.map((p) => (p.uuid === planUuid(12) ? { ...p, repliques: ["a", "b", "c"] } : p)) });
  assert.ok(pleine.some((c) => c.niveau === "bloquant"), "un plan a au plus 3 répliques");
});

test("3c ter : « entre P03 et P04 » = après P03 ; deux repères qui ne se suivent pas sont refusés", () => {
  const { valides, refusees } = validerOperations(
    [
      { type: "ajouter_plan", apres: "P03", avant: "P04", titre: "x", secondes: 6 },
      { type: "ajouter_plan", apres: "P03", avant: "P07", titre: "y", secondes: 6 },
    ],
    vue,
  );
  assert.deepEqual((valides[0] as Extract<Operation, { type: "ajouter_plan" }>).position, { apresPlanUuid: planUuid(3) });
  assert.equal(valides.length, 1);
  assert.match(refusees[0]!.raison, /ne se suivent pas/);
});

test("schéma de l'analyse : chaque opération a ses champs requis (un plan ajouté sans durée est invalide, « consigne » n'y a pas sa place)", async () => {
  const { chargerSkill } = await import("../../llm/skills");
  const { valider } = await import("../../llm/validation");
  const schema = chargerSkill("realisateur-analyse").schema;
  const sortie = (operations: object[]) => ({ decisions: [{ titre: "t", raison: "r", operations }], retirer: [], pistes: [], retenirPistes: [], narratif: [] });
  const ajout = { type: "ajouter_plan", titre: "L'eau", description: "d", secondes: 6, avant: "P01", texte: "L'eau...", locuteur: "CHAR_maya" };
  assert.equal(valider(schema, sortie([ajout, { type: "ajouter_replique", plan: "P02", texte: "x", locuteur: "CHAR_maya" }, { type: "refondre_fiche", plan: "P03", consigne: "plus serré" }, { type: "couper_plan", plan: "P04" }, { type: "duree_plan", plan: "P05", secondes: 9 }])).ok, true);
  const { secondes: _s, ...sansDuree } = ajout;
  assert.equal(valider(schema, sortie([sansDuree])).ok, false, "pas de durée");
  assert.equal(valider(schema, sortie([{ ...ajout, consigne: "6 secondes" }])).ok, false, "consigne n'existe pas pour un ajout");
  assert.equal(valider(schema, sortie([{ type: "ajouter_replique", plan: "P02", texte: "x" }])).ok, false, "une réplique ajoutée a son locuteur");
  assert.equal(valider(schema, sortie([{ type: "duree_plan", plan: "P05" }])).ok, false, "une durée sans secondes");
});
