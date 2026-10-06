import assert from "node:assert/strict";
import { test } from "node:test";
import { depuisRegistreAsset } from "./conversion";
import { candidatsRegistre, cleSousTacheAsset, codeDeCleAsset, descriptionPersonnage, resumeCandidats, type AssetExistant } from "./registre";

const brief = {
  personnages: [
    { nom: "Maya", role: "danseuse-espionne", reconnaissable: "cheveux rouges, regard calme", statut: "fourni" },
    { nom: "Le Capitaine", role: "antagoniste", reconnaissable: "silhouette massive", statut: "deduit" },
    { nom: "maya", role: "doublon", reconnaissable: "même nom" },
    { nom: "  ", role: "sans nom", reconnaissable: "ignoré" },
  ],
  lieux: [{ nom: "Le phare de sel", description: "Tour blanche rongée par le sel", statut: "deduit" }],
};

const existant = (o: Partial<AssetExistant> & { code: string }): AssetExistant => ({
  id: 7,
  type: "personnage",
  description: "Déjà décrite",
  promptGeneration: null,
  statut: "a_produire",
  ...o,
});

test("candidatsRegistre : personnages puis lieux, codes construits, doublons et noms vides ignorés", () => {
  const c = candidatsRegistre(brief, []);
  assert.deepEqual(c.map((x) => x.code), ["CHAR_maya", "CHAR_le_capitaine", "DEC_le_phare_de_sel"]);
  assert.deepEqual(c.map((x) => x.type), ["personnage", "personnage", "decor"]);
  assert.equal(c[0]!.description, "danseuse-espionne : cheveux rouges, regard calme");
  assert.equal(c[2]!.description, "Tour blanche rongée par le sel");
  assert.equal(c[0]!.suffixe, "maya");
  assert.equal(c[0]!.libelle, "Personnage · Maya");
  assert.equal(c[2]!.libelle, "Décor · Le phare de sel");
  assert.ok(c.every((x) => x.existantId === null && x.aTraiter));
});

test("candidatsRegistre : un asset existant avec un prompt n'est pas coché d'office ; sans prompt, il l'est", () => {
  const c = candidatsRegistre(brief, [
    existant({ code: "CHAR_maya", id: 1, promptGeneration: "A woman with red hair." }),
    existant({ code: "CHAR_le_capitaine", id: 2, promptGeneration: "  ", description: "" }),
  ]);
  assert.equal(c[0]!.existantId, 1);
  assert.equal(c[0]!.aPrompt, true);
  assert.equal(c[0]!.aTraiter, false);
  assert.equal(c[1]!.existantId, 2);
  assert.equal(c[1]!.aPrompt, false);
  assert.equal(c[1]!.aDescription, false);
  assert.equal(c[1]!.aTraiter, true);
});

test("résumé d'une sélection : nouveaux, existants, prompts écrasés", () => {
  const c = candidatsRegistre(brief, [existant({ code: "CHAR_maya", id: 1, promptGeneration: "x" })]);
  const r = resumeCandidats(c, new Set(["CHAR_maya", "DEC_le_phare_de_sel"]));
  assert.deepEqual(r, { total: 3, choisis: 2, nouveaux: 1, existants: 1, ecrases: 1 });
});

test("clé de sous-tâche : aller-retour, et refus des autres clés", () => {
  assert.equal(codeDeCleAsset(cleSousTacheAsset("CHAR_maya")), "CHAR_maya");
  assert.equal(codeDeCleAsset("ep12"), null);
  assert.equal(codeDeCleAsset("asset:"), null);
  assert.equal(codeDeCleAsset(null), null);
});

const sortie = { methode: "generation" as const, raisonMethode: "Pas de parent.", promptGeneration: "A woman with red hair, calm gaze.", remarques: [{ type: "description-vague", message: "Peu de détails." }] };

test("depuisRegistreAsset : un asset absent donne UNE création portant description du brief et prompt", () => {
  const [c, ...reste] = depuisRegistreAsset(sortie, { code: "CHAR_maya", type: "personnage", suffixe: "maya", description: "  danseuse  ", existant: null });
  assert.equal(reste.length, 0);
  assert.equal(c!.operation, "creer");
  assert.equal(c!.cibleType, "asset");
  assert.equal(c!.cibleRef, null);
  assert.equal(c!.groupe, "assets");
  assert.deepEqual(c!.apres, { type: "personnage", suffixe: "maya", description: "danseuse", promptGeneration: sortie.promptGeneration, methodeGeneration: "generation", critique: false });
  assert.equal(c!.avertissements?.length, 1);
});

test("depuisRegistreAsset : un asset existant ne reçoit que son prompt ; la description du brief seulement s'il n'en a pas", () => {
  const courant = { id: 1, code: "CHAR_maya", type: "personnage", methodeGeneration: "generation", methodeApplicable: true };
  const [a] = depuisRegistreAsset(sortie, { code: "CHAR_maya", type: "personnage", suffixe: "maya", description: "du brief", existant: courant });
  assert.equal(a!.operation, "modifier");
  assert.equal(a!.cibleRef, "1");
  assert.deepEqual(a!.apres, { promptGeneration: sortie.promptGeneration });
  const [b] = depuisRegistreAsset(sortie, { code: "CHAR_maya", type: "personnage", suffixe: "maya", description: "du brief", existant: courant, descriptionVide: true });
  assert.deepEqual(b!.apres, { promptGeneration: sortie.promptGeneration, description: "du brief" });
});

test("descriptionPersonnage : ce qu'on voit (âge, apparence, trait), jamais le rôle ni la voix", () => {
  const d = descriptionPersonnage({
    nom: "Iris",
    role: "narratrice",
    age: "adolescente, 15 ans",
    apparence: "silhouette fine, cheveux longs tressés, tunique bleue",
    reconnaissable: "un collier de coquillages",
    voix: "calme et posée",
  });
  assert.equal(d, "adolescente, 15 ans. silhouette fine, cheveux longs tressés, tunique bleue. un collier de coquillages");
  assert.ok(!/narratrice|calme/.test(d));
});

test("descriptionPersonnage : un brief écrit avant les nouveaux champs garde « rôle : trait »", () => {
  assert.equal(descriptionPersonnage({ nom: "Maya", role: "danseuse-espionne", reconnaissable: "cheveux rouges" }), "danseuse-espionne : cheveux rouges");
  assert.equal(descriptionPersonnage({ nom: "Maya", role: "danseuse", reconnaissable: "cheveux rouges", age: "30 ans" }), "30 ans. danseuse : cheveux rouges");
});

test("candidatsRegistre : la description d'un personnage vient de son apparence", () => {
  const c = candidatsRegistre({ personnages: [{ nom: "Iris", role: "narratrice", age: "15 ans", apparence: "cheveux tressés", reconnaissable: "un collier" }], lieux: [] }, []);
  assert.equal(c[0]!.description, "15 ans. cheveux tressés. un collier");
});
