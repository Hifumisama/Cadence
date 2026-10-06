import assert from "node:assert/strict";
import { test } from "node:test";
import { chargerSkill } from "../llm/skills";
import { compilerSchema } from "../llm/validation";

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
  const v = compilerSchema(chargerSkill("brief-projet").schema);
  return v(contenu) ? [] : (v.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

test("brief-projet : un brief complet (âge, apparence, rythme) est valide", () => {
  assert.deepEqual(erreurs(brief), []);
});

test("brief-projet : un personnage sans âge ni apparence est refusé", () => {
  const e = erreurs({ ...brief, personnages: [{ nom: "Iris", role: "gardienne", reconnaissable: "un collier" }] });
  assert.ok(e.some((x) => /age/.test(x)) && e.some((x) => /apparence/.test(x)), e.join(" | "));
});

test("brief-projet : le rythme est obligatoire et borné", () => {
  const { rythme: _r, ...sans } = brief;
  assert.ok(erreurs(sans).some((x) => /rythme/.test(x)));
  assert.ok(erreurs({ ...brief, rythme: "frénétique" }).length > 0);
});

test("brief-projet : l'univers est facultatif", () => {
  assert.deepEqual(erreurs({ ...brief, univers: "Une œuvre existante : on garde les noms et les apparences." }), []);
});
