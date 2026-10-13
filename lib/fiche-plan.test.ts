import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ajouterSuggestion,
  avanceeUpscale,
  classerPourPrevisualisation,
  compterAPrevisualiser,
  consequencesSuppression,
  essaiVoisin,
  etatPlan,
  libelleEssai,
  planSuivant,
  texteConsigne,
  trierEssais,
  type EssaiPourSuppression,
} from "./fiche-plan";

const essai = (id: number, o: Partial<EssaiPourSuppression> = {}): EssaiPourSuppression => ({
  id,
  numeroRendu: id,
  statut: "termine",
  cheminSortie: `plans/1/r${id}.mp4`,
  activerUpscale: false,
  ...o,
});

test("etatPlan : brouillon sans essai, prêt si le marqueur est posé, sinon en itération", () => {
  assert.equal(etatPlan({ nbEssais: 0, pretUpscaleAt: null }), "brouillon");
  assert.equal(etatPlan({ nbEssais: 0, pretUpscaleAt: new Date() }), "brouillon", "un marqueur orphelin ne fait pas un plan prêt");
  assert.equal(etatPlan({ nbEssais: 2, pretUpscaleAt: null }), "iteration");
  assert.equal(etatPlan({ nbEssais: 2, pretUpscaleAt: new Date() }), "pret");
});

test("trierEssais : du plus récent au plus ancien, par numéro de rendu, sans toucher aux numéros", () => {
  const tries = trierEssais([essai(1), essai(5), essai(3)]);
  assert.deepEqual(
    tries.map((e) => e.numeroRendu),
    [5, 3, 1],
  );
});

test("essaiVoisin : ▲ va vers le plus récent, ▼ vers le plus ancien, null aux extrémités", () => {
  const e = [essai(1), essai(2), essai(4)];
  assert.equal(essaiVoisin(e, 2, "plus-recent")?.id, 4);
  assert.equal(essaiVoisin(e, 2, "plus-ancien")?.id, 1);
  assert.equal(essaiVoisin(e, 4, "plus-recent"), null);
  assert.equal(essaiVoisin(e, 1, "plus-ancien"), null);
  assert.equal(essaiVoisin(e, 99, "plus-ancien"), null);
  assert.equal(essaiVoisin(e, null, "plus-ancien"), null);
});

test("libellés : essai, base et consigne des anciens rendus", () => {
  assert.equal(libelleEssai(3, 2), "Essai n°3 · depuis n°2");
  assert.equal(libelleEssai(1, null), "Essai n°1");
  assert.equal(texteConsigne({ consigne: "  Plus serré ", importe: false }), "Plus serré");
  assert.equal(texteConsigne({ consigne: null, importe: false }), null);
  assert.equal(texteConsigne({ consigne: "", importe: true }), "Vidéo importée.");
});

test("ajouterSuggestion : les suggestions s'enchaînent au texte déjà écrit", () => {
  assert.equal(ajouterSuggestion("", "Plus lent"), "Plus lent");
  assert.equal(ajouterSuggestion("Plus dynamique.", "Plus serré"), "Plus dynamique, plus serré");
});

test("compterAPrevisualiser : seuls les plans à fiche développée, sans rendu et sans file", () => {
  const plans = [
    { statut: "brouillon", nbTermines: 0, nbEnFile: 0 },
    { statut: "en_attente", nbTermines: 0, nbEnFile: 0 },
    { statut: "en_attente", nbTermines: 0, nbEnFile: 1 },
    { statut: "previsualise", nbTermines: 2, nbEnFile: 0 },
    { statut: "echoue", nbTermines: 0, nbEnFile: 0 },
    { statut: "en_cours", nbTermines: 0, nbEnFile: 0 },
  ];
  assert.equal(compterAPrevisualiser(plans), 2);
  const c = classerPourPrevisualisation(plans.map((p, id) => ({ ...p, id })));
  assert.deepEqual(c.neufs, [1, 4]);
  assert.deepEqual(c.avecRendu, [3]);
  assert.equal(c.dejaEnFile, 2);
  assert.equal(c.brouillons, 1);
  assert.equal(compterAPrevisualiser([]), 0);
});

test("avanceeUpscale : le bouton d'upscale n'apparaît que quand tous les plans sont prêts", () => {
  assert.deepEqual(avanceeUpscale(["pret", "iteration", "brouillon"]), { prets: 1, total: 3, pourcent: 33, tousPrets: false });
  assert.equal(avanceeUpscale(["pret", "pret"]).tousPrets, true);
  assert.equal(avanceeUpscale([]).tousPrets, false);
});

test("planSuivant : le suivant dans l'ordre, rien après le dernier", () => {
  const ordre = [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }];
  assert.equal(planSuivant(ordre, "a")?.uuid, "b");
  assert.equal(planSuivant(ordre, "c"), null);
  assert.equal(planSuivant(ordre, "inconnu"), null);
});

const plan = (o: Partial<{ renduRetenuId: number | null; pretUpscaleAt: Date | null; statut: string }> = {}) => ({
  renduRetenuId: null,
  pretUpscaleAt: null,
  statut: "previsualise",
  ...o,
});

test("suppression : refusée tant que l'essai est en file ou en cours", () => {
  for (const statut of ["en_attente", "en_cours"]) {
    const r = consequencesSuppression(plan(), essai(2, { statut, cheminSortie: null }), [essai(1)]);
    assert.equal(r.ok, false);
  }
});

test("suppression : le fichier part sauf s'il est partagé avec un autre essai", () => {
  const seul = consequencesSuppression(plan(), essai(2), [essai(1)]);
  assert.equal(seul.ok && seul.supprimerFichier, true);
  const partage = consequencesSuppression(plan(), essai(2, { cheminSortie: "plans/1/r1.mp4" }), [essai(1)]);
  assert.equal(partage.ok && partage.supprimerFichier, false);
  const sansFichier = consequencesSuppression(plan(), essai(2, { statut: "echoue", cheminSortie: null }), [essai(1)]);
  assert.equal(sansFichier.ok && sansFichier.supprimerFichier, false);
});

test("suppression de l'essai retenu : le plan repasse en itération", () => {
  const pret = new Date();
  const r = consequencesSuppression(plan({ renduRetenuId: 2, pretUpscaleAt: pret }), essai(2), [essai(1), essai(3)]);
  assert.ok(r.ok);
  assert.equal(r.renduRetenuId, null);
  assert.equal(r.pretUpscaleAt, null);
  assert.equal(r.etat, "iteration");
});

test("suppression d'un autre essai : le plan reste prêt avec son essai retenu", () => {
  const pret = new Date();
  const r = consequencesSuppression(plan({ renduRetenuId: 3, pretUpscaleAt: pret }), essai(1), [essai(2), essai(3)]);
  assert.ok(r.ok);
  assert.equal(r.renduRetenuId, 3);
  assert.equal(r.pretUpscaleAt, pret);
  assert.equal(r.etat, "pret");
});

test("suppression du dernier essai : le plan redevient brouillon, en attente côté projection", () => {
  const r = consequencesSuppression(plan({ renduRetenuId: 1, pretUpscaleAt: new Date(), statut: "termine" }), essai(1), []);
  assert.ok(r.ok);
  assert.equal(r.etat, "brouillon");
  assert.equal(r.renduRetenuId, null);
  assert.equal(r.statutPlan, "en_attente");
});

test("suppression : la projection plans.statut suit le dernier essai restant, ou reste si un essai est en file", () => {
  const suit = consequencesSuppression(plan({ statut: "previsualise" }), essai(3), [essai(1), essai(2, { activerUpscale: true })]);
  assert.ok(suit.ok);
  assert.equal(suit.statutPlan, "termine");
  const apercu = consequencesSuppression(plan({ statut: "termine" }), essai(3, { activerUpscale: true }), [essai(1), essai(2)]);
  assert.ok(apercu.ok);
  assert.equal(apercu.statutPlan, "previsualise");
  const echec = consequencesSuppression(plan(), essai(1), [essai(2, { statut: "echoue", cheminSortie: null })]);
  assert.ok(echec.ok);
  assert.equal(echec.statutPlan, "echoue");
  const enFile = consequencesSuppression(plan({ statut: "en_cours" }), essai(1), [essai(2, { statut: "en_cours", cheminSortie: null })]);
  assert.ok(enFile.ok);
  assert.equal(enFile.statutPlan, "en_cours");
});

import { decisionIteration, passagesDeChangement, type PropositionIteration } from "./fiche-plan";

const prop = (o: Partial<PropositionIteration> = {}): PropositionIteration => ({
  statut: "prete",
  erreur: null,
  diagnostic: { confiance: "haute", dureeCoherente: true, abandon: { propose: false } },
  groupes: [{ changements: [{ id: 7, bloque: false, refuseRaison: null, avertissements: [{ type: "ecrase_valide" }] }] }],
  ...o,
});

test("decisionIteration : attend tant que l'agent écrit, échoue avec son message", () => {
  assert.equal(decisionIteration(null).action, "attendre");
  assert.equal(decisionIteration(prop({ statut: "en_generation" })).action, "attendre");
  const e = decisionIteration(prop({ statut: "echouee", erreur: "Rendu disparu." }));
  assert.deepEqual(e, { action: "echec", erreur: "Rendu disparu." });
});

test("decisionIteration : une correction sûre s'applique seule, sans note ; l'écrasement du prompt actuel n'arrête pas", () => {
  assert.deepEqual(decisionIteration(prop()), { action: "appliquer", ids: [7], notes: [] });
});

test("decisionIteration : sans changement applicable, message clair et rien n'est créé", () => {
  const vide = decisionIteration(prop({ groupes: [], resume: "Diagnostic sans écriture : durée réelle 3 s pour 8 s voulues" }));
  assert.deepEqual(vide, { action: "rien", message: "Rien n'a été appliqué ni généré : Diagnostic sans écriture : durée réelle 3 s pour 8 s voulues." });
  const sansResume = decisionIteration(prop({ groupes: [] }));
  assert.ok(sansResume.action === "rien" && /aucun changement/.test(sansResume.message));
  const bloque = decisionIteration(prop({ groupes: [{ changements: [{ id: 1, bloque: true, refuseRaison: null, avertissements: [] }] }] }));
  assert.ok(bloque.action === "rien" && /refusés par un contrôle/.test(bloque.message));
});

test("decisionIteration : confiance faible, abandon, durée, alerte de structure : des NOTES, jamais un arrêt", () => {
  const notes = (o: Partial<PropositionIteration>) => {
    const d = decisionIteration(prop(o));
    assert.equal(d.action, "appliquer");
    return d.action === "appliquer" ? d.notes : [];
  };
  assert.deepEqual(notes({ diagnostic: { confiance: "faible", dureeCoherente: true, abandon: null } }), ["L'agent doutait de son diagnostic."]);
  assert.deepEqual(notes({ diagnostic: { confiance: "haute", dureeCoherente: true, abandon: { propose: true } } }), ["L'agent proposait d'abandonner cette piste."]);
  assert.deepEqual(notes({ diagnostic: { confiance: "haute", dureeCoherente: false, abandon: null } }), ["La durée du rendu ne correspondait pas à celle du plan."]);
  assert.deepEqual(notes({ diagnostic: null }), []);
  assert.deepEqual(notes({ groupes: [{ changements: [{ id: 2, bloque: false, refuseRaison: null, avertissements: [{ type: "alerte_controle" }] }] }] }), [
    "Un contrôle signale une dégradation de structure des shots.",
  ]);
});

test("decisionIteration : on applique ce qui passe, on signale ce qui est refusé ou bloqué", () => {
  const mixte = decisionIteration(
    prop({
      groupes: [
        {
          changements: [
            { id: 2, bloque: false, refuseRaison: null, avertissements: [] },
            { id: 3, bloque: true, refuseRaison: null, avertissements: [] },
            { id: 4, bloque: false, refuseRaison: "hors portée", avertissements: [] },
          ],
        },
      ],
    }),
  );
  assert.deepEqual(mixte, { action: "appliquer", ids: [2], notes: ["2 changements refusés par un contrôle."] });
});

test("passagesDeChangement : lit les passages avant / après, ignore le reste", () => {
  assert.deepEqual(passagesDeChangement({ passages: [{ section: "summary", avant: "a", apres: "b" }, { section: 3 }] }), [{ section: "summary", avant: "a", apres: "b" }]);
  assert.deepEqual(passagesDeChangement(null), []);
});

test("decisionIteration : un asset suggéré par l'agent devient une NOTE de l'essai (il n'est jamais créé par Itérer)", () => {
  const d = decisionIteration(prop({ diagnostic: { confiance: "haute", dureeCoherente: true, abandon: null, assetsSuggeres: [{ code: "CHAR_dragon_ombre" }, { code: "DEC_cave_nuit" }] } }));
  assert.equal(d.action, "appliquer");
  assert.deepEqual(d.action === "appliquer" ? d.notes : [], ["L'agent suggère de créer CHAR_dragon_ombre, DEC_cave_nuit (non créés) : crée-le, génère son image, puis itère de nouveau."]);
});
