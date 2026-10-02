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

test("plan-h3 : le motif du jeton {picture} accepte une définition correcte et refuse son absence", () => {
  const motif = (chargerSkill("plan-h3").schema as any).properties.sujets.items.properties.definition.pattern as string;
  assert.equal(new RegExp(motif).test("the corridor {picture}, dimly lit"), true);
  assert.equal(new RegExp(motif).test("the corridor, dimly lit"), false);
});
