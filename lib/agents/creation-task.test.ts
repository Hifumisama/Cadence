import assert from "node:assert/strict";
import { test } from "node:test";
import { analyserCle, cleCreation } from "../tasks/tasks";
import { etapesNeuves, type EtapeCreation } from "./creation";
import { estDeLaCreation, fenetreDeCreation, tacheDeCreation, type RunDeCreation } from "./creation-task";

const t0 = new Date("2026-10-09T10:00:00Z");
const t1 = new Date("2026-10-09T10:30:00Z");
const t2 = new Date("2026-10-09T11:00:00Z");

const run = (p: Partial<RunDeCreation> = {}): RunDeCreation => ({ conversationId: 5, createdAt: new Date("2026-10-09T10:10:00Z"), statut: "termine", vuAt: null, jetons: null, annulationDemandee: false, ...p });
const etapesFaites = (n: number): EtapeCreation[] => etapesNeuves().map((e, i) => (i < n ? { ...e, statut: "fait" as const } : e));
const entree = (p: Partial<Parameters<typeof tacheDeCreation>[0]> = {}) => ({
  projectId: 7,
  projetNom: "Avatar",
  statut: "en_cours" as const,
  erreur: null,
  etapes: etapesFaites(3),
  createdAt: t0,
  updatedAt: t1,
  runs: [run()],
  ...p,
});

test("la clé de création se lit comme les autres, et n'accepte qu'un id numérique", () => {
  assert.equal(cleCreation(7), "creation:7");
  assert.deepEqual(analyserCle("creation:7"), { genre: "creation", ref: "7" });
  assert.equal(analyserCle("creation:abc"), null);
  assert.equal(analyserCle("creation:7; drop"), null);
  assert.equal(analyserCle("creation:"), null);
});

test("fenêtre : seules les tâches de la conversation du projet, pendant la création, en font partie", () => {
  const enCours = fenetreDeCreation({ statut: "en_cours", createdAt: t0, updatedAt: t1 }, 5);
  assert.equal(estDeLaCreation(run(), enCours), true);
  assert.equal(estDeLaCreation(run({ conversationId: 6 }), enCours), false, "autre conversation");
  assert.equal(estDeLaCreation(run({ createdAt: new Date("2026-10-09T09:00:00Z") }), enCours), false, "avant le début");
  assert.equal(estDeLaCreation(run({ createdAt: t2 }), enCours), true, "sans fin tant que la création travaille");
  const finie = fenetreDeCreation({ statut: "termine", createdAt: t0, updatedAt: t1 }, 5);
  assert.equal(estDeLaCreation(run({ createdAt: t2 }), finie), false, "après la fin : travail manuel, tâche à part");
});

test("création en cours : une ligne qui avance étape par étape", () => {
  const x = tacheDeCreation(entree({ runs: [run({ statut: "en_cours", jetons: 120 })] }))!;
  assert.equal(x.cle, "creation:7");
  assert.equal(x.statut, "en_cours");
  assert.equal(x.libelle, "Conception · Avatar");
  assert.equal(x.href, "/p/7/creation");
  // Huit étapes, du brief à la relecture : les fiches ne sont plus des étapes de la création.
  assert.deepEqual(x.progression, { valeur: 3, max: 8, etape: "Scénarios des épisodes" });
  assert.equal(x.jetons, 120);
  assert.equal(x.conversationUuid, undefined, "un clic mène à la page, pas à la popup d'agent");
});

test("création en cours dont les tâches attendent : la ligne attend, comme une tâche d'agent", () => {
  assert.equal(tacheDeCreation(entree({ runs: [run({ statut: "en_attente" })] }))!.statut, "en_attente");
  assert.equal(tacheDeCreation(entree({ runs: [run({ statut: "en_attente" }), run({ statut: "en_cours" })] }))!.statut, "en_cours");
  assert.equal(tacheDeCreation(entree({ runs: [run({ statut: "termine" })] }))!.statut, "en_cours", "entre deux étapes, l'installateur travaille");
  assert.equal(tacheDeCreation(entree({ runs: [] }))!.statut, "en_cours", "étapes sans appel : la ligne existe quand même");
});

test("création terminée, échouée ou arrêtée", () => {
  const fin = { createdAt: t0, updatedAt: t1, etapes: etapesFaites(10) };
  const ok = tacheDeCreation(entree({ ...fin, statut: "termine" }))!;
  assert.equal(ok.statut, "termine");
  assert.equal(ok.finishedAt, t1.toISOString());
  assert.equal(ok.progression, null);
  assert.equal(ok.vuAt, null, "des tâches pas encore vues : la ligne n'est pas vue");

  const vue = tacheDeCreation(entree({ ...fin, statut: "termine", runs: [run({ vuAt: t1 })] }))!;
  assert.equal(vue.vuAt, t1.toISOString());

  const etapes = etapesFaites(2).map((e, i) => (i === 2 ? { ...e, statut: "echoue" as const, erreur: "Modèle muet" } : e));
  const ko = tacheDeCreation(entree({ statut: "echoue", erreur: null, etapes }))!;
  assert.equal(ko.statut, "echoue");
  assert.equal(ko.erreur, "Modèle muet");

  assert.equal(tacheDeCreation(entree({ statut: "arretee" }))!.statut, "annulee");
});

test("ancien enregistrement : les étapes de fiches sont ignorées (total, étape courante, statut)", () => {
  const vieille = (statut: string) => ({ cle: "fiches", statut, propositionUuid: null, essais: 0, detail: null, erreur: "LLM en panne" }) as unknown as EtapeCreation;
  // En cours, phase 1 pas finie, phase 2 « à demander » : 8 étapes, la courante est celle de la phase 1.
  const enCours = tacheDeCreation(entree({ etapes: [...etapesFaites(3), vieille("a_demander")] }))!;
  assert.deepEqual(enCours.progression, { valeur: 3, max: 8, etape: "Scénarios des épisodes" });
  // En cours (ou en échec) SUR l'étape de fiches, tout le reste fini : la ligne se lit terminée.
  const finie = tacheDeCreation(entree({ etapes: [...etapesFaites(8), vieille("en_cours")] }))!;
  assert.equal(finie.statut, "termine");
  assert.equal(finie.progression, null);
  assert.equal(tacheDeCreation(entree({ statut: "echoue", etapes: [...etapesFaites(8), vieille("echoue")] }))!.statut, "termine");
});

test("plus de tâche à montrer : une création finie dont les tâches sont retirées disparaît, une création en cours reste", () => {
  assert.equal(tacheDeCreation(entree({ statut: "termine", runs: [] })), null);
  assert.equal(tacheDeCreation(entree({ statut: "arretee", runs: [] })), null);
  assert.notEqual(tacheDeCreation(entree({ statut: "en_cours", runs: [] })), null);
});

test("annulation demandée : visible tant qu'une tâche tourne", () => {
  assert.equal(tacheDeCreation(entree({ runs: [run({ statut: "en_cours", annulationDemandee: true })] }))!.annulationDemandee, true);
  assert.equal(tacheDeCreation(entree({ runs: [run({ statut: "termine", annulationDemandee: true })] }))!.annulationDemandee, false);
});
