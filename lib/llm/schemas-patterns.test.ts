import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill, listerSkills } from "./skills";

// llama.cpp converts the output schema into a grammar; it REFUSES a `pattern` that does not start with
// « ^ » and end with « $ » (« Pattern must start with '^' and end with '$' », HTTP 400). An
// error of this kind only shows up on the first real call: this test catches it beforehand.

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

// A « contains X » pattern (`^.*X.*$`) traps the grammar: `.` accepts the quote there, so the model that closes
// its string without having written X sees the `"` swallowed as content, and all the following JSON falls INTO the string,
// until `max_tokens` (observed with `{picture}` on Gemma and Qwen: 16,384 tokens, 5 minutes). A content rule
// is checked AFTER generation (semantic checks, lib/llm/checks.ts, with resend), never in the grammar.
test("schémas de sortie : aucun `pattern` « contient » (.* autour d'un littéral), piège de la grammaire", () => {
  for (const nom of listerSkills()) {
    for (const { chemin, motif } of patterns(chargerSkill(nom).schema)) {
      assert.ok(!/\.\*/.test(motif), `${nom} ${chemin} : « ${motif} » contient « .* » ; vérifier la règle dans les contrôles, pas dans le schéma`);
    }
  }
});
