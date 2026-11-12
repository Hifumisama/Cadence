import assert from "node:assert/strict";
import { test } from "node:test";
import { briefVide, clauseDuBrief, notesDuBrief } from "./brief";
import { type BriefContenu } from "./types";
import { depuisSaisie, typeEdition, versSaisie } from "./agents-display";

// Le brief est la source unique de la clause de style et des notes (2026-10-02) :
// un brief « partiel » (posé à la main) porte le style et les notes sans brief rédigé.

test("briefVide : forme complète sans rien d'inventé, exploitable par les consommateurs", () => {
  const b = briefVide("  Le Phare  ");
  assert.equal(b.titre, "Le Phare");
  assert.deepEqual([b.episodes, b.personnages, b.lieux, b.inventions], [[], [], [], []]);
  assert.equal(clauseDuBrief(b), "");
  assert.equal(notesDuBrief(b), "");
  assert.equal(briefVide("").titre, "Projet");
});

test("édition : le style a deux champs, les notes un texte libre qui peut être vide", () => {
  assert.equal(typeEdition("style"), "style");
  assert.equal(typeEdition("notes"), "libre");
  const saisie = versSaisie("style", { nom: "2D", clause: "Flat." });
  assert.deepEqual(depuisSaisie("style", saisie), { ok: true, valeur: { nom: "2D", clause: "Flat." } });
  assert.deepEqual(depuisSaisie("notes", "  "), { ok: true, valeur: "" });
  assert.equal(depuisSaisie("style", "pas du json").ok, false);
});

// --- un seul chemin d'écriture ----------------------------------------------

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function sources(dossier: string, sortie: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    if (nom === "node_modules" || nom === ".next" || nom.startsWith(".")) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sources(chemin, sortie);
    else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.ts$/.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

test("clause de style et notes du projet : le SEUL écrivain est brief-db.ts (synchroniserClauseStyle)", () => {
  const fautifs: string[] = [];
  for (const dossier of ["app", "lib", "worker", "components", "scripts"]) {
    for (const f of sources(dossier)) {
      const chemin = f.split("\\").join("/");
      if (chemin === "lib/agents/brief-db.ts") continue;
      const code = readFileSync(f, "utf-8");
      // `.update(projects).set({ … clauseStyle | notes … })` : un écrivain direct.
      for (const m of code.matchAll(/\.update\(\s*projects\s*\)\s*\.set\(\s*\{([^}]*)\}/g)) {
        if (/\b(clauseStyle|notes)\b/.test(m[1]!)) fautifs.push(chemin);
      }
      if (/\.set\(\s*\{\s*\[\s*cle\s*\]/.test(code) && /projects/.test(code) && /clauseStyle/.test(code)) fautifs.push(chemin);
    }
  }
  assert.deepEqual(fautifs, [], "écriture directe de projects.clause_style / notes hors de brief-db.ts");
});

import { retablirStyleDuCode } from "./brief";

const briefAvecStyle = (style: Record<string, unknown>) => ({ ...briefVide("Test"), style }) as unknown as BriefContenu;
const styleDe = (c: BriefContenu) => (c as unknown as { style: Record<string, unknown> }).style;

test("retablirStyleDuCode : le prompt long et l'aperçu reviennent quand la clause est la même", () => {
  const nouveau = briefAvecStyle({ nom: "Bruce Timm Noir", clause: "A noir look." });
  const r = retablirStyleDuCode(nouveau, { clause: "A noir look. ", promptImage: "long prompt", image: "bruce-timm-noir/affiche.webp" });
  assert.equal(styleDe(r).promptImage, "long prompt");
  assert.equal(styleDe(r).image, "bruce-timm-noir/affiche.webp");
  assert.equal(styleDe(r).nom, "Bruce Timm Noir");
});

test("retablirStyleDuCode : un style vraiment changé ne reprend rien", () => {
  const nouveau = briefAvecStyle({ nom: "Autre", clause: "Another look." });
  assert.equal(retablirStyleDuCode(nouveau, { clause: "A noir look.", promptImage: "long prompt" }), nouveau);
});

test("retablirStyleDuCode : ce que le nouveau style porte déjà n'est pas écrasé", () => {
  const nouveau = briefAvecStyle({ nom: "X", clause: "Same.", promptImage: "mon prompt", image: "a.webp" });
  assert.equal(retablirStyleDuCode(nouveau, { clause: "Same.", promptImage: "autre", image: "b.webp" }), nouveau);
});

test("retablirStyleDuCode : sans précédent, rien ne bouge", () => {
  const nouveau = briefAvecStyle({ nom: "X", clause: "Same." });
  assert.equal(retablirStyleDuCode(nouveau, null), nouveau);
});
