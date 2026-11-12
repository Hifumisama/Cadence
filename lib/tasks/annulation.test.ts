import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionAnnulation,
  estPurgeable,
  etatDansLaFile,
  gestePourAnnuler,
  statutPlanApresAnnulation,
} from "./annulation";

// Forme d'un élément de /queue : le tuple de l'historique ComfyUI
// [numero, prompt_id, graphe, extra_data, sorties].
const item = (id: string) => [3, id, { "1": {} }, { client_id: "c" }, ["9"]];

test("/queue : un prompt en cours, en file, ou absent", () => {
  const queue = { queue_running: [item("a")], queue_pending: [item("b"), item("c")] };
  assert.equal(etatDansLaFile(queue, "a"), "en_cours");
  assert.equal(etatDansLaFile(queue, "c"), "en_file");
  assert.equal(etatDansLaFile(queue, "z"), "absent");
});

test("/queue : les files vides donnent « absent », pas « inconnu »", () => {
  assert.equal(etatDansLaFile({ queue_running: [], queue_pending: [] }, "a"), "absent");
});

test("/queue : objets avec prompt_id ou id acceptés (format qui évolue)", () => {
  const queue = { queue_running: [{ prompt_id: "a" }], queue_pending: [{ id: "b" }] };
  assert.equal(etatDansLaFile(queue, "a"), "en_cours");
  assert.equal(etatDansLaFile(queue, "b"), "en_file");
});

test("/queue illisible : « inconnu », jamais « absent » (on n'agit pas à l'aveugle)", () => {
  assert.equal(etatDansLaFile(null, "a"), "inconnu");
  assert.equal(etatDansLaFile("<html>", "a"), "inconnu");
  assert.equal(etatDansLaFile({}, "a"), "inconnu");
  assert.equal(etatDansLaFile({ queue_running: [] }, "a"), "inconnu");
  // des éléments bizarres ne plantent pas et ne correspondent à rien
  assert.equal(etatDansLaFile({ queue_running: [42, null, [1]], queue_pending: [] }, "a"), "absent");
});

test("geste d'annulation : interrompre seulement ce qui tourne VRAIMENT", () => {
  assert.equal(gestePourAnnuler("en_cours"), "interrompre");
  assert.equal(gestePourAnnuler("en_file"), "retirer");
  assert.equal(gestePourAnnuler("absent"), "rien");
  assert.equal(gestePourAnnuler("inconnu"), "reessayer");
});

test("statut du plan après annulation : dernière réussite, sinon brouillon", () => {
  assert.equal(statutPlanApresAnnulation([]), "brouillon");
  assert.equal(statutPlanApresAnnulation([{ statut: "echoue", activerUpscale: true }]), "brouillon");
  assert.equal(statutPlanApresAnnulation([{ statut: "echoue", activerUpscale: true }, { statut: "termine", activerUpscale: true }]), "termine");
  // du plus récent au plus ancien : la prévisualisation la plus récente l'emporte
  assert.equal(statutPlanApresAnnulation([{ statut: "termine", activerUpscale: false }, { statut: "termine", activerUpscale: true }]), "previsualise");
});

test("demande d'annulation : directe, drapeau, idempotente, sans effet", () => {
  assert.equal(actionAnnulation({ statut: "en_attente", annulationDemandeeAt: null }), "directe");
  assert.equal(actionAnnulation({ statut: "en_cours", annulationDemandeeAt: null }), "drapeau");
  assert.equal(actionAnnulation({ statut: "en_cours", annulationDemandeeAt: new Date() }), "deja");
  for (const s of ["termine", "echoue", "annulee"]) {
    assert.equal(actionAnnulation({ statut: s, annulationDemandeeAt: null }), "rien");
  }
});

const H = 3600 * 1000;
const maintenant = new Date(Date.UTC(2026, 9, 2, 12, 0));
const il_y_a = (heures: number) => new Date(maintenant.getTime() - heures * H);

test("purge : échecs et annulations de plus de 24 h seulement", () => {
  assert.equal(estPurgeable({ statut: "echoue", finishedAt: il_y_a(25), createdAt: il_y_a(26) }, maintenant), true);
  assert.equal(estPurgeable({ statut: "annulee", finishedAt: il_y_a(30), createdAt: il_y_a(31) }, maintenant), true);
  assert.equal(estPurgeable({ statut: "echoue", finishedAt: il_y_a(23), createdAt: il_y_a(24) }, maintenant), false);
  // pile 24 h : pas encore (strictement plus de 24 h)
  assert.equal(estPurgeable({ statut: "echoue", finishedAt: il_y_a(24), createdAt: il_y_a(24) }, maintenant), false);
});

test("purge : jamais une tâche terminée ni active, même très vieille", () => {
  for (const s of ["termine", "en_attente", "en_cours"]) {
    assert.equal(estPurgeable({ statut: s, finishedAt: il_y_a(500), createdAt: il_y_a(501) }, maintenant), false, s);
  }
});

test("purge : sans date de fin, c'est la création qui compte", () => {
  assert.equal(estPurgeable({ statut: "echoue", finishedAt: null, createdAt: il_y_a(30) }, maintenant), true);
  assert.equal(estPurgeable({ statut: "echoue", finishedAt: null, createdAt: il_y_a(2) }, maintenant), false);
});
