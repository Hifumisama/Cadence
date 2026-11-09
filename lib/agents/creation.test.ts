import test from "node:test";
import assert from "node:assert/strict";
import {
  ETAPES_CREATION,
  decider,
  dernieresDemandesParPlan,
  estOccupe,
  estRienAFaire,
  etapeCourante,
  etapesNeuves,
  libelleSuiviFiche,
  normaliserEtapes,
  plansAEcrire,
  progression,
  statutDepuisEtapes,
  statutEffectif,
  type EtapeCreation,
  type ObservationEtape,
} from "./creation";

const etape = (cle: EtapeCreation["cle"], statut: EtapeCreation["statut"], over: Partial<EtapeCreation> = {}): EtapeCreation => ({ cle, statut, propositionUuid: null, essais: 0, detail: null, erreur: null, ...over });
const obs = (over: Partial<ObservationEtape> = {}): ObservationEtape => ({ occupe: false, brief: "valide", proposition: null, ...over });
const prop = (over: Partial<NonNullable<ObservationEtape["proposition"]>> = {}) => ({ statut: "prete", lot: false, echecs: 0, bloques: 0, nbChangements: 3, erreur: null, ...over });

const ORDRE = ["brief", "squelette", "traitement", "scenarios", "registre", "inventaire", "prompts-inventaire", "relecture"];
/** Une étape telle qu'un enregistrement ANCIEN la stocke (clés et statuts retirés depuis). */
const ancienne = (cle: string, statut: string) => ({ cle, statut, propositionUuid: null as string | null, essais: 0, detail: null, erreur: null as string | null });

test("étapes : une seule phase, de brief à la relecture ; plus d'étape de fiches", () => {
  assert.deepEqual(ETAPES_CREATION.map((e) => e.cle), ORDRE);
  assert.ok(etapesNeuves().every((x) => x.statut === "a_venir"));
  assert.deepEqual(etapesNeuves().map((x) => x.cle), ORDRE);
});

test("étape courante : la première qui n'est ni faite ni passée ; la relecture finie, la création est terminée", () => {
  const e = etapesNeuves();
  assert.equal(etapeCourante(e)?.cle, "brief");
  e[0]!.statut = "fait";
  e[1]!.statut = "passe";
  assert.equal(etapeCourante(e)?.cle, "traitement");
  for (const x of e) x.statut = "fait";
  assert.equal(etapeCourante(e), null, "relecture faite : plus rien à faire");
  assert.deepEqual(progression(e), { faites: 8, total: 8 });
  assert.equal(statutDepuisEtapes(e, "en_cours"), "termine", "fin de la création = « terminé » (les fiches se demandent ensuite, hors création)");
});

test("anciens enregistrements : les étapes de fiches (et voix) sont ignorées ; une création terminée reste terminée", () => {
  // Projet 237 : phase 1 finie, phase 2 « à demander ».
  const p237 = [...ORDRE.map((c) => ancienne(c, c === "brief" ? "passe" : "fait")), ancienne("fiches", "a_demander"), ancienne("prompts-fiches", "a_demander"), ancienne("compilation", "a_demander")];
  const n237 = normaliserEtapes(p237);
  assert.deepEqual(n237.map((x) => x.cle), ORDRE);
  assert.deepEqual(progression(n237), { faites: 8, total: 8 });
  assert.equal(etapeCourante(n237), null);
  assert.equal(statutEffectif(n237, "termine"), "termine");
  // Création d'avant les deux phases (fiches écrites par l'installateur), d'avant le traitement et la relecture, avec une étape « voix ».
  const vieille = ["brief", "squelette", "scenarios", "registre", "inventaire", "prompts-inventaire", "voix", "fiches", "prompts-fiches"].map((c) => ancienne(c, "fait"));
  const nv = normaliserEtapes(vieille);
  assert.deepEqual(nv.map((x) => x.cle), ["brief", "squelette", "scenarios", "registre", "inventaire", "prompts-inventaire"], "ordre gardé, rien d'ajouté");
  assert.equal(statutEffectif(nv, "termine"), "termine");
  // Entrées illisibles : ignorées, sans planter.
  assert.deepEqual(normaliserEtapes(null), []);
  assert.deepEqual(normaliserEtapes([null, 3, { statut: "fait" }, ancienne("brief", "fait")]).map((x) => x.cle), ["brief"]);
});

test("anciens enregistrements : une création EN COURS sur une étape de fiches se termine, sans planter", () => {
  const enFiches = [...ORDRE.map((c) => ancienne(c, "fait")), { ...ancienne("fiches", "en_cours"), propositionUuid: "p" }, ancienne("prompts-fiches", "a_venir"), ancienne("compilation", "a_venir")];
  const n = normaliserEtapes(enFiches);
  assert.equal(etapeCourante(n), null, "plus d'étape courante : le pilote écrit l'état et la création se termine");
  assert.equal(statutDepuisEtapes(n, "en_cours"), "termine");
  assert.equal(statutEffectif(n, "en_cours"), "termine", "l'écran la lit déjà terminée");
  // En échec SUR une étape de fiches : l'échec ne compte plus.
  const echec = [...ORDRE.map((c) => ancienne(c, "fait")), { ...ancienne("fiches", "echoue"), erreur: "LLM en panne" }];
  assert.equal(statutEffectif(normaliserEtapes(echec), "echoue"), "termine");
  // Une création ancienne en cours AVANT les fiches continue normalement : sa phase 2 « à demander » est ignorée.
  const debut = [...ORDRE.map((c, i) => ancienne(c, i < 3 ? "fait" : "a_venir")), ancienne("fiches", "a_demander"), ancienne("compilation", "a_demander")];
  const nd = normaliserEtapes(debut);
  assert.equal(etapeCourante(nd)?.cle, "scenarios");
  assert.equal(statutEffectif(nd, "en_cours"), "en_cours");
  assert.deepEqual(progression(nd), { faites: 3, total: 8 });
  // Une étape CONNUE au statut retiré `a_demander` (jamais écrit, mais toléré) redevient « à venir ».
  assert.equal(normaliserEtapes([ancienne("relecture", "a_demander")])[0]!.statut, "a_venir");
  // Arrêtée : reste arrêtée.
  assert.equal(statutEffectif(nd, "arretee"), "arretee");
});

test("garde-fou images (worker/images.ts retient les images d'un projet dont la création est « en_cours ») : jamais en cours une fois la relecture finie", () => {
  // Les fiches posent leurs images APRÈS la création : celle-ci doit donc sortir d'« en_cours » dès sa dernière étape, quelle que soit son histoire.
  const neuve = etapesNeuves().map((x) => ({ ...x, statut: "fait" as const }));
  assert.equal(statutDepuisEtapes(neuve, "en_cours"), "termine");
  const relecturePassee = etapesNeuves().map((x) => ({ ...x, statut: x.cle === "relecture" ? ("passe" as const) : ("fait" as const) }));
  assert.equal(statutDepuisEtapes(relecturePassee, "en_cours"), "termine");
  for (const statut of ["a_demander", "a_venir", "en_cours", "echoue"]) {
    const ancienneCreation = normaliserEtapes([...ORDRE.map((c) => ancienne(c, "fait")), ancienne("fiches", statut), ancienne("compilation", "a_venir")]);
    assert.equal(statutDepuisEtapes(ancienneCreation, "en_cours"), "termine", `ancienne étape « fiches » ${statut} : ne retient pas les images`);
  }
});

test("après la création : les plans à écrire, sans fiche par défaut, jamais un plan dont une demande tourne", () => {
  const plans = [
    { uuid: "a", aUneFiche: false, demandeEnCours: false },
    { uuid: "b", aUneFiche: true, demandeEnCours: false },
    { uuid: "c", aUneFiche: false, demandeEnCours: true },
    { uuid: "d", aUneFiche: true, demandeEnCours: true },
  ];
  assert.deepEqual(plansAEcrire(plans), ["a"]);
  assert.deepEqual(plansAEcrire(plans, true), ["a", "b"]);
  assert.deepEqual(plansAEcrire([]), []);
});

test("suivi des fiches : l'étape en cours, « Fiche écrite », l'échec avec sa raison ; la dernière demande de chaque plan", () => {
  assert.equal(libelleSuiviFiche({ statut: "en_cours", etape: "Images (1/3)", erreur: null }), "Images (1/3)");
  assert.equal(libelleSuiviFiche({ statut: "en_cours", etape: null, erreur: null }), "En file");
  assert.equal(libelleSuiviFiche({ statut: "termine", etape: null, erreur: null }), "Fiche écrite");
  assert.equal(libelleSuiviFiche({ statut: "annulee", etape: "Choix des références", erreur: null }), "Annulée");
  assert.equal(
    libelleSuiviFiche({ statut: "echoue", etape: "Images", erreur: "Pas de prompt d'image pour PROP_lanterne" }),
    "Échec (Images) : Pas de prompt d'image pour PROP_lanterne",
  );
  const d = dernieresDemandesParPlan([
    { id: 3, planId: 1 },
    { id: 9, planId: 2 },
    { id: 7, planId: 1 },
    { id: 5, planId: 2 },
  ]);
  assert.deepEqual(d.map((x) => x.id).sort((a, b) => a - b), [7, 9]);
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
  assert.deepEqual(decider(etape("scenarios", "en_cours"), obs({ proposition: prop({ statut: "echouee", lot: true }) })), { type: "relancer-echecs" });
  assert.equal(decider(etape("scenarios", "en_cours", { essais: 1 }), obs({ proposition: prop({ statut: "echouee", lot: true, erreur: "LLM en panne" }) })).type, "echouer");
});

test("décision : des changements bloqués par un contrôle sont relancés UNE fois, puis le reste s'applique", () => {
  const bloque = obs({ proposition: prop({ lot: true, bloques: 2 }) });
  assert.deepEqual(decider(etape("inventaire", "en_cours", { essais: 0 }), bloque), { type: "relancer-echecs" });
  assert.deepEqual(decider(etape("inventaire", "en_cours", { essais: 1 }), bloque), { type: "appliquer" });
});

test("décision : proposition rejetée ou disparue = échec ; étape en échec = on attend la reprise", () => {
  assert.equal(decider(etape("registre", "en_cours"), obs({ proposition: prop({ statut: "rejetee" }) })).type, "echouer");
  assert.equal(decider(etape("registre", "en_cours"), obs()).type, "echouer");
  assert.deepEqual(decider(etape("registre", "echoue"), obs()), { type: "attendre" });
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
