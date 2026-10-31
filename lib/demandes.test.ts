import assert from "node:assert/strict";
import { test } from "node:test";
import { ERREUR_ANNULEE } from "./annulation";
import { avancerEtapes, decisionAjoutPlan, decisionAjoutScene, decisionFichePlan, etapesAjoutScene, etapesFichePlan, deciderIteration, etapeCouranteDemande, etapesAjoutPlan, etapesIterationPlan, progressionDemande } from "./demandes";

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

// --- Ajouter un plan ---------------------------------------------------------------------------------------------------------------------

const changement = (o: Partial<{ id: number; cibleType: string; operation: string; bloque: boolean; refuseRaison: string | null; avertissements: { type: string; texte: string }[]; libelle: string; apres: unknown }> = {}) => ({
  id: 1,
  cibleType: "plan",
  operation: "creer",
  bloque: false,
  refuseRaison: null,
  avertissements: [],
  libelle: "Plan",
  apres: { titre: "Le seuil" },
  ...o,
});
const proposition = (statut: string, changements: ReturnType<typeof changement>[] = [], erreur: string | null = null) => ({ statut, erreur, groupes: [{ changements }] });

test("ajout de plan : deux étapes, la première en cours", () => {
  const e = etapesAjoutPlan();
  assert.deepEqual(e.map((x) => x.statut), ["en_cours", "a_venir"]);
  assert.equal(etapeCouranteDemande(e)?.cle, "agent");
});

test("ajout de plan : tant que l'agent écrit, on attend ; sa proposition prête, on n'ajoute que le plan", () => {
  assert.deepEqual(decisionAjoutPlan(null), { action: "attendre" });
  assert.deepEqual(decisionAjoutPlan(proposition("en_generation")), { action: "attendre" });
  const d = decisionAjoutPlan(proposition("prete", [changement({ id: 7 }), changement({ id: 8, cibleType: "scene" })]));
  assert.deepEqual(d, { action: "appliquer", planChangementId: 7, changementIds: [7, 8], titre: "Le seuil" });
});

test("ajout de plan : rien à ajouter, contrôle bloquant, refus ou échec de l'agent : la demande échoue avec la raison", () => {
  assert.deepEqual(decisionAjoutPlan(proposition("prete", [changement({ cibleType: "scene" })])), { action: "echec", erreur: "L'agent n'a pas proposé de plan à ajouter." });
  assert.deepEqual(decisionAjoutPlan(proposition("prete", [changement({ bloque: true, avertissements: [{ type: "bloque_controle", texte: "Durée de plan invalide." }] })])), { action: "echec", erreur: "Durée de plan invalide." });
  assert.deepEqual(decisionAjoutPlan(proposition("prete", [changement({ refuseRaison: "Hors portée." })])), { action: "echec", erreur: "Hors portée." });
  assert.deepEqual(decisionAjoutPlan(proposition("echouee", [], "Délai dépassé.")), { action: "echec", erreur: "Délai dépassé." });
});

test("ajout de plan : une proposition déjà appliquée (reprise après un plantage) termine la demande", () => {
  assert.deepEqual(decisionAjoutPlan(proposition("appliquee")), { action: "fait" });
});

// --- Nouvelle scène ----------------------------------------------------------------------------------------------------------------------

test("nouvelle scène : la scène et ses plans sont retenus, le reste (un asset) reste décoché", () => {
  assert.deepEqual(decisionAjoutScene(null), { action: "attendre" });
  const d = decisionAjoutScene(
    proposition("prete", [
      changement({ id: 1, cibleType: "scene", apres: { titre: "La Fuite" } }),
      changement({ id: 2 }),
      changement({ id: 3 }),
      changement({ id: 4, cibleType: "asset" }),
    ]),
  );
  assert.deepEqual(d, { action: "appliquer", changementIds: [1, 2, 3], tous: [1, 2, 3, 4], titre: "La Fuite" });
});

test("nouvelle scène : sans scène, sans plan, bloquée ou refusée, la demande échoue avec la raison", () => {
  assert.deepEqual(decisionAjoutScene(proposition("prete", [changement()])), { action: "echec", erreur: "L'agent n'a pas proposé de scène à ajouter." });
  assert.deepEqual(decisionAjoutScene(proposition("prete", [changement({ cibleType: "scene" })])), { action: "echec", erreur: "L'agent a proposé une scène sans plan." });
  assert.deepEqual(
    decisionAjoutScene(proposition("prete", [changement({ id: 1, cibleType: "scene" }), changement({ id: 2, bloque: true, avertissements: [{ type: "bloque_controle", texte: "Durée de plan invalide." }] })])),
    { action: "echec", erreur: "Durée de plan invalide." },
  );
  assert.deepEqual(decisionAjoutScene(proposition("prete", [changement({ cibleType: "scene", refuseRaison: "Hors portée." }), changement()])), { action: "echec", erreur: "Hors portée." });
  assert.deepEqual(decisionAjoutScene(proposition("appliquee")), { action: "fait" });
  assert.deepEqual(etapesAjoutScene().map((x) => x.cle), ["agent", "ajout"]);
});

// --- Générer la fiche d'un plan ------------------------------------------------------------------------------------------------------------

test("fiche de plan : la fiche et les assets qu'elle crée sont retenus, le reste (un plan) reste décoché", () => {
  assert.deepEqual(etapesFichePlan().map((x) => x.cle), ["agent", "ecriture"]);
  assert.deepEqual(decisionFichePlan(null), { action: "attendre" });
  const d = decisionFichePlan(
    proposition("prete", [
      changement({ id: 1, cibleType: "fiche", operation: "modifier" }),
      changement({ id: 2, cibleType: "asset" }),
      changement({ id: 3, cibleType: "asset", bloque: true }),
      changement({ id: 4, cibleType: "plan" }),
    ]),
  );
  assert.deepEqual(d, { action: "appliquer", changementIds: [1, 2] });
});

test("fiche de plan : sans fiche, bloquée, refusée ou échouée, la demande échoue avec la raison", () => {
  assert.deepEqual(decisionFichePlan(proposition("prete", [changement()])), { action: "echec", erreur: "L'agent n'a pas proposé de fiche." });
  assert.deepEqual(decisionFichePlan(proposition("prete", [changement({ cibleType: "fiche", refuseRaison: "Plan déjà rendu." })])), { action: "echec", erreur: "Plan déjà rendu." });
  assert.deepEqual(
    decisionFichePlan(proposition("prete", [changement({ cibleType: "fiche", bloque: true, avertissements: [{ type: "bloque_controle", texte: "Marqueur non résolu." }] })])),
    { action: "echec", erreur: "Marqueur non résolu." },
  );
  assert.deepEqual(decisionFichePlan(proposition("echouee", [], "Délai dépassé.")), { action: "echec", erreur: "Délai dépassé." });
  assert.deepEqual(decisionFichePlan(proposition("appliquee")), { action: "fait" });
});
