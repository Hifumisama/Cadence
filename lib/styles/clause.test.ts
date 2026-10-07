import { test } from "node:test";
import assert from "node:assert/strict";
import { controlerClause, motsCapitalisesInternes } from "./clause";
import { bibliothequeStyles } from "./bibliotheque";

const style = {
  nom: "Van Gogh Style",
  descriptor: "A turbulent post-impressionist painting style built on thick impasto. Influenced by: Vincent van Gogh, post-impressionist painting tradition, Studio Ghibli production technique.",
};

test("motsCapitalisesInternes : ignore le premier mot de chaque phrase, garde les noms propres", () => {
  assert.deepEqual(motsCapitalisesInternes(style.descriptor), ["Vincent", "Gogh", "Studio", "Ghibli"]);
  assert.deepEqual(motsCapitalisesInternes("A soft look. Another sentence about Paris."), ["Paris"]);
});

const BONNE = "A post-impressionist oil-painting look: thick directional impasto strokes swirling across every surface, saturated cobalt contrasts and heavy dark outlines.";

test("controlerClause : une bonne clause passe", () => {
  assert.deepEqual(controlerClause(BONNE, style), []);
});

test("controlerClause : longueur, phrases, nom propre, sujet et cadrage sont refusés", () => {
  assert.match(controlerClause("A soft look.", style).join(" "), /mots/);
  assert.match(controlerClause(`${BONNE.replace(".", "")}. Une. Deux. Trois seulement ici pour dépasser le nombre de phrases permis.`, style).join(" "), /phrases|mots/);
  assert.match(controlerClause(BONNE.replace("thick", "Van Gogh thick"), style).join(" "), /Nom propre.*Gogh/);
  assert.match(controlerClause(BONNE.replace("heavy dark outlines", "a woman with a face"), style).join(" "), /sujet|cadrage/);
  assert.match(controlerClause(BONNE.replace("swirling", "sweeping camera movement"), style).join(" "), /cadrage|mouvement/);
});

test("controlerClause : un mouvement artistique à majuscule initiale n'est pas un nom propre de la liste", () => {
  assert.deepEqual(controlerClause(BONNE.replace("A post-impressionist", "An Art Nouveau-inspired"), { nom: "X", descriptor: "A style. Influenced by: Alphonse Mucha." }), []);
});

test("les clauses produites (clauses.json) respectent le contrôle et correspondent à des styles de la bibliothèque", () => {
  for (const s of bibliothequeStyles()) if (s.clause) assert.deepEqual(controlerClause(s.clause, s), [], s.id);
});
