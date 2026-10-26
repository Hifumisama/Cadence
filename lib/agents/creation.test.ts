import test from "node:test";
import assert from "node:assert/strict";
import {
  ETAPES_CREATION,
  decider,
  estOccupe,
  estRienAFaire,
  etapeCourante,
  etapesNeuves,
  normaliserEtapes,
  progression,
  statutDepuisEtapes,
  type EtapeCreation,
  type ObservationEtape,
} from "./creation";

const etape = (cle: EtapeCreation["cle"], statut: EtapeCreation["statut"], over: Partial<EtapeCreation> = {}): EtapeCreation => ({ cle, statut, propositionUuid: null, essais: 0, detail: null, erreur: null, ...over });
const obs = (over: Partial<ObservationEtape> = {}): ObservationEtape => ({ occupe: false, brief: "valide", proposition: null, ...over });
const prop = (over: Partial<NonNullable<ObservationEtape["proposition"]>> = {}) => ({ statut: "prete", lot: false, echecs: 0, bloques: 0, nbChangements: 3, erreur: null, ...over });

test("étapes : l'ordre du pipeline, toutes à venir au départ", () => {
  assert.deepEqual(ETAPES_CREATION.map((e) => e.cle), ["brief", "squelette", "scenarios", "registre", "inventaire", "prompts-inventaire", "relecture"]);
  assert.ok(etapesNeuves().every((e) => e.statut === "a_venir"));
});

test("étapes lues en base : une étape retirée est écartée, une étape nouvelle arrive à venir", () => {
  const lues = [
    ...etapesNeuves().map((e) => ({ ...e, statut: "fait" as const })),
    { cle: "fiches", statut: "en_cours", propositionUuid: "x", essais: 0, detail: null, erreur: null },
    { cle: "prompts-fiches", statut: "a_venir", propositionUuid: null, essais: 0, detail: null, erreur: null },
  ] as unknown as EtapeCreation[];
  const n = normaliserEtapes(lues);
  assert.deepEqual(n.map((e) => e.cle), ETAPES_CREATION.map((e) => e.cle));
  assert.equal(etapeCourante(n), null); // une création arrêtée devant les fiches se termine
  const sansRelecture = normaliserEtapes(lues.filter((e) => e.cle !== "relecture"));
  assert.equal(sansRelecture.find((e) => e.cle === "relecture")?.statut, "a_venir");
  assert.equal(etapeCourante(sansRelecture)?.cle, "relecture");
});

test("étape courante : la première qui n'est ni faite ni passée", () => {
  const e = etapesNeuves();
  assert.equal(etapeCourante(e)?.cle, "brief");
  e[0]!.statut = "fait";
  e[1]!.statut = "passe";
  assert.equal(etapeCourante(e)?.cle, "scenarios");
  for (const x of e) x.statut = "fait";
  assert.equal(etapeCourante(e), null);
  assert.deepEqual(progression(e), { faites: 7, total: 7 });
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
  assert.deepEqual(decider(etape("relecture", "en_cours"), obs({ proposition: prop({ statut: "echouee", lot: true }) })), { type: "relancer-echecs" });
  assert.equal(decider(etape("relecture", "en_cours", { essais: 1 }), obs({ proposition: prop({ statut: "echouee", lot: true, erreur: "LLM en panne" }) })).type, "echouer");
});

test("décision : des changements bloqués par un contrôle sont relancés UNE fois, puis le reste s'applique", () => {
  const bloque = obs({ proposition: prop({ lot: true, bloques: 2 }) });
  assert.deepEqual(decider(etape("scenarios", "en_cours", { essais: 0 }), bloque), { type: "relancer-echecs" });
  assert.deepEqual(decider(etape("scenarios", "en_cours", { essais: 1 }), bloque), { type: "appliquer" });
});

test("décision : proposition rejetée ou disparue = échec ; étape en échec = on attend la reprise", () => {
  assert.equal(decider(etape("relecture", "en_cours"), obs({ proposition: prop({ statut: "rejetee" }) })).type, "echouer");
  assert.equal(decider(etape("relecture", "en_cours"), obs()).type, "echouer");
  assert.deepEqual(decider(etape("relecture", "echoue"), obs()), { type: "attendre" });
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
