import assert from "node:assert/strict";
import { test } from "node:test";
import { ERREUR_ANNULEE } from "./annulation";
import { avancerEtapes, deciderIteration, etapeCouranteDemande, etapesIterationPlan, progressionDemande } from "./demandes";

const run = (statut: string, erreur: string | null = null) => ({ genre: "run" as const, statut, erreur });
const job = (statut: string, erreur: string | null = null) => ({ genre: "job" as const, statut, erreur });

test("une tâche en file ou en cours : on attend", () => {
  assert.deepEqual(deciderIteration("agent", { tache: run("en_attente"), decision: null }), { type: "attendre" });
  assert.deepEqual(deciderIteration("rendu", { tache: job("en_cours"), decision: null }), { type: "attendre" });
});

test("l'agent a fini : la décision de la proposition commande la suite", () => {
  assert.deepEqual(deciderIteration("agent", { tache: run("termine"), decision: { action: "appliquer", ids: [1], notes: [] } }), { type: "appliquer" });
  assert.deepEqual(deciderIteration("agent", { tache: run("termine"), decision: { action: "reecrire", description: "d", dureeSecondes: 8 } }), { type: "reecrire", description: "d", dureeSecondes: 8 });
  assert.deepEqual(deciderIteration("agent", { tache: run("termine"), decision: { action: "rien", message: "Rien n'a été appliqué." } }), { type: "echouer", erreur: "Rien n'a été appliqué." });
  // la proposition n'est pas encore lisible : on attend
  assert.deepEqual(deciderIteration("agent", { tache: run("termine"), decision: { action: "attendre" } }), { type: "attendre" });
});

test("une réécriture ne peut pas en demander une autre", () => {
  const r = deciderIteration("reecriture", { tache: run("termine"), decision: { action: "reecrire", description: "d" } });
  assert.equal(r.type, "echouer");
  assert.deepEqual(deciderIteration("reecriture", { tache: run("termine"), decision: { action: "appliquer", ids: [1], notes: [] } }), { type: "appliquer" });
});

test("tâche d'agent annulée ou échouée", () => {
  assert.deepEqual(deciderIteration("agent", { tache: run("annulee"), decision: null }), { type: "annuler" });
  assert.deepEqual(deciderIteration("agent", { tache: run("echoue", "boum"), decision: null }), { type: "echouer", erreur: "boum" });
});

test("le rendu : terminé, annulé ou échoué", () => {
  assert.deepEqual(deciderIteration("rendu", { tache: job("termine"), decision: null }), { type: "terminer" });
  assert.deepEqual(deciderIteration("rendu", { tache: job("echoue", ERREUR_ANNULEE), decision: null }), { type: "annuler" });
  assert.deepEqual(deciderIteration("rendu", { tache: job("echoue", "ComfyUI hors ligne"), decision: null }), { type: "echouer", erreur: "ComfyUI hors ligne" });
});

test("sans tâche, la demande échoue", () => {
  assert.equal(deciderIteration("agent", { tache: null, decision: null }).type, "echouer");
});

test("les étapes avancent, une étape peut être passée", () => {
  let e = etapesIterationPlan();
  assert.equal(etapeCouranteDemande(e)?.cle, "agent");
  e = avancerEtapes(e, "agent", "fait", ["reecriture"]);
  assert.deepEqual(e.map((x) => x.statut), ["fait", "passe", "en_cours"]);
  assert.deepEqual(progressionDemande(e), { faites: 2, total: 3 });
  e = avancerEtapes(e, "rendu", "fait");
  assert.equal(etapeCouranteDemande(e), null);
});

test("avec réécriture : l'étape suivante est la réécriture", () => {
  const e = avancerEtapes(etapesIterationPlan(), "agent", "fait");
  assert.deepEqual(e.map((x) => x.statut), ["fait", "en_cours", "a_venir"]);
});
