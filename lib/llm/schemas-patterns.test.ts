import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill, listerSkills } from "./skills";

// llama.cpp convertit le schéma de sortie en grammaire ; il REFUSE un `pattern` qui ne commence pas par
// « ^ » et ne finit pas par « $ » (« Pattern must start with '^' and end with '$' », HTTP 400). Une
// erreur de ce genre ne se voit qu'au premier appel réel : ce test la rattrape avant.

function patterns(noeud: unknown, chemin = "$"): { chemin: string; motif: string }[] {
  if (Array.isArray(noeud)) return noeud.flatMap((x, i) => patterns(x, `${chemin}[${i}]`));
  if (noeud && typeof noeud === "object") {
    return Object.entries(noeud as Record<string, unknown>).flatMap(([k, v]) =>
      k === "pattern" && typeof v === "string" ? [{ chemin, motif: v }] : patterns(v, `${chemin}.${k}`),
    );
  }
  return [];
}

test("schémas de sortie : tout `pattern` est ancré (^…$), exigence de la grammaire llama.cpp", () => {
  for (const nom of listerSkills()) {
    for (const { chemin, motif } of patterns(chargerSkill(nom).schema)) {
      assert.ok(motif.startsWith("^") && motif.endsWith("$"), `${nom} ${chemin} : « ${motif} » doit commencer par ^ et finir par $`);
    }
  }
});

// Un motif « contient X » (`^.*X.*$`) piège la grammaire : `.` y accepte le guillemet, donc le modèle qui ferme
// sa chaîne sans avoir écrit X voit le `"` avalé comme contenu, et tout le JSON suivant tombe DANS la chaîne,
// jusqu'à `max_tokens` (observé avec `{picture}` sur Gemma et Qwen : 16 384 jetons, 5 minutes). Une règle de
// contenu se vérifie APRÈS génération (lib/agents/plan-h3-controles.ts, avec renvoi), jamais dans la grammaire.
test("schémas de sortie : aucun `pattern` « contient » (.* autour d'un littéral), piège de la grammaire", () => {
  for (const nom of listerSkills()) {
    for (const { chemin, motif } of patterns(chargerSkill(nom).schema)) {
      assert.ok(!/\.\*/.test(motif), `${nom} ${chemin} : « ${motif} » contient « .* » ; vérifier la règle dans les contrôles, pas dans le schéma`);
    }
  }
});

test("plan-h3 : aucun jeton ni motif dans le schéma ; les labels sont posés par le code, le modèle n'en écrit pas", () => {
  const schema = chargerSkill("plan-h3").schema as any;
  assert.deepEqual(patterns(schema), []);
  assert.equal(schema.properties.references.items.properties.definition.pattern, undefined);
  assert.doesNotMatch(JSON.stringify(schema), /\{picture\}/);
});
