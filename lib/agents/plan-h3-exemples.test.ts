import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { valider } from "../llm/validation";
import { chargerSkill } from "../llm/skills";
import { PREFIXE_PAR_TYPE } from "../assetCode";
import { assemblerPlanH3 } from "./plan-h3-assemblage";
import { controlerSortiePlanH3, type SortiePlanH3 } from "./plan-h3-controles";

// Les exemples du skill (agents/skills/plan-h3/references/exemples/*.md) montrent le brouillon que le modèle doit rendre.
// Ce test garantit qu'ils restent rendables : conformes au schéma, sans erreur de contrat, et qu'ils s'assemblent
// en un prompt final identique à la fixture (lib/agents/fixtures/plan-h3/<nom>.txt), elle-même dérivée du plan
// validé en production (aux « Hard cut to » près, que le code pose). `REGENERER_FIXTURES=1` réécrit les fixtures.

const DOSSIER = join("agents", "skills", "plan-h3", "references", "exemples");
const FIXTURES = join("lib", "agents", "fixtures", "plan-h3");

function brouillon(nom: string): SortiePlanH3 {
  const md = readFileSync(join(DOSSIER, nom), "utf-8");
  const m = /```json\r?\n([\s\S]*?)\r?\n```/.exec(md);
  assert.ok(m, `${nom} : bloc json introuvable`);
  return JSON.parse(m![1]!) as SortiePlanH3;
}

const typeParPrefixe = (code: string) => (code.startsWith("SFX_") ? "sfx" : code.startsWith("CHAR_") ? "personnage" : "decor");

// Les exemples sont recopiés par le petit modèle : ils passent les mêmes contrôles que sa sortie (audit des skills, 2026-10-12).
const ACTION = /\b(run(ning)?|lung(e|ing)|advanc(e|ing)|walk(ing)?|stopp?(ing)|catch(ing)|reel(ing)|strik(e|ing)|stagger(ing)?|turn(ing)?|drift(ing)?|leap(ing)?|jump(ing)?|fall(ing)?|flee(ing)?|until|then)\b/i;
const NEGATION = /\b(no|not|never|without|none|nor)\b|n't\b/i;
const HUMEUR = /\b(tense|tension|ominous|menacing|threat|contempt|anxious|dread|mournful|hopeful|sad|joyful|eerie|panic\w*|fear\w*)\b/i;
const PAROLE = /\b(says|said|sentence|mid-word|mid-syllable|speaks|whispers)\b/i;
const PREFIXES = Object.values(PREFIXE_PAR_TYPE);

test("exemples : mêmes règles que la sortie (definition sans action ni négation, musique, préfixes, voix)", () => {
  for (const nom of readdirSync(DOSSIER).filter((n) => n.endsWith(".md"))) {
    const b = brouillon(nom);
    for (const r of b.references) {
      assert.ok(PREFIXES.some((p) => r.asset.startsWith(p)), `${nom} : préfixe d'asset inconnu (${r.asset})`);
      assert.ok(!ACTION.test(r.definition), `${nom} : verbe d'action dans la definition de ${r.asset} (« ${r.definition} »)`);
      assert.ok(!NEGATION.test(r.definition), `${nom} : négation dans la definition de ${r.asset}`);
    }
    const musique = b.non_diegetic_music.trim();
    assert.ok(!/^n\/a/i.test(musique) || musique === "N/A", `${nom} : « N/A » doit être seul (« ${musique} »)`);
    assert.ok(!HUMEUR.test(musique), `${nom} : mot d'humeur dans la musique (« ${musique} »)`);
    for (const [i, s] of b.shots.entries()) {
      const dit = /<d>/i.test(s.texte);
      if (dit) assert.match(s.texte, /\(S\d\)/, `${nom} : shot ${i + 1} a un <d> sans (Sx)`);
      else assert.ok(!PAROLE.test(s.texte), `${nom} : shot ${i + 1} fait parler sans <d> ni (Sx)`);
    }
    assert.equal(b.repliques.length, repliquesDe(b).length, `${nom} : une réplique listée par <d>`);
  }
});

test("exemple intense : cadence courte, un angle distinct par shot", () => {
  const b = brouillon("intense.md");
  assert.ok(b.shots.length >= 5, "au moins 5 shots pour une course");
  for (let i = 1; i < b.shots.length; i++) assert.ok(b.shots[i]!.debutSecondes - b.shots[i - 1]!.debutSecondes <= 2.5, `shot ${i} trop long pour la cadence d'une course`);
});
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
