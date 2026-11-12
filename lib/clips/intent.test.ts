import assert from "node:assert/strict";
import { test } from "node:test";
import { aUnEtatDeFin, conserverConsigneAuteur, consigneAuteur, descriptionSeraitPerdue, intentAffichee, intentionChangee, memeDescription, raisonDescriptionIncomplete, recitDe, repliquesPerdues, sansConsigneAuteur, sansEtatDeFin } from "./intent";

// Un plan écrit avant le 2026-11-08 : récit, répliques, consigne de l'auteur, puis l'ancien « État en fin de plan ».
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
  // en fin de paragraphe, sans retour à la ligne
  assert.equal(sansEtatDeFin("Il frappe. État en fin de plan : debout."), "Il frappe.");
  assert.equal(sansEtatDeFin("Il frappe.\nEtat en fin de plan : debout."), "Il frappe.");
  // rien à retirer
  assert.equal(sansEtatDeFin("Elle part.\nMai : « Adieu. »"), "Elle part.\nMai : « Adieu. »");
  assert.equal(sansEtatDeFin(null), "");
  assert.ok(aUnEtatDeFin(ANCIEN));
  assert.ok(!aUnEtatDeFin("Elle part."));
});

test("intentAffichee : masque la consigne de l'auteur et l'ancien état de fin, garde le récit et les répliques", () => {
  assert.equal(intentAffichee(ANCIEN), "Mai entre dans la salle et regarde le garde.\n\nMai : « Tu es sûr ? »");
  // une consigne en fin de paragraphe du récit
  assert.equal(sansConsigneAuteur("Mai se lève. Consigne de l'auteur : gros plan sur ses mains.\nMai : « Allons-y. »"), "Mai se lève.\nMai : « Allons-y. »");
  assert.equal(intentAffichee(""), "");
});

test("recitDe : ni répliques, ni consigne, ni état de fin", () => {
  assert.equal(recitDe(ANCIEN), "Mai entre dans la salle et regarde le garde.");
  assert.equal(recitDe("Mai : « Tu es sûr ? »\nGarde : « Oui. »"), "");
  // une citation dans le récit n'est pas une ligne de réplique
  assert.equal(recitDe("Elle murmure « non » et recule."), "Elle murmure « non » et recule.");
});

test("raisonDescriptionIncomplete : un fragment ou une phrase d'état seule est refusé ; une description complète retouchée passe", () => {
  const actuelle = "Mai, assise à gauche du feu, frotte deux pierres ; une étincelle jaillit, les brindilles s'embrasent. Elle souffle, les flammes montent et éclairent son visage.\nMai : « Enfin. »";
  assert.match(raisonDescriptionIncomplete("État en fin de plan : Mai assise à gauche du feu, les mains tendues ; le feu brûle haut.", actuelle) ?? "", /plus de récit/);
  assert.match(raisonDescriptionIncomplete("Mai : « Enfin. »", actuelle) ?? "", /plus de récit/);
  assert.match(raisonDescriptionIncomplete("Mai se lève.", actuelle) ?? "", /presque rien/);
  assert.equal(raisonDescriptionIncomplete(actuelle.replace("Elle souffle", "Elle souffle doucement"), actuelle), null);
  // une réécriture peut simplifier, tant qu'elle garde du récit
  assert.equal(raisonDescriptionIncomplete("Mai, assise à gauche du feu, frotte deux pierres sans succès.", actuelle, { reecriture: true }), null);
  // sans description actuelle : seule l'absence de récit compte
  assert.equal(raisonDescriptionIncomplete("Mai se lève.", ""), null);
});

test("repliquesPerdues : les répliques de l'actuelle absentes de la nouvelle", () => {
  assert.deepEqual(repliquesPerdues("Elle part.\nMai : « Adieu ! »", "Elle part.\nMai : « Adieu ! »\nGarde : « Reviens. »"), ["Reviens."]);
  assert.deepEqual(repliquesPerdues("Elle part.\nMai :  « adieu ! »", "Mai : « Adieu ! »"), []);
});

// --- Consigne de l'auteur conservée, texte modifié depuis (2026-11-10) ---

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
  // Le texte actuel est celui d'un autre essai : restaurer un ancien essai ne perd rien.
  assert.equal(descriptionSeraitPerdue("B", "A", ["A", "B"]), false);
  // Modifié à la main depuis : aucun essai ne le porte, il serait perdu.
  assert.equal(descriptionSeraitPerdue("B retouché", "A", ["A", "B"]), true);
  // Le même texte que l'essai, un essai sans description enregistrée, ou un plan vide : rien à perdre.
  assert.equal(descriptionSeraitPerdue("A", "A", ["A"]), false);
  assert.equal(descriptionSeraitPerdue("B", null, ["A"]), false);
  assert.equal(descriptionSeraitPerdue("", "A", ["A"]), false);
  assert.equal(descriptionSeraitPerdue(null, "A", ["A"]), false);
});
