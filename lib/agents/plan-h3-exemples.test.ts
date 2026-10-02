import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { valider } from "../llm/validation";
import { chargerSkill } from "../llm/skills";
import { assemblerPlanH3 } from "./plan-h3-assemblage";
import { controlerSortiePlanH3, type SortiePlanH3 } from "./plan-h3-controles";

// Les exemples du skill (agents/skills/plan-h3/exemples/*.md) montrent le brouillon que le modèle doit rendre.
// Ce test garantit qu'ils restent rendables : conformes au schéma, sans erreur de contrat, et qu'ils s'assemblent
// en un prompt final identique à la fixture (lib/agents/fixtures/plan-h3/<nom>.txt), elle-même dérivée du plan
// validé en production (aux « Hard cut to » près, que le code pose). `REGENERER_FIXTURES=1` réécrit les fixtures.

const DOSSIER = join("agents", "skills", "plan-h3", "exemples");
const FIXTURES = join("lib", "agents", "fixtures", "plan-h3");

function brouillon(nom: string): SortiePlanH3 {
  const md = readFileSync(join(DOSSIER, nom), "utf-8");
  const m = /```json\r?\n([\s\S]*?)\r?\n```/.exec(md);
  assert.ok(m, `${nom} : bloc json introuvable`);
  return JSON.parse(m![1]!) as SortiePlanH3;
}

const typeParPrefixe = (code: string) => (code.startsWith("SFX_") ? "sfx" : code.startsWith("CHAR_") ? "personnage" : "decor");
const repliquesDe = (b: SortiePlanH3) =>
  b.shots.flatMap((s) => [...s.texte.matchAll(/<d>\[[^\]]+\]\s*([\s\S]*?)<\/d>/g)].map((m) => ({ texte: m[1]!.trim() })));

for (const nom of readdirSync(DOSSIER).filter((n) => n.endsWith(".md"))) {
  test(`exemple ${nom} : conforme au schéma, sans erreur de contrat, assemblé comme la fixture`, () => {
    const b = brouillon(nom);
    const v = valider(chargerSkill("plan-h3").schema, b);
    assert.ok(v.ok, v.ok ? "" : v.erreurs.join(" ; "));

    const repliques = repliquesDe(b);
    const problemes = controlerSortiePlanH3(b, { registre: b.references.map((r) => ({ code: r.asset, type: typeParPrefixe(r.asset) })), repliques });
    assert.deepEqual(problemes.filter((p) => p.niveau === "erreur" || p.niveau === "alerte"), []);

    const a = assemblerPlanH3(b, { slotsAudioPris: repliques.map((_, i) => i + 1) });
    assert.deepEqual(a.problemes, []);
    const fichier = join(FIXTURES, nom.replace(/\.md$/, ".txt"));
    if (process.env.REGENERER_FIXTURES) {
      mkdirSync(FIXTURES, { recursive: true });
      writeFileSync(fichier, a.texte + "\n", "utf-8");
    }
    assert.ok(existsSync(fichier), `${fichier} manquant (REGENERER_FIXTURES=1 pour l'écrire)`);
    // Fins de ligne normalisées : git peut remettre du CRLF à l'extraction (core.autocrlf).
    assert.equal(a.texte + "\n", readFileSync(fichier, "utf-8").replace(/\r\n/g, "\n"));
  });
}
