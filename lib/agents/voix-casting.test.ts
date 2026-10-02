import assert from "node:assert/strict";
import { test } from "node:test";
import { depuisCastingVoix } from "./conversion";
import { candidatsVoix, cleSousTacheVoix, codeDeCleVoix, resumeCandidatsVoix } from "./voix-casting";

const maya = { id: 1, code: "CHAR_maya", description: "Danseuse" };
const tenanciere = { id: 2, code: "CHAR_tenanciere", description: "Patronne" };
const muet = { id: 3, code: "CHAR_muet", description: "Ne dit rien" };
const rep = (locuteurId: number | null, texte: string, locuteurTexte = "", voixId: number | null = null) => ({ locuteurId, voixId, locuteurTexte, texte });

test("clés de sous-tâche : aller-retour", () => {
  assert.equal(cleSousTacheVoix("CHAR_maya"), "voix:CHAR_maya");
  assert.equal(codeDeCleVoix("voix:CHAR_maya"), "CHAR_maya");
  assert.equal(codeDeCleVoix("asset:CHAR_maya"), null);
  assert.equal(codeDeCleVoix("voix:"), null);
});

test("un personnage qui parle sans voix donne un candidat ; un personnage muet, non", () => {
  const c = candidatsVoix([maya, tenanciere, muet], [], [], [rep(1, "Bonsoir."), rep(1, "Encore du sel."), rep(2, "Demain.")]);
  assert.deepEqual(c.map((x) => [x.codeVoix, x.personnageCode, x.nbRepliques, x.aTraiter]), [["VOICE_maya", "CHAR_maya", 2, true], ["VOICE_tenanciere", "CHAR_tenanciere", 1, true]]);
  assert.equal(c[0]!.cle, "voix:CHAR_maya");
  assert.deepEqual(c[0]!.exemples, ["Bonsoir.", "Encore du sel."]);
});

test("un personnage qui a déjà une voix n'est pas un candidat", () => {
  const c = candidatsVoix([maya, tenanciere], [{ assetCode: "VOICE_maya", personnageId: 1 }], [{ id: 10, code: "VOICE_maya" }], [rep(1, "Bonsoir."), rep(2, "Demain.")]);
  assert.deepEqual(c.map((x) => x.codeVoix), ["VOICE_tenanciere"]);
});

test("code de voix déjà pris sans être rattaché : candidat bloqué, non coché", () => {
  const [c] = candidatsVoix([maya], [], [{ id: 10, code: "VOICE_maya" }], [rep(1, "Bonsoir.")]);
  assert.ok(c!.bloque?.includes("VOICE_maya"));
  assert.equal(c!.aTraiter, false);
});

test("voix off : candidat quand des répliques la réclament et qu'aucune voix « off » n'existe", () => {
  const off = [rep(null, "La nuit tombe.", "Voix off"), rep(null, "Elle court.", "voix off")];
  const [c] = candidatsVoix([maya], [], [], off);
  assert.deepEqual([c!.codeVoix, c!.personnageCode, c!.personnageId, c!.nbRepliques, c!.cle], ["VOICE_off", null, null, 2, "voix:off"]);
  assert.equal(candidatsVoix([maya], [], [{ id: 11, code: "VOICE_off" }], off).length, 0, "une voix off existe déjà");
  assert.equal(candidatsVoix([maya], [], [], [rep(null, "Salut", "Le capitaine")]).length, 0, "un locuteur libre n'est pas la voix off");
});

test("au plus 6 répliques d'exemple, mais toutes comptées", () => {
  const [c] = candidatsVoix([maya], [], [], Array.from({ length: 9 }, (_, i) => rep(1, `Réplique ${i}.`)));
  assert.equal(c!.nbRepliques, 9);
  assert.equal(c!.exemples.length, 6);
});

test("répliques écrites avant le registre (locuteur en simple texte) : rapprochées du personnage", () => {
  const narratrice = { id: 4, code: "CHAR_la_narratrice", description: "" };
  const frere = { id: 5, code: "CHAR_le_frere", description: "" };
  const c = candidatsVoix(
    [narratrice, frere, maya],
    [{ assetCode: "VOICE_narratrice", personnageId: 4 }],
    [{ id: 20, code: "VOICE_narratrice" }],
    [rep(null, "Il était une fois.", "La Narratrice"), rep(null, "Va-t-en.", "Le Frère"), rep(null, "Salut", "Le capitaine")],
  );
  assert.deepEqual(c.map((x) => [x.codeVoix, x.nbRepliques]), [["VOICE_le_frere", 1]]);
});

test("résumé de sélection", () => {
  const c = candidatsVoix([maya, tenanciere], [], [], [rep(1, "a"), rep(1, "b"), rep(2, "c")]);
  assert.deepEqual(resumeCandidatsVoix(c, new Set(["voix:CHAR_maya"])), { total: 2, choisis: 1, repliques: 2 });
});

test("depuisCastingVoix : une création de voix rattachée à son personnage, avec l'instruction et les remarques", () => {
  const [ch, ...reste] = depuisCastingVoix(
    { instruction: "  A calm native French speaker…  ", remarques: [{ type: "pas-de-contrainte", message: "Aucune contrainte physique trouvée." }] },
    { codeVoix: "VOICE_maya", suffixe: "maya", personnageId: 1, personnageCode: "CHAR_maya", description: " Danseuse " },
  );
  assert.equal(reste.length, 0);
  assert.equal(ch!.cibleType, "voix");
  assert.equal(ch!.operation, "creer");
  assert.equal(ch!.groupe, "voix");
  assert.deepEqual(ch!.apres, { suffixe: "maya", personnageId: 1, description: "Danseuse", instruction: "A calm native French speaker…" });
  assert.equal(ch!.avertissements?.length, 1);
});
