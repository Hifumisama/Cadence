/** Rehearsal of campaign 02 with a fake model and fake probes, no network: the two versions, what is captured around each call, the blind
 * reading with its third note, the decision rule and the pilot. */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ErreurLlm, type DemandeLlm, type FournisseurLlm } from "../../lib/llm/types";
import { REASONING_CAMPAIGN } from "./campaign";
import { awaitsReading, readRun } from "./files";
import { countReasoning, memorySampler, tokenCounter, type Probes } from "./probes";
import { buildReading, type ReadingKey } from "./reading";
import { runReport } from "./report";
import { launch, pickPilotCases, variantsOf, type Plan } from "./run";
import type { Votes } from "./score";
import { compareReasoning, contextRows, pilotReport, pilotRows, reasoningVerdict } from "./score-reasoning";
import { reasoningVariants } from "./variants";
import type { Case, Dataset, SceneOutput } from "./types";

const GESTURES = ["Elle bondit par-dessus la table.", "Il lève les bras devant la fenêtre.", "Elle s'agenouille près du feu.", "Il pivote vers la porte."];
const scene = (mark: string, ...seconds: number[]): SceneOutput => ({
  plans: seconds.map((s, i) => ({ titre: `P${i}`, description: `${GESTURES[i]} Repère ${mark} ${i}.`, liaison: "coupe", dureeSecondes: s, tempsFort: false })),
  inventions: [],
  notes: "",
});
const item = (id: string, filler = ""): Case => ({ id, sceneTitle: "Duel", input: { scene: { titre: "Duel", position: "1 sur 1", dureeCibleSecondes: 40, intention: `Un duel. ${filler}` } } }) as unknown as Case;
const cases = REASONING_CAMPAIGN.readScenes.map((prefix, i) => item(`${prefix}-t${i}`, "x".repeat(i * 10)));
const dataset: Dataset = { name: "test", skill: "scenario-scene", exportedAt: "", commit: "", cases };

const thinking = (request: DemandeLlm): boolean => (request.corps as { chat_template_kwargs: { enable_thinking: boolean } }).chat_template_kwargs.enable_thinking;

function fakeModel(requests: DemandeLlm[], failOn?: (request: DemandeLlm) => boolean): FournisseurLlm {
  return {
    nom: "factice",
    async generer(request) {
      requests.push(request);
      if (failOn?.(request)) throw new ErreurLlm("delai", "Délai dépassé (http://serveur:1/v1).");
      const retrying = request.messages.length === 3;
      const answer = retrying ? scene(`long-${thinking(request)}`, 10, 10, 10, 10) : scene(`court-${thinking(request)}`, 10, 10, 10);
      return {
        texte: JSON.stringify(answer),
        reflexion: thinking(request) ? "SECRET je réfléchis " : undefined,
        usage: { entree: 10_000, sortie: thinking(request) ? 5000 : 600 },
        dureeMs: thinking(request) ? 60_000 : 20_000,
        modele: "servi",
        arret: "stop",
        timings: { cacheN: 9000, promptN: 1000, promptMs: 2000, predictedN: 600, predictedMs: 10_000, draftN: 100, draftAcceptedN: 80 },
        brut: null,
      };
    },
  };
}

const probes: Probes = {
  memory: () => ({ stop: async () => ({ vramPeakGb: 15.2, ramPeakGb: 30, vramFirstGb: 15, samples: 3, intervalMs: 1000 }) }),
  countTokens: async (text) => text.split(" ").filter(Boolean).length,
};

function plan(id: string, versions: string[], repetitions: number, pilot = false): Plan {
  // Without their text replacements: an edit of the production skill must not break the repository's tests.
  const variants = reasoningVariants("C").filter((v) => versions.includes(v.id)).map((v) => ({ ...v, replacements: undefined }));
  return {
    manifest: {
      id, dataset: "test", startedAt: "", commit: "abc", dirty: false, model: "m", body: {}, maxTokens: 28_000, repetitions, campaign: "02", base: "C", ...(pilot ? { pilot: true } : {}),
      variants: variants.map((v) => ({ id: v.id, label: v.label, systemHash: "", systemChars: 0, body: v.body, maxTokens: v.maxTokens })),
      cases: cases.map((c) => c.id),
    },
    cases,
    variants,
    calls: cases.length * variants.length * repetitions,
    conditionalCalls: 0,
  };
}

test("T0 and T1 share prompt, input, retry and cap, and differ only by enable_thinking", () => {
  for (const base of ["A", "B", "C"]) {
    const [t0, t1] = reasoningVariants(base);
    assert.deepEqual(t0!.body, { chat_template_kwargs: { enable_thinking: false, reasoning_effort: "xhigh" } });
    assert.deepEqual(t1!.body, { chat_template_kwargs: { enable_thinking: true, reasoning_effort: "xhigh" } });
    assert.equal(t0!.replacements, t1!.replacements);
    assert.equal(t0!.prepareInput, t1!.prepareInput);
    assert.equal(t0!.ownRetry, t1!.ownRetry);
    assert.equal(Boolean(t0!.ownRetry), base === "C");
    assert.deepEqual([t0!.maxTokens, t1!.maxTokens], [28_000, 28_000]);
  }
  const options = { dataset: "d", variants: [], repetitions: 3, campaign: "02" as const };
  assert.throws(() => variantsOf(options), /--base est obligatoire/);
  assert.throws(() => variantsOf({ ...options, base: "b", only: ["259"] }), /fixés par le protocole/);
  assert.deepEqual(variantsOf({ ...options, base: "b", pilot: true }).map((v) => v.id), ["T1"]);
  assert.throws(() => variantsOf({ dataset: "d", variants: ["A"], repetitions: 1, pilot: true }), /campagne 02/);
});

test("pilot scenes: shortest, median and longest input", () => {
  assert.deepEqual(pickPilotCases(cases).map((c) => c.id), [cases[0]!.id, cases[2]!.id, cases[5]!.id]);
});

test("probes: sampled peaks, tokenizer then estimate, and a dead server that stops nothing", async () => {
  let free = 8 * 2 ** 30;
  const stats = async () => {
    const body = { devices: [{ vram_total: 16 * 2 ** 30, vram_free: free }], system: { ram_total: 64 * 2 ** 30, ram_free: 40 * 2 ** 30 } };
    free = 2 * 2 ** 30;
    return new Response(JSON.stringify(body));
  };
  const peak = await memorySampler("http://comfy", { fetch: stats, intervalMs: 60_000 })().stop();
  assert.deepEqual(peak, { vramPeakGb: 14, ramPeakGb: 24, vramFirstGb: 8, samples: 2, intervalMs: 60_000 });
  const dead = async () => {
    throw new Error("ECONNREFUSED http://comfy");
  };
  assert.equal(await memorySampler("http://comfy", { fetch: dead })().stop(), null);

  let asked = "";
  const counter = tokenCounter("http://llm", { fetch: async (url) => ((asked = url), new Response(JSON.stringify({ tokens: [1, 2, 3] }))) });
  const answer = { reasoning: "abcdefghij", text: "klmnopqrst", tokensOut: 100, model: "swift" };
  assert.deepEqual(await countReasoning(answer, counter), { tokens: 3, method: "tokenizer" });
  assert.equal(asked, "http://llm/upstream/swift/tokenize");
  assert.deepEqual(await countReasoning(answer, tokenCounter("http://llm", { fetch: dead })), { tokens: 50, method: "share" });
  assert.deepEqual(await countReasoning({ ...answer, reasoning: null }, counter), { tokens: 0, method: "none" });
  assert.equal((await countReasoning({ ...answer, reasoning: "a".repeat(100_000) }, counter)).textCut, true);
});

test("campaign 02 rehearsal: replay with probes, blind reading with three notes, decision rule", async () => {
  const folder = mkdtempSync(join(tmpdir(), "labo-"));
  try {
    const requests: DemandeLlm[] = [];
    const prepared = plan("essai", ["T0", "T1"], 2);
    const run = await launch(prepared, () => {}, fakeModel(requests), folder, probes);
    const { manifest, records } = readRun(run);
    assert.equal(records.length, 24);
    // Base C: a first generation and its retry in the same record, for both versions.
    const record = records.find((r) => r.variant === "T1")!;
    assert.equal(record.attempts.length, 2);
    assert.deepEqual([record.retry!.triggered, record.retry!.firstAttempts, record.retry!.from], [true, 1, "T1"]);
    assert.equal(record.output!.plans.length, 4);
    assert.equal(record.retry!.firstOutput.plans.length, 3);
    assert.ok(requests.every((r) => r.maxTokens === 28_000));
    const [first] = record.attempts;
    assert.equal(first!.request.maxTokens, 28_000);
    assert.deepEqual(first!.request.body, { chat_template_kwargs: { enable_thinking: true, reasoning_effort: "xhigh" } });
    assert.equal(first!.timings!.draftAcceptedN, 80);
    assert.equal(first!.memory!.vramPeakGb, 15.2);
    assert.deepEqual(first!.reasoningCount, { tokens: 3, method: "tokenizer" });
    assert.equal(manifest.variants[0]!.systemHash, manifest.variants[1]!.systemHash);
    // The version that goes first alternates.
    const startsThinking = (c: Case) => thinking(requests.find((r) => JSON.parse(String(r.messages[0]!.content)).scene.intention === c.input.scene.intention)!);
    assert.notEqual(startsThinking(cases[0]!), startsThinking(cases[1]!));
    assert.equal(awaitsReading(run, manifest), true);

    const report = runReport(manifest, records, dataset);
    assert.match(report, /Temps médian par scène \(s\) \| 40 \| 120 \|/);
    assert.match(report, /## Mesures fournies par le serveur/);
    assert.match(report, /Brouillons MTP acceptés \| 80 % \| 80 % \|/);
    assert.match(report, /méthode \(nombre d'appels\) \| sans réflexion 24 \| découpeur du serveur 24 \|/);
    assert.match(report, /Pic de VRAM observé \(Go\) \| 15.2 \| 15.2 \|/);
    assert.match(report, /\| T1 \| r1 \| 3 → 4 \| 30 → 40 \| 10000 \+ 10000 \| 5000 \+ 5000 \| 60 \+ 60 \|/);

    const { data, key } = buildReading(dataset, manifest, records, REASONING_CAMPAIGN, () => 0, "lecture2");
    assert.deepEqual(data.questions.map((q) => q.id), ["progression", "fidelity", "coherence"]);
    assert.deepEqual(data.scenes.map((s) => s.proposals.length), [2, 2, 2, 2, 2, 2]);
    for (const secret of ["SECRET", "enable_thinking", "T1", "variant"]) assert.equal(JSON.stringify(data).includes(secret), false, secret);

    const rate = (k: ReadingKey, of: (version: string, note: string, index: number) => number): Votes => ({
      readingId: k.readingId,
      votes: Object.fromEntries(Object.entries(k.proposals).map(([id, p], i) => [id, { progression: of(p.variants[0]!, "progression", i), fidelity: of(p.variants[0]!, "fidelity", i), coherence: of(p.variants[0]!, "coherence", i) }])),
    });
    const better = rate(key, (v, note) => (v === "T1" && note === "progression" ? 4 : 3));
    const c = compareReasoning(manifest, records, key, better);
    assert.deepEqual(c.conditions, { gain: true, noDrop: true, noBigLoss: true, failures: true, noTruncation: true, time: true });
    assert.equal(c.adopted, true);
    assert.match(reasoningVerdict(manifest, records, key, better), /La réflexion devient le fonctionnement normal/);

    assert.equal(compareReasoning(manifest, records, key, rate(key, () => 3)).conditions.gain, false);
    const drop = rate(key, (v, note) => (v === "T1" ? (note === "progression" ? 5 : note === "coherence" ? 2 : 3) : 3));
    assert.equal(compareReasoning(manifest, records, key, drop).conditions.noDrop, false);
    const noThird = { readingId: key.readingId, votes: Object.fromEntries(Object.keys(key.proposals).map((id) => [id, { progression: 3, fidelity: 3 }])) };
    assert.throws(() => compareReasoning(manifest, records, key, noThird), /Notes manquantes/);

    // A truncated answer, a slow median and a missing record each block adoption.
    const t1 = (change: (r: (typeof records)[number]) => (typeof records)[number]) => records.map((r) => (r.variant === "T1" ? change(r) : r));
    const cut = t1((r) => ({ ...r, attempts: r.attempts.map((a) => ({ ...a, stop: "length" })) }));
    assert.equal(compareReasoning(manifest, cut, key, better).conditions.noTruncation, false);
    const slow = t1((r) => ({ ...r, failedMs: 200_000 }));
    assert.equal(compareReasoning(manifest, slow, key, better).conditions.time, false);
    assert.equal(compareReasoning(manifest, records.slice(1), key, better).adopted, false);
    // An unreachable server leaves the pair out for both versions.
    const outage = records.map((r) => (r === records[0] ? { ...r, error: "x", errorCode: "injoignable" } : r));
    const o = compareReasoning(manifest, outage, key, better);
    assert.deepEqual([o.failures.without, o.failures.with, o.excluded.length], [0, 0, 1]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("pilot: counts only, a timeout is kept with its code and no address, and probes that throw stop nothing", async () => {
  const folder = mkdtempSync(join(tmpdir(), "labo-"));
  try {
    const broken: Probes = {
      memory: () => {
        throw new Error("sonde cassée");
      },
      countTokens: async () => {
        throw new Error("sonde cassée");
      },
    };
    const clean = await launch(plan("pilote", ["T1"], 1, true), () => {}, fakeModel([]), folder, broken);
    const ok = readRun(clean);
    assert.ok(ok.records.every((r) => r.output && !r.error));
    assert.equal(ok.records[0]!.attempts[0]!.reasoningCount!.method, "share");
    const passed = pilotReport(ok.manifest, ok.records);
    assert.match(passed, /prêt pour la campagne/);
    assert.equal(passed.includes("Repère"), false, "no text of the model");
    assert.equal(pilotRows(ok.manifest, ok.records)[0]!.marginAtCap, 45_056 - 10_000 - 28_000);
    // Every call of a record, the retry included.
    assert.deepEqual(contextRows(ok.manifest, [ok.records[0]!]).map((c) => c.kind), ["première", "relance"]);
    assert.match(passed, /Contexte, appel par appel/);
    assert.throws(() => compareReasoning(ok.manifest, ok.records, { readingId: "", run: "", proposals: {} }, { readingId: "", votes: {} }), /pilote/);

    const failed = await launch(plan("pilote-rate", ["T1"], 1, true), () => {}, fakeModel([], (r) => r.messages.length === 3), folder, probes);
    const bad = readRun(failed);
    const record = bad.records[0]!;
    assert.equal(record.errorCode, "delai");
    assert.equal(record.output!.plans.length, 3, "the first generation is kept");
    assert.ok(record.failedMs! >= 0);
    assert.equal(readFileSync(join(failed, "calls", `${record.caseId}__T1__r1.json`), "utf8").includes("serveur:1"), false);
    assert.match(pilotReport(bad.manifest, bad.records), /à corriger avant la campagne/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
