import { test } from "node:test";
import assert from "node:assert/strict";
import { traceMessage } from "./chat-trace";
import { arretDemande, demandeAuScenariste } from "./sheet";

test("traceMessage : une ligne discrète à la place des messages envoyés par une carte", () => {
  assert.equal(traceMessage("sequence", "Je valide la séquence telle quelle (temps fort : moment 7)."), "Séquence validée · temps fort : moment 7");
  assert.equal(traceMessage("questions", "1. La lettre — Des plis marqués ou des pages lisses ? Des plis bien marqués\n2. La lettre — Sa couleur ? Blanc cassé"), "Réponses envoyées : Des plis bien marqués · Blanc cassé");
  assert.equal(traceMessage("choix", "Coton beige usé (couleurs : Beige #e5d9c9 ; matières : coton)"), "Choisi : Coton beige usé");
  assert.equal(traceMessage("autres", "Propose-m'en d'autres…"), "Autres propositions demandées");
});

test("fin d'entretien demandée par l'utilisateur, et demandes au scénariste (projet 265)", () => {
  assert.ok(arretDemande("On peut s'arrêter là :)"));
  assert.ok(arretDemande("C'est bon pour moi, passons au clap"));
  assert.ok(!arretDemande("Ça me va"), "une validation ne clôt rien");
  assert.ok(!arretDemande("Elle s'arrête au bord de la falaise"));
  // Retours 2026-11-23 : des formulations courantes ignorées jusque-là.
  for (const m of ["Stop, on arrête là.", "On arrête là", "Termine l'entretien stp", "On peut terminer l'entretien", "C'est bon, on s'arrête", "On a fini", "Arrête l'entretien", "stop"]) assert.ok(arretDemande(m), m);
  assert.ok(!arretDemande("Il ne s'arrête jamais de courir"));
  assert.ok(!arretDemande("Le train arrête sa course"));
  assert.equal(traceMessage("arret", "Terminons l'entretien ici : je te laisse tout le reste."), "Entretien terminé : le scénariste complète ce qui manque");
  assert.ok(demandeAuScenariste("Propose-m'en d'autres pour « La palette du paysage doré » : trois autres palettes, différentes de celles-ci."));
  assert.ok(demandeAuScenariste("Il te reste des trucs à creuser non ?"));
  assert.ok(!demandeAuScenariste("On peut s'arrêter là :)"));
});
