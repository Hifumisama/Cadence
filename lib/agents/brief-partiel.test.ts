import assert from "node:assert/strict";
import { test } from "node:test";
import { avecSection, briefVide, clauseDuBrief, construireSections, fusionnerPartielDansBrouillon, notesDuBrief, residuPartiel } from "./brief";
import { SECTIONS_BRIEF, type BriefContenu, type StatutChamp } from "./types";
import { depuisSaisie, typeEdition, versSaisie } from "../agents-affichage";

// Le brief est la source unique de la clause de style et des notes (2026-10-02) :
// un brief « partiel » (posé à la main) porte le style et les notes sans brief rédigé.

test("briefVide : forme complète sans rien d'inventé, exploitable par les consommateurs", () => {
  const b = briefVide("  Le Phare  ");
  assert.equal(b.titre, "Le Phare");
  assert.deepEqual([b.episodes, b.personnages, b.lieux, b.pieges, b.inventions], [[], [], [], [], []]);
  assert.equal(clauseDuBrief(b), "");
  assert.equal(notesDuBrief(b), "");
  assert.equal(briefVide("").titre, "Projet");
});

test("clauseDuBrief / notesDuBrief : trim, tolèrent l'absence", () => {
  assert.equal(clauseDuBrief(avecSection(briefVide("x"), "style", { nom: "2D", clause: "  Flat 2D.  " })), "Flat 2D.");
  assert.equal(clauseDuBrief(null), "");
  assert.equal(notesDuBrief(avecSection(briefVide("x"), "notes", "  rappel  ")), "rappel");
  assert.equal(notesDuBrief({} as BriefContenu), "");
});

test("sections d'un brief partiel : style et notes toujours là, le reste seulement s'il est « fourni »", () => {
  const vide = construireSections(briefVide("x"), {}, "partiel");
  assert.deepEqual(vide.map((s) => s.cle), ["style", "notes"]);
  assert.deepEqual(vide.map((s) => s.statut), ["a_valider", "a_valider"], "rien posé : à remplir, jamais « déduit »");
  const avec = construireSections(avecSection(briefVide("x"), "arc", "Une île."), { arc: "fourni" }, "partiel");
  assert.deepEqual(avec.map((s) => s.cle), ["arc", "style", "notes"]);
  // Un brief rédigé montre tout ce qui est défini.
  assert.ok(construireSections(briefVide("x"), {}, "valide").length > 10);
  assert.ok(SECTIONS_BRIEF.some((s) => s.cle === "notes"), "notes est une section du brief");
});

const complet = (clause: string): { contenu: BriefContenu; statuts: Record<string, StatutChamp> } => ({
  contenu: { ...briefVide("Rédigé"), arc: "L'arc de l'agent", style: { nom: "agent", clause } },
  statuts: { arc: "deduit", style: "deduit" },
});

test("brouillon de l'agent sur un brief partiel : ce que l'utilisateur a posé gagne", () => {
  const partiel = { contenu: avecSection(avecSection(briefVide("P"), "style", { nom: "", clause: "Ma clause." }), "notes", "Mes notes"), statuts: { style: "fourni", notes: "fourni" } as Record<string, StatutChamp> };
  const r = fusionnerPartielDansBrouillon(complet("Clause de l'agent."), partiel);
  assert.equal(clauseDuBrief(r.contenu), "Ma clause.");
  assert.equal(notesDuBrief(r.contenu), "Mes notes");
  assert.equal(r.statuts.style, "fourni");
  assert.equal((r.contenu as unknown as { arc: string }).arc, "L'arc de l'agent", "le reste vient de l'agent");
  assert.equal(r.statuts.arc, "deduit");
  // Une section du partiel qui n'est pas « fourni » ne l'emporte pas.
  const faux = fusionnerPartielDansBrouillon(complet("Clause de l'agent."), { contenu: partiel.contenu, statuts: { style: "deduit" } });
  assert.equal(clauseDuBrief(faux.contenu), "Clause de l'agent.");
});

test("brouillon abandonné : seuls la clause et les notes DU PROJET reviennent en brief partiel, sinon rien", () => {
  const brouillon = complet("Clause de l'agent.");
  assert.equal(residuPartiel(brouillon, { titre: "P", clauseStyle: "", notes: "" }), null, "rien dans le projet : le brouillon se supprime");
  const r = residuPartiel(brouillon, { titre: "P", clauseStyle: "Ma clause.", notes: " Mes notes " })!;
  assert.equal(clauseDuBrief(r.contenu), "Ma clause.", "la clause vient du projet, pas du brouillon de l'agent");
  assert.equal(notesDuBrief(r.contenu), "Mes notes");
  assert.deepEqual(r.statuts, { style: "fourni", notes: "fourni" });
  assert.equal((r.contenu as unknown as { arc: string }).arc, "", "ce que l'agent avait rédigé disparaît");
  assert.equal((r.contenu as unknown as { style: { nom: string } }).style.nom, "", "nom du style inconnu : vide");
  // Même clause dans le brouillon : on garde le nom du style.
  const meme = residuPartiel(complet("Ma clause."), { titre: "P", clauseStyle: "Ma clause.", notes: "" })!;
  assert.equal((meme.contenu as unknown as { style: { nom: string } }).style.nom, "agent");
  assert.deepEqual(meme.statuts, { style: "fourni" });
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
      if (chemin === "lib/agents/brief-db.ts" || chemin.startsWith("scripts/agents-e2e")) continue;
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
