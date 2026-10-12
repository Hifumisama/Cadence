import assert from "node:assert/strict";
import { test } from "node:test";
import { compilerSchema } from "../llm/validation";
import { CLES_ABANDONNEES, SCHEMA_BRIEF, construireSections, diffSections, estCleSection, sansClesAbandonnees, sortieVersBrief } from "./brief";
import { FICHE_VIDE, briefVersFiche, lireFiche } from "./fiche";
import type { BriefContenu } from "./types";

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

// --- Les « Contraintes » (continuite, rimes, progressions, pieges) ont été supprimées du brief le 2026-10-12, sans migration : un brief
// déjà stocké qui les porte encore doit être lu sans erreur, ces clés étant simplement ignorées.
const ancien = {
  ...brief,
  continuite: ["Le manteau vert ne change jamais."],
  rimes: [{ description: "L'ouverture répond à la fin.", souligner: true }],
  progressions: [{ quoi: "La lumière", evolution: "de plus en plus chaude" }],
  pieges: [{ cliche: "le mentor qui meurt", formulationPositive: "le mentor reste" }],
};

test("brief ancien : le schéma strict refuse les clés abandonnées, la lecture les retire", () => {
  assert.ok(erreurs(ancien).length > 0, "le schéma n'a plus ces sections");
  const lu = sansClesAbandonnees(ancien);
  assert.deepEqual(erreurs(lu), [], "lu sans erreur une fois les clés abandonnées retirées");
  for (const cle of CLES_ABANDONNEES) assert.ok(!(cle in lu), cle);
  assert.equal(lu.titre, "T");
  assert.ok("continuite" in ancien, "l'original n'est pas modifié");
});

test("brief ancien : les sections affichées et comparées ignorent les clés abandonnées", () => {
  const cles = construireSections(ancien as unknown as BriefContenu, {}).map((s) => s.cle) as string[];
  for (const cle of CLES_ABANDONNEES) assert.ok(!cles.includes(cle), cle);
  assert.ok(!diffSections(null, ancien as unknown as BriefContenu).some((d) => (CLES_ABANDONNEES as readonly string[]).includes(d.cle)));
  assert.ok(!estCleSection("pieges") && !estCleSection("continuite"), "plus modifiables à la main");
  const { contenu } = sortieVersBrief({ ...ancien, statuts: { arc: "fourni", pieges: "fourni" } });
  assert.ok(!("pieges" in contenu), "la sortie d'un agent qui les porte encore ne les stocke pas");
});

test("fiche ancienne : lue sans les clés abandonnées (ni leur contenu ni leur statut)", () => {
  const f = lireFiche({ contenu: { arc: "A", continuite: ["x"], rimes: [{ description: "d", souligner: false }] }, statuts: { arc: "fourni", continuite: "deduit", rimes: "fourni" } });
  assert.deepEqual(f, { contenu: { arc: "A" }, statuts: { arc: "fourni" } });
  const g = briefVersFiche({ contenu: { arc: "A", pieges: [{ cliche: "c", formulationPositive: "f" }] }, statuts: { arc: "fourni", pieges: "fourni" } }, FICHE_VIDE);
  assert.deepEqual(g, { contenu: { arc: "A" }, statuts: { arc: "fourni" } });
});
