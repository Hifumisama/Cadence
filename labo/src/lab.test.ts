import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { DemandeLlm, FournisseurLlm } from "../../lib/llm/types";
import { measureScene } from "./metrics";
import { runReport } from "./report";
import { launch, type Plan } from "./run";
import { applyReplacements, VARIANTS } from "./variants";
import type { CallRecord, Case, Dataset, SceneInput, SceneOutput } from "./types";

const input: SceneInput = { scene: { titre: "Duel", position: "1 sur 1", dureeCibleSecondes: 40, moments: ["a", "b"] } };
const plan = (titre: string, description: string, dureeSecondes: number) => ({ titre, description, liaison: "coupe", dureeSecondes, tempsFort: false });
const output: SceneOutput = {
  plans: [
    plan("Un", "Elle bondit par-dessus la table et roule au sol.\n\nMAI : « Viens. »", 8),
    plan("Deux", "Il recule, lève les bras et heurte la porte.", 8),
  ],
  inventions: [],
  notes: "",
};

test("durations: raw, adjusted by the production rule, seconds added by the code, unreachable target", () => {
  const m = measureScene(input, output);
  assert.equal(m.rawSeconds, 16);
  assert.equal(m.adjustedSeconds, 20);
  assert.equal(m.codeSeconds, 4);
  assert.equal(m.maxReachableSeconds, 20);
  assert.equal(m.targetReachable, false);
  assert.equal(m.adjustedGap, -0.5);
  assert.equal(m.withinBounds, false);
  assert.equal(m.moments, 2);
  assert.equal(m.dialogueLines, 1);
});

test("a variant replacement must match exactly once", () => {
  assert.equal(applyReplacements("a b c", [{ find: "b", replace: "B" }]), "a B c");
  assert.throws(() => applyReplacements("a b c", [{ find: "z", replace: "" }]), /0 fois/);
  assert.throws(() => applyReplacements("b b", [{ find: "b", replace: "" }]), /2 fois/);
});

test("a run goes through the production executor with a fake model: prompt saved, every attempt kept, report built", async () => {
  const folder = mkdtempSync(join(tmpdir(), "labo-"));
  try {
    const item = { id: "1-s1-t1", input } as Case;
    // First answer off the schema, second one valid: the production executor resends once.
    const answers = ["pas du JSON", JSON.stringify(output)];
    const requests: DemandeLlm[] = [];
    const provider: FournisseurLlm = {
      nom: "factice",
      async generer(request) {
        requests.push(request);
        return { texte: answers.shift()!, usage: { entree: 10, sortie: 5 }, dureeMs: 1000, modele: "m", brut: null };
      },
    };
    const prepared: Plan = {
      manifest: { id: "essai", dataset: "test", startedAt: "", commit: "abc", dirty: false, model: "m", body: { x: 1 }, maxTokens: null, repetitions: 1, variants: [{ id: "A", label: "A", systemHash: "", systemChars: 0 }], cases: [item.id] },
      cases: [item],
      variants: [VARIANTS[0]!],
      calls: 1,
    };
    const run = await launch(prepared, () => {}, provider, folder);
    const files = readdirSync(join(run, "calls"));
    assert.equal(files.length, 1);
    const record = JSON.parse(readFileSync(join(run, "calls", files[0]!), "utf8")) as CallRecord;
    assert.equal(record.attempts.length, 2);
    assert.equal(record.attempts[0]!.text, "pas du JSON");
    assert.equal(record.resends, 1);
    assert.equal(record.output?.plans.length, 2);
    assert.deepEqual(requests[0]!.corps, { x: 1 });
    assert.match(readFileSync(join(run, "variants", "A", "agents", "skills", "scenario-scene", "SKILL.md"), "utf8"), /name: scenario-scene/);
    assert.match(prepared.manifest.variants[0]!.systemHash, /^[0-9a-f]{64}$/);
    const report = runReport(prepared.manifest, [record], { name: "test", skill: "scenario-scene", exportedAt: "", commit: "", cases: [item] } as Dataset);
    assert.match(report, /Cible inatteignable \| 1\/1/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
