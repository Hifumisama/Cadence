import assert from "node:assert/strict";
import { test } from "node:test";
import { compilerSchema } from "../llm/validation";
import { SCHEMA_BRIEF } from "./brief";

const brief = {
  titre: "T",
  source: "pitch",
  arc: "Un arc.",
  style: { nom: "Animation 2D", clause: "Hand-drawn 2D animation, flat colors, soft light." },
  langueDialogues: "Français",
  dureeEpisodeSecondes: 90,
  rythme: "soutenu",
  episodes: [{ titre: "E1", resume: "R" }],
  personnages: [{ nom: "Iris", role: "gardienne", age: "adolescente, 15 ans", apparence: "cheveux gris tressés, manteau vert", reconnaissable: "un collier de coquillages" }],
  lieux: [{ nom: "Le phare", description: "Tour blanche" }],
  continuite: [],
  rimes: [],
  progressions: [],
  pieges: [],
  inventions: [],
  questionsOuvertes: [],
};

function erreurs(contenu: unknown): string[] {
  const v = compilerSchema(SCHEMA_BRIEF);
  return v(contenu) ? [] : (v.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

test("brief : un brief complet (âge, apparence, rythme) est valide", () => {
  assert.deepEqual(erreurs(brief), []);
});

test("brief : un personnage sans âge ni apparence est refusé", () => {
  const e = erreurs({ ...brief, personnages: [{ nom: "Iris", role: "gardienne", reconnaissable: "un collier" }] });
  assert.ok(e.some((x) => /age/.test(x)) && e.some((x) => /apparence/.test(x)), e.join(" | "));
});

test("brief : le rythme est obligatoire et borné", () => {
  const { rythme: _r, ...sans } = brief;
  assert.ok(erreurs(sans).some((x) => /rythme/.test(x)));
  assert.ok(erreurs({ ...brief, rythme: "frénétique" }).length > 0);
});

test("brief : l'univers est facultatif", () => {
  assert.deepEqual(erreurs({ ...brief, univers: "Une œuvre existante : on garde les noms et les apparences." }), []);
});
