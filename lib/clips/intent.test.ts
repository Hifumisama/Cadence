import assert from "node:assert/strict";
import { test } from "node:test";
import { aUnEtatDeFin, conserverConsigneAuteur, consigneAuteur, descriptionSeraitPerdue, intentAffichee, intentionChangee, memeDescription, raisonDescriptionIncomplete, normaliserGuillemetsRepliques, recitDe, repliquesPerdues, sansConsigneAuteur, sansEtatDeFin } from "./intent";

// A clip written before 2026-11-08: narrative, dialogue lines, author's instruction, then the old « État en fin de plan ».
const ANCIEN = [
  "Mai entre dans la salle et regarde le garde.",
  "",
  "Mai : « Tu es sûr ? »",
  "",
  "Consigne de l'auteur : plan large d'abord.",
  "",
  "État en fin de plan : Mai à gauche de la porte,",
  "tournée vers le garde.",
].join("\n");

test("sansEtatDeFin : retire l'ancienne ligne (et la suite de son paragraphe), garde tout le reste ; une description récente est rendue telle quelle", () => {
  const t = sansEtatDeFin(ANCIEN);
  assert.ok(!/état en fin/i.test(t));
  assert.ok(!t.includes("tournée vers le garde"));
  assert.ok(t.startsWith("Mai entre dans la salle"));
  assert.ok(t.includes("Mai : « Tu es sûr ? »"));
  assert.ok(t.includes("Consigne de l'auteur : plan large d'abord."));
  // at the end of a paragraph, without a line break
  assert.equal(sansEtatDeFin("Il frappe. État en fin de plan : debout."), "Il frappe.");
  assert.equal(sansEtatDeFin("Il frappe.\nEtat en fin de plan : debout."), "Il frappe.");
  // nothing to remove
  assert.equal(sansEtatDeFin("Elle part.\nMai : « Adieu. »"), "Elle part.\nMai : « Adieu. »");
  assert.equal(sansEtatDeFin(null), "");
  assert.ok(aUnEtatDeFin(ANCIEN));
  assert.ok(!aUnEtatDeFin("Elle part."));
});

test("intentAffichee : masque la consigne de l'auteur et l'ancien état de fin, garde le récit et les répliques", () => {
  assert.equal(intentAffichee(ANCIEN), "Mai entre dans la salle et regarde le garde.\n\nMai : « Tu es sûr ? »");
  // an instruction at the end of a narrative paragraph
  assert.equal(sansConsigneAuteur("Mai se lève. Consigne de l'auteur : gros plan sur ses mains.\nMai : « Allons-y. »"), "Mai se lève.\nMai : « Allons-y. »");
  assert.equal(intentAffichee(""), "");
});

test("recitDe : ni répliques, ni consigne, ni état de fin", () => {
  assert.equal(recitDe(ANCIEN), "Mai entre dans la salle et regarde le garde.");
  assert.equal(recitDe("Mai : « Tu es sûr ? »\nGarde : « Oui. »"), "");
  // a quotation in the narrative is not a dialogue line
  assert.equal(recitDe("Elle murmure « non » et recule."), "Elle murmure « non » et recule.");
});

test("raisonDescriptionIncomplete : un fragment ou une phrase d'état seule est refusé ; une description complète retouchée passe", () => {
  const actuelle = "Mai, assise à gauche du feu, frotte deux pierres ; une étincelle jaillit, les brindilles s'embrasent. Elle souffle, les flammes montent et éclairent son visage.\nMai : « Enfin. »";
  assert.match(raisonDescriptionIncomplete("État en fin de plan : Mai assise à gauche du feu, les mains tendues ; le feu brûle haut.", actuelle) ?? "", /plus de récit/);
  assert.match(raisonDescriptionIncomplete("Mai : « Enfin. »", actuelle) ?? "", /plus de récit/);
  assert.match(raisonDescriptionIncomplete("Mai se lève.", actuelle) ?? "", /presque rien/);
  assert.equal(raisonDescriptionIncomplete(actuelle.replace("Elle souffle", "Elle souffle doucement"), actuelle), null);
  // a rewrite may simplify, as long as it keeps some narrative
  assert.equal(raisonDescriptionIncomplete("Mai, assise à gauche du feu, frotte deux pierres sans succès.", actuelle, { reecriture: true }), null);
  // without a current description: only the absence of narrative counts
  assert.equal(raisonDescriptionIncomplete("Mai se lève.", ""), null);
});

test("repliquesPerdues : les répliques de l'actuelle absentes de la nouvelle", () => {
  assert.deepEqual(repliquesPerdues("Elle part.\nMai : « Adieu ! »", "Elle part.\nMai : « Adieu ! »\nGarde : « Reviens. »"), ["Reviens."]);
  assert.deepEqual(repliquesPerdues("Elle part.\nMai :  « adieu ! »", "Mai : « Adieu ! »"), []);
});

// --- Author's instruction kept, text modified since (2026-11-10) ---

test("consigneAuteur : la phrase stockée, jusqu'à la fin de sa ligne ; null sans consigne", () => {
  assert.equal(consigneAuteur(ANCIEN), "Consigne de l'auteur : plan large d'abord.");
  assert.equal(consigneAuteur("Il frappe. Consigne de l'auteur : caméra basse."), "Consigne de l'auteur : caméra basse.");
  assert.equal(consigneAuteur("Mai entre."), null);
  assert.equal(consigneAuteur(null), null);
});

test("conserverConsigneAuteur : un texte réécrit sans consigne garde celle du plan ; avec la sienne, il la garde", () => {
  const actuelle = "Mai entre.\n\nConsigne de l'auteur : plan large d'abord.";
  assert.equal(conserverConsigneAuteur("Mai entre en courant.", actuelle), "Mai entre en courant.\n\nConsigne de l'auteur : plan large d'abord.");
  assert.equal(conserverConsigneAuteur("Mai entre.\nConsigne de l'auteur : caméra basse.", actuelle), "Mai entre.\nConsigne de l'auteur : caméra basse.");
  assert.equal(conserverConsigneAuteur("Mai entre en courant.", "Mai entre."), "Mai entre en courant.");
  assert.equal(conserverConsigneAuteur("Mai entre en courant.", null), "Mai entre en courant.");
});

test("memeDescription / intentionChangee : les blancs ne comptent pas ; sans valeur de départ, on ne sait pas", () => {
  assert.equal(memeDescription("Mai  entre.\r\n", "Mai entre."), true);
  assert.equal(memeDescription("Mai entre.", "Mai sort."), false);
  assert.equal(memeDescription(null, ""), true);
  assert.equal(intentionChangee("Mai sort.", "Mai entre."), true);
  assert.equal(intentionChangee("Mai entre.", "Mai  entre.\n"), false);
  assert.equal(intentionChangee("Mai sort.", null), false);
  assert.equal(intentionChangee("Mai sort.", undefined), false);
  assert.equal(intentionChangee(null, "Mai entre."), true);
});

test("descriptionSeraitPerdue : seulement quand le texte actuel n'est celui d'aucun essai", () => {
  // The current text is that of another attempt: restoring an old attempt loses nothing.
  assert.equal(descriptionSeraitPerdue("B", "A", ["A", "B"]), false);
  // Edited by hand since: no attempt carries it, it would be lost.
  assert.equal(descriptionSeraitPerdue("B retouché", "A", ["A", "B"]), true);
  // The same text as the attempt, an attempt without a recorded description, or an empty clip: nothing to lose.
  assert.equal(descriptionSeraitPerdue("A", "A", ["A"]), false);
  assert.equal(descriptionSeraitPerdue("B", null, ["A"]), false);
  assert.equal(descriptionSeraitPerdue("", "A", ["A"]), false);
  assert.equal(descriptionSeraitPerdue(null, "A", ["A"]), false);
});

test("normaliserGuillemetsRepliques : une réplique tapée avec \" devient « … », le reste n'est pas touché", () => {
  assert.equal(normaliserGuillemetsRepliques('MAYA : "On y va."'), "MAYA : « On y va. »");
  assert.equal(normaliserGuillemetsRepliques("MAYA: “On y va !”"), "MAYA : « On y va ! »");
  assert.equal(normaliserGuillemetsRepliques('Récit.\nTOM : "Non."\nMAYA : "Si."'), "Récit.\nTOM : « Non. »\nMAYA : « Si. »");
  assert.equal(normaliserGuillemetsRepliques("MAYA : « Déjà bon. »"), "MAYA : « Déjà bon. »");
  // Not a dialogue line: narrative with a quote, a line that continues after the quote, an empty quote.
  assert.equal(normaliserGuillemetsRepliques('Elle lit "Vingt mille lieues" en souriant.'), 'Elle lit "Vingt mille lieues" en souriant.');
  assert.equal(normaliserGuillemetsRepliques('MAYA : "Viens" et elle sort.'), 'MAYA : "Viens" et elle sort.');
  assert.equal(normaliserGuillemetsRepliques('MAYA : ""'), 'MAYA : ""');
  // The converted line is read as a dialogue line by the parsers.
  assert.deepEqual(repliquesPerdues("MAYA : « On y va. »", normaliserGuillemetsRepliques('MAYA : "On y va."')), []);
});
