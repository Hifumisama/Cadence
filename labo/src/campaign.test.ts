/** Rehearsal of the whole campaign with a fake model: replay A, B and C, prepare the blind reading, rate it, apply the rule. It proves that
 * what the run saves is enough for every planned measure, before any real call. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { FournisseurLlm } from "../../lib/llm/types";
import { CAMPAIGN } from "./campaign";
import { awaitsReading, readRun } from "./files";
import { buildReading, type ReadingKey } from "./reading";
import { runReport } from "./report";
import { launch, type Plan } from "./run";
import { compare, scoreReport, type Votes } from "./score";
import { variantById } from "./variants";
import type { Case, Dataset, SceneOutput } from "./types";

const GESTURES = ["Elle bondit par-dessus la table.", "Il lève les bras devant la fenêtre.", "Elle s'agenouille près du feu.", "Il pivote vers la porte."];
const scene = (mark: string, ...seconds: number[]): SceneOutput => ({
  plans: seconds.map((s, i) => ({ titre: `P${i}`, description: `${GESTURES[i]} Repère ${mark} ${i}.`, liaison: "coupe", dureeSecondes: s, tempsFort: false })),
  inventions: [],
  notes: `notes secrètes ${mark}`,
});

const item = (id: string): Case => ({ id, sceneTitle: "Duel", input: { scene: { titre: "Duel", position: "1 sur 1", dureeCibleSecondes: 40, intention: "Un duel.", moments: ["Le saut."] }, parolesDeLAuteur: ["Je veux un duel."] } }) as unknown as Case;
const cases = CAMPAIGN.readScenes.map((prefix, i) => item(`${prefix}-t${i}`));
const dataset: Dataset = { name: "test", skill: "scenario-scene", exportedAt: "", commit: "", cases };

test("campaign rehearsal: replay, blind reading, decision rule", async () => {
  const folder = mkdtempSync(join(tmpdir(), "labo-"));
  try {
    const provider: FournisseurLlm = {
      nom: "factice",
      // A: 30 s. B: 36 s on the first case (no retry), 30 s elsewhere. C's retry: 40 s.
      async generer(request) {
        const retrying = request.messages.length === 3;
        const planned = String(request.messages[0]!.content).includes("planification");
        const first = String(request.messages[0]!.content).includes('"marque":"0"');
        const answer = retrying ? scene("relance", 10, 10, 10, 10) : planned ? (first ? scene("b-long", 10, 10, 10, 6) : scene("b", 10, 10, 10)) : scene("a", 10, 10, 10);
        return { texte: JSON.stringify(answer), usage: { entree: 100, sortie: 50 }, dureeMs: 2000, modele: "servi", brut: null };
      },
    };
    const marked = cases.map((c, i) => ({ ...c, input: { ...c.input, marque: String(i) } }));
    const variants = ["A", "B", "C"].map(variantById).map((v) => ({ ...v, replacements: undefined }));
    const prepared: Plan = {
      manifest: { id: "essai", dataset: "test", startedAt: "", commit: "abc", dirty: false, model: "m", body: {}, maxTokens: null, repetitions: 3, variants: variants.map((v) => ({ id: v.id, label: v.label, systemHash: "", systemChars: 0 })), cases: marked.map((c) => c.id) },
      cases: marked,
      variants,
      calls: 54,
      conditionalCalls: 18,
    };
    const lines: string[] = [];
    const run = await launch(prepared, (line) => lines.push(line), provider, folder);
    assert.equal(lines.some((l) => /plans/.test(l)), false, "no result in the progress");
    const { manifest, records } = readRun(run);
    assert.equal(records.length, 54);
    assert.equal(awaitsReading(run, manifest), true);

    const report = runReport(manifest, records, { ...dataset, cases: marked });
    assert.match(report, /Relances de durée \| – \| – \| 15\/18/);
    assert.match(report, /Jetons écrits par scène \(moyenne\) \| 50 \| 50 \| 92/);
    assert.match(report, /\| 259-s2-t0 \| r1 |/);
    assert.match(report, /30 → 40 \| 100 \+ 100 \| 50 \+ 50 \| 2 \+ 2/);

    const { data, key } = buildReading({ ...dataset, cases: marked }, manifest, records, CAMPAIGN, () => 0, "lecture1");
    // The first scene's C reused B: two texts; the five others have three.
    assert.deepEqual(data.scenes.map((s) => s.proposals.length), [2, 3, 3, 3, 3, 3]);
    const shown = JSON.stringify(data);
    for (const secret of ["variant", "notes secrètes", "dureeSecondes", "259-s2-t0"]) assert.equal(shown.includes(secret), false, secret);
    assert.deepEqual(Object.values(key.proposals).find((p) => p.variants.length === 2)!.variants, ["B", "C"]);

    // Votes: C's retried texts get 4, everything else 3.
    const rate = (k: ReadingKey, of: (variants: string[]) => number): Votes => ({ readingId: k.readingId, votes: Object.fromEntries(Object.entries(k.proposals).map(([id, p]) => [id, { progression: of(p.variants), fidelity: of(p.variants) }])) });
    const votes = rate(key, (v) => (v.join() === "C" ? 4 : 3));
    const c = compare("C", "A", manifest, records, dataset, key, votes);
    // Gaps: A 25 % everywhere; C 0 on five cases, 10 % on the first.
    assert.deepEqual(c.conditions, { scores: true, noBigLoss: true, gap: true, stability: true });
    const b = compare("B", "A", manifest, records, dataset, key, votes);
    // B only gains on one case in six: below one third.
    assert.deepEqual(b.conditions, { scores: true, noBigLoss: true, gap: false, stability: false });
    const verdict = scoreReport(manifest, records, dataset, key, votes);
    assert.match(verdict, /\| B \| oui \| oui \| \*\*non\*\* \| \*\*non\*\* \| \*\*non retenue\*\* \|/);
    assert.match(verdict, /\| C \| oui \| oui \| oui \| oui \| \*\*retenue\*\* \|/);
    assert.match(verdict, /15\/18 déclenchées/);

    const lost = rate(key, (v) => (v.includes("A") ? 5 : 3));
    assert.equal(compare("C", "A", manifest, records, dataset, key, lost).conditions.noBigLoss, false);
    assert.throws(() => compare("C", "A", manifest, records, dataset, key, { ...votes, readingId: "autre" }), /pas de cette lecture/);
    assert.throws(() => compare("C", "A", manifest, records, dataset, key, { readingId: key.readingId, votes: {} }), /Notes manquantes/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
