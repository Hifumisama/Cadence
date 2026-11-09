import test from "node:test";
import assert from "node:assert/strict";
import {
  CLES_PHASE_2,
  ETAPES_CREATION,
  decider,
  demanderPhase2,
  estOccupe,
  estRienAFaire,
  etapeCourante,
  etapesNeuves,
  etatPhase2,
  normaliserEtapes,
  phase1Finie,
  progression,
  statutDepuisEtapes,
  type EtapeCreation,
  type ObservationEtape,
} from "./creation";

const etape = (cle: EtapeCreation["cle"], statut: EtapeCreation["statut"], over: Partial<EtapeCreation> = {}): EtapeCreation => ({ cle, statut, propositionUuid: null, essais: 0, detail: null, erreur: null, ...over });
const obs = (over: Partial<ObservationEtape> = {}): ObservationEtape => ({ occupe: false, brief: "valide", proposition: null, ...over });
const prop = (over: Partial<NonNullable<ObservationEtape["proposition"]>> = {}) => ({ statut: "prete", lot: false, echecs: 0, bloques: 0, nbChangements: 3, erreur: null, ...over });

const PHASE_2 = ["fiches", "prompts-fiches", "compilation"];

test("étapes : l'ordre du pipeline ; la phase 1 à venir, la phase 2 sur demande", () => {
  assert.deepEqual(ETAPES_CREATION.map((e) => e.cle), ["brief", "squelette", "traitement", "scenarios", "registre", "inventaire", "prompts-inventaire", "relecture", "fiches", "prompts-fiches", "compilation"]);
  assert.deepEqual(CLES_PHASE_2, PHASE_2);
  const e = etapesNeuves();
  assert.ok(e.filter((x) => !PHASE_2.includes(x.cle)).every((x) => x.statut === "a_venir"));
  assert.ok(e.filter((x) => PHASE_2.includes(x.cle)).every((x) => x.statut === "a_demander"));
});

test("étape courante : la première qui n'est ni faite ni passée ; la phase 2 ne part jamais seule", () => {
  const e = etapesNeuves();
  assert.equal(etapeCourante(e)?.cle, "brief");
  e[0]!.statut = "fait";
  e[1]!.statut = "passe";
  assert.equal(etapeCourante(e)?.cle, "traitement");
  for (const x of e) if (!PHASE_2.includes(x.cle)) x.statut = "fait";
  assert.equal(etapeCourante(e), null, "phase 1 finie : rien à faire sans demande");
  assert.deepEqual(progression(e), { faites: 8, total: 8 }, "les étapes sur demande ne comptent pas");
  assert.equal(statutDepuisEtapes(e, "en_cours"), "termine", "phase 1 finie = préparation terminée (en attente des fiches)");
  assert.equal(etatPhase2(e), "a_demander");
  assert.equal(phase1Finie(e), true);
  assert.deepEqual(decider(etape("fiches", "a_demander"), obs()), { type: "attendre" });

  const demandee = demanderPhase2(e);
  assert.equal(etapeCourante(demandee)?.cle, "fiches");
  assert.equal(etatPhase2(demandee), "en_cours");
  assert.equal(statutDepuisEtapes(demandee, "termine"), "en_cours");
  assert.deepEqual(progression(demandee), { faites: 8, total: 11 });
  for (const x of demandee) x.statut = "fait";
  assert.equal(etapeCourante(demandee), null);
  assert.equal(etatPhase2(demandee), "faite");
});

test("phase 2 demandée : repart de zéro, ajoute les étapes qu'une création ancienne n'avait pas", () => {
  const ancienne = etapesNeuves().filter((x) => x.cle !== "compilation").map((x) => ({ ...x, statut: "fait" as const, propositionUuid: "p" }));
  const d = demanderPhase2(ancienne);
  assert.deepEqual(d.map((x) => x.cle), ETAPES_CREATION.map((x) => x.cle));
  assert.ok(d.filter((x) => PHASE_2.includes(x.cle)).every((x) => x.statut === "a_venir" && x.propositionUuid === null));
  assert.ok(d.filter((x) => !PHASE_2.includes(x.cle)).every((x) => x.statut === "fait" && x.propositionUuid === "p"), "la phase 1 ne bouge pas");
});

test("création d'avant les deux phases : en cours, elle s'arrêtera avant les fiches ; finie, elle reste finie", () => {
  // Lancée avant le 2026-11-08 : la phase 2 était « à venir ».
  const enCours = etapesNeuves().map((x, i) => ({ ...x, statut: (i < 3 ? "fait" : "a_venir") as EtapeCreation["statut"] }));
  const n = normaliserEtapes(enCours);
  assert.ok(n.filter((x) => PHASE_2.includes(x.cle)).every((x) => x.statut === "a_demander"));
  assert.equal(etapeCourante(n)?.cle, "scenarios");
  const finie = etapesNeuves().map((x) => ({ ...x, statut: "fait" as const }));
  assert.deepEqual(normaliserEtapes(finie), finie);
  assert.equal(etatPhase2(finie), "faite");
  // Phase 2 demandée (phase 1 finie) : « à venir » veut dire demandée, on n'y touche pas.
  const demandee = demanderPhase2(finie);
  assert.deepEqual(normaliserEtapes(demandee), demandee);
});

test("compilation Open H3 IR : un échec n'arrête pas la création (les fiches plan-h3 restent)", () => {
  assert.deepEqual(decider(etape("compilation", "en_cours", { essais: 0 }), obs({ proposition: prop({ lot: true, echecs: 1 }) })), { type: "relancer-echecs" });
  assert.deepEqual(decider(etape("compilation", "en_cours", { essais: 1 }), obs({ proposition: prop({ lot: true, echecs: 1, nbChangements: 2 }) })), { type: "appliquer" });
  assert.equal(decider(etape("compilation", "en_cours", { essais: 1 }), obs({ proposition: prop({ lot: true, echecs: 2, nbChangements: 0 }) })).type, "fait");
  const d = decider(etape("compilation", "en_cours", { essais: 1 }), obs({ proposition: prop({ statut: "echouee", lot: true, erreur: "Python absent" }) }));
  assert.equal(d.type, "fait");
  assert.match((d as { detail: string }).detail, /Python absent.*fiches plan-h3 restent/);
});

test("décision : une étape à venir se lance, sauf si la conversation est occupée", () => {
  assert.deepEqual(decider(etape("scenarios", "a_venir"), obs()), { type: "lancer" });
  assert.deepEqual(decider(etape("scenarios", "a_venir"), obs({ occupe: true })), { type: "attendre" });
});

test("décision : le brief est fait quand il est écrit et que plus rien ne tourne", () => {
  assert.deepEqual(decider(etape("brief", "en_cours"), obs({ occupe: true, brief: "aucun" })), { type: "attendre" });
  assert.equal(decider(etape("brief", "en_cours"), obs({ brief: "brouillon" })).type, "fait");
  assert.equal(decider(etape("brief", "en_cours"), obs({ brief: "partiel" })).type, "echouer");
});

test("décision : une proposition prête est appliquée, une proposition vide est faite sans rien écrire", () => {
  assert.deepEqual(decider(etape("squelette", "en_cours"), obs({ proposition: prop({ statut: "en_generation" }) })), { type: "attendre" });
  assert.deepEqual(decider(etape("squelette", "en_cours"), obs({ proposition: prop() })), { type: "appliquer" });
  assert.deepEqual(decider(etape("inventaire", "en_cours"), obs({ proposition: prop({ nbChangements: 0 }) })), { type: "fait", detail: "Rien à ajouter." });
  assert.equal(decider(etape("squelette", "en_cours"), obs({ proposition: prop({ statut: "appliquee" }) })).type, "fait");
});

test("décision : un lot avec des échecs est relancé UNE fois, puis l'étape échoue", () => {
  const avecEchecs = obs({ proposition: prop({ lot: true, echecs: 2 }) });
  assert.deepEqual(decider(etape("scenarios", "en_cours", { essais: 0 }), avecEchecs), { type: "relancer-echecs" });
  const d = decider(etape("scenarios", "en_cours", { essais: 1 }), avecEchecs);
  assert.equal(d.type, "echouer");
  assert.match((d as { erreur: string }).erreur, /2 sous-tâches en échec/);
  // un lot entièrement échoué suit la même règle
  assert.deepEqual(decider(etape("fiches", "en_cours"), obs({ proposition: prop({ statut: "echouee", lot: true }) })), { type: "relancer-echecs" });
  assert.equal(decider(etape("fiches", "en_cours", { essais: 1 }), obs({ proposition: prop({ statut: "echouee", lot: true, erreur: "LLM en panne" }) })).type, "echouer");
});

test("décision : des changements bloqués par un contrôle sont relancés UNE fois, puis le reste s'applique", () => {
  const bloque = obs({ proposition: prop({ lot: true, bloques: 2 }) });
  assert.deepEqual(decider(etape("fiches", "en_cours", { essais: 0 }), bloque), { type: "relancer-echecs" });
  assert.deepEqual(decider(etape("fiches", "en_cours", { essais: 1 }), bloque), { type: "appliquer" });
});

test("décision : proposition rejetée ou disparue = échec ; étape en échec = on attend la reprise", () => {
  assert.equal(decider(etape("fiches", "en_cours"), obs({ proposition: prop({ statut: "rejetee" }) })).type, "echouer");
  assert.equal(decider(etape("fiches", "en_cours"), obs()).type, "echouer");
  assert.deepEqual(decider(etape("fiches", "echoue"), obs()), { type: "attendre" });
});

test("refus du service : « rien à faire » passe l'étape, « déjà en cours » attend", () => {
  for (const m of ["Aucun asset créé par cette proposition n'attend son prompt.", "Tous les assets du brief ont déjà un prompt : choisis ceux à réécrire.", "Aucune voix à créer : chaque personnage qui parle a déjà la sienne.", "Plus rien à écrire"]) {
    assert.equal(estRienAFaire(m), true, m);
  }
  assert.equal(estRienAFaire("Une tâche de l'agent est déjà en cours sur cette conversation."), false);
  assert.equal(estOccupe("Une tâche de l'agent est déjà en cours sur cette conversation. Tâche en cause : x."), true);
  assert.equal(estOccupe("Écris d'abord le brief du projet."), false);
});

test("statut de la création : échoue dès qu'une étape échoue, termine quand tout est fini, une création arrêtée le reste", () => {
  const e = etapesNeuves();
  assert.equal(statutDepuisEtapes(e, "en_cours"), "en_cours");
  e[2]!.statut = "echoue";
  assert.equal(statutDepuisEtapes(e, "en_cours"), "echoue");
  for (const x of e) x.statut = "passe";
  assert.equal(statutDepuisEtapes(e, "en_cours"), "termine");
  assert.equal(statutDepuisEtapes(e, "arretee"), "arretee");
});
