import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPageData, renderPage, type Run } from "./page";
import type { Case, Dataset, SceneOutput } from "./types";

const output: SceneOutput = {
  plans: [
    { titre: "Un", description: "Mai reste immobile devant le feu. Elle regarde les braises.", liaison: "coupe", dureeSecondes: 8 },
    { titre: "Deux", description: "Mai bondit par-dessus le feu et roule au sol. </script><b>x</b>", liaison: "suite", dureeSecondes: 8 },
  ],
};
const item = {
  id: "1-s1-t1",
  project: 1,
  sceneRank: 1,
  sceneTitle: "Duel",
  input: { scene: { titre: "Duel", position: "1 sur 1", dureeCibleSecondes: 40 }, briefExtrait: { personnages: [{ nom: "Mai" }] } },
  historical: { createdAt: "2026-11-17T10:00:00Z", model: "m", systemHash: "abcdefgh1234", reasoningChars: 0, resends: 0, durationMs: 17000, output },
  stored: null,
  review: null,
} as unknown as Case;
const dataset: Dataset = { name: "test", skill: "scenario-scene", exportedAt: "2026-11-27T00:00:00Z", commit: "abc", cases: [item] };

test("page data: history first, per-plan durations and findings, one source per variant and repetition of a run", () => {
  const run: Run = {
    manifest: { id: "essai", dataset: "test", startedAt: "2026-11-27T10:00:00Z", commit: "abc", dirty: false, model: "m", body: {}, maxTokens: null, repetitions: 2, variants: [{ id: "A", label: "Production", systemHash: "ffff", systemChars: 1 }], cases: [item.id] },
    records: [
      { caseId: item.id, variant: "A", repetition: 1, startedAt: "", input: {}, attempts: [{ request: { model: null, body: null, messages: [] }, text: "", reasoning: "je pense", stop: null, tokensIn: 0, tokensOut: 0, durationMs: 2000 }], output, resends: 0, error: null },
      { caseId: item.id, variant: "A", repetition: 2, startedAt: "", input: {}, attempts: [], output: null, resends: 0, error: "Serveur éteint" },
    ],
  };
  const data = buildPageData(dataset, [run]);
  assert.deepEqual(data.sources.map((s) => s.id), ["historique", "essai-A-r1", "essai-A-r2"]);
  assert.match(data.sources[1]!.label, /avec réflexion/);
  assert.match(data.sources[2]!.label, /sans réflexion/);

  const scene = data.sources[0]!.scenes[0]!;
  assert.equal(scene.metrics!.targetReachable, false);
  assert.deepEqual(scene.plans.map((p) => [p.written, p.final]), [[8, 10], [8, 10]]);
  const still = scene.plans[0]!.issues.find((i) => i.kind === "still")!;
  assert.deepEqual(still.phrases, ["Mai reste immobile devant le feu."]);
  assert.deepEqual(scene.plans[1]!.issues, []);

  const failed = data.sources[2]!.scenes[0]!;
  assert.equal(failed.metrics, null);
  assert.equal(failed.error, "Serveur éteint");
});

test("page data: a paired variant that made no call of its own keeps the run's reasoning setting and says where its output comes from", () => {
  const base = { caseId: item.id, repetition: 1, startedAt: "", input: {}, output, resends: 0, error: null };
  const run: Run = {
    manifest: { id: "essai", dataset: "test", startedAt: "2026-11-27T10:00:00Z", commit: "abc", dirty: false, model: "m", body: {}, maxTokens: null, repetitions: 1, variants: [], cases: [item.id] },
    records: [
      { ...base, variant: "B", attempts: [{ request: { model: null, body: null, messages: [] }, text: "", reasoning: "je pense", stop: null, tokensIn: 0, tokensOut: 0, durationMs: 2000 }] },
      { ...base, variant: "C", attempts: [], retry: { from: "B", triggered: false, firstOutput: output } },
    ],
  };
  const paired = buildPageData(dataset, [run]).sources.at(-1)!;
  assert.match(paired.label, /· C · .* avec réflexion/);
  assert.deepEqual(paired.scenes[0]!.retry, { from: "B", triggered: false });
  assert.ok(paired.scenes[0]!.facts.some(([, value]) => value.includes("reprise de B")));
});

test("page rendering: the model's text cannot close the data block, and survives intact", () => {
  const data = buildPageData(dataset, []);
  const html = renderPage(data, '<script type="application/json">__DATA__</script>');
  assert.equal(html.split("</script>").length, 2);
  const json = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"));
  assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify(data)));
  assert.throws(() => renderPage(data, "sans emplacement"), /exactement un emplacement/);
});
