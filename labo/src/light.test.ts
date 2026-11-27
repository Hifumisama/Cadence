/** Rehearsal of experiment 04 with a fake model: two calls and no more, T0 reused, blind duels, technical report, results. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { FournisseurLlm } from "../../lib/llm/types";
import { LIGHT_EXPERIMENT, REASONING_CAMPAIGN } from "./campaign";
import { awaitsReading, readRun } from "./files";
import { buildLightDuels, firstAnswer, technicalReport, versionsOf } from "./light";
import { checkReuse, launch, variantsOf, type Plan } from "./run";
import { lightVariants, materialize, variantById } from "./variants";
import type { CallRecord, Case, SceneOutput } from "./types";

// A scene the production check would send back: a character who stands still.
const answer = (mark: string): SceneOutput => ({ plans: [{ titre: `Plan ${mark}`, description: `Elle reste immobile devant la porte. Elle attend. Repère ${mark}.`, liaison: "coupe", dureeSecondes: 8, tempsFort: false }], inventions: [], notes: "" });

const item = { id: "264-s2-t1", sceneTitle: "Falaise", input: { scene: { titre: "Falaise", position: "1 sur 1", dureeCibleSecondes: 40, intention: "Elle peint." } } } as unknown as Case;

const fake: FournisseurLlm = {
  nom: "factice",
  async generer(request) {
    const mark = String(request.systeme).includes("Absolute constraints") ? "deux" : "un";
    return { texte: JSON.stringify(answer(mark)), usage: { entree: 9000, sortie: 500 }, dureeMs: 2000, modele: "servi", arret: "stop", reflexion: "je réfléchis", brut: null };
  },
};

const reusedRecord = { caseId: item.id, variant: "A", repetition: 2, input: item.input, output: answer("zéro"), resends: 0, error: null, startedAt: "", attempts: [{ request: { model: "m", body: { chat_template_kwargs: { enable_thinking: false } }, messages: [] }, text: JSON.stringify(answer("zéro")), reasoning: null, stop: "stop", tokensIn: 9000, tokensOut: 400, durationMs: 1000 }] } as CallRecord;

test("experiment 04: fixed versions, and T0 reused only under the same conditions", () => {
  assert.deepEqual(variantsOf({ dataset: "d", variants: [], repetitions: 1, campaign: "04", reuse: ["x"] }).map((v) => v.id), ["T1", "T2"]);
  assert.deepEqual(variantsOf({ dataset: "d", variants: [], repetitions: 1, campaign: "04", round: 2, reuse: ["x", "y"] }).map((v) => v.id), ["T3"]);
  assert.throws(() => variantsOf({ dataset: "d", variants: [], repetitions: 1, campaign: "04" }), /--reuse/);
  assert.throws(() => variantsOf({ dataset: "d", variants: [], repetitions: 1, campaign: "04", round: 2, reuse: ["x"] }), /T0 puis T1/);
  assert.deepEqual(variantsOf({ dataset: "d", variants: [], repetitions: 1, campaign: "04", round: 3, reuse: ["x"] }).map((v) => v.id), ["T1"]);
  assert.throws(() => variantsOf({ dataset: "d", variants: [], repetitions: 1, campaign: "04", round: 4, reuse: ["x"] }), /tour inconnu/);
  assert.throws(() => variantsOf({ dataset: "d", variants: ["B"], repetitions: 1, campaign: "04", reuse: ["x"] }), /fixés/);
  const reuse = LIGHT_EXPERIMENT.rounds[0]!.reused[0]!;
  assert.throws(() => checkReuse({ records: [reusedRecord] }, { ...reuse, thinking: true }, item), /avec réflexion/);
  checkReuse({ records: [reusedRecord] }, reuse, item);
  assert.throws(() => checkReuse({ records: [] }, reuse, item), /pas d'appel/);
  assert.throws(() => checkReuse({ records: [reusedRecord] }, reuse, { ...item, input: { scene: {} } } as unknown as Case), /entrée diffère/);
  const cut = { ...reusedRecord, attempts: [{ ...reusedRecord.attempts[0]!, stop: "length" }] };
  assert.throws(() => checkReuse({ records: [cut] }, reuse, item), /coupée/);
});

test("experiment 04 rehearsal: two calls, blind duels, hidden until answered", async () => {
  const root = mkdtempSync(join(tmpdir(), "labo-"));
  try {
    // The reused run: its production prompt is the one T1 will run.
    const production = materialize(variantById("A"), join(root, "scratch"));
    const source = join(root, "source");
    mkdirSync(join(source, "calls"), { recursive: true });
    const sourceManifest = { id: "source", cases: [item.id], variants: [{ id: "A", ...production }] };
    writeFileSync(join(source, "manifest.json"), JSON.stringify(sourceManifest));
    writeFileSync(join(source, "calls", "a.json"), JSON.stringify(reusedRecord));

    const plan = (id: string, round = 1, runs = ["source"]): Plan => {
      const settings = LIGHT_EXPERIMENT.rounds[round - 1]!;
      const variants = lightVariants(settings.variants);
      const reuse = settings.reused.map((r, i) => ({ id: r.id, run: runs[i]!, variant: r.variant, repetition: r.repetition }));
      return {
        manifest: { id, dataset: "test", startedAt: "", commit: "abc", dirty: false, model: "m", body: {}, maxTokens: REASONING_CAMPAIGN.maxTokens, repetitions: 1, campaign: "04", round, reuse, variants: variants.map((v) => ({ id: v.id, label: v.label, systemHash: "", systemChars: 0 })), cases: [item.id] },
        cases: [item],
        variants,
        calls: variants.length,
        conditionalCalls: 0,
      };
    };
    const run = await launch(plan("essai"), () => {}, fake, root);
    const { manifest, records } = readRun(run);
    assert.deepEqual(records.map((r) => [r.variant, r.attempts.length, r.resends]), [["T1", 1, 0], ["T2", 1, 0]], "no content resend");
    assert.equal(manifest.variants[0]!.systemHash, production.systemHash);
    assert.notEqual(manifest.variants[1]!.systemHash, production.systemHash);
    assert.ok(manifest.variants[1]!.systemChars < production.systemChars);
    assert.equal(awaitsReading(run, manifest), true);

    const technical = technicalReport(manifest, records);
    assert.match(technical, /Contexte, appel par appel/);
    assert.equal(technical.includes("Repère"), false, "no text of the model");

    const { versions } = versionsOf(run);
    assert.deepEqual(versions.map((v) => v.id), ["T0", "T1", "T2"]);
    const { data, key } = buildLightDuels(item, manifest.id, versions, LIGHT_EXPERIMENT.rounds[0]!.duels, () => 0, "lecture4");
    assert.equal(data.duels.length, 2);
    assert.deepEqual(Object.values(key.duels).map((d) => [...d.sides].sort().join()).sort(), ["T0,T1", "T1,T2"]);
    for (const secret of ["T0", "T1", "T2", "variant", "dureeSecondes"]) assert.equal(JSON.stringify(data).includes(secret), false, secret);
    assert.equal(firstAnswer({ ...reusedRecord, attempts: [{ ...reusedRecord.attempts[0]!, text: "pas du JSON" }] }), null);

    mkdirSync(join(run, "duels"));
    writeFileSync(join(run, "duels", "votes.json"), "{}");
    assert.equal(awaitsReading(run, manifest), false);

    // Second round: one new version, T0 and T1 reused from their two runs.
    const second = await launch(plan("tour-2", 2, ["source", "essai"]), () => {}, fake, root);
    assert.deepEqual(readRun(second).records.map((r) => [r.variant, r.attempts.length]), [["T3", 1]]);
    const three = versionsOf(second).versions;
    assert.deepEqual(three.map((v) => v.id), ["T0", "T1", "T3"]);
    assert.equal(buildLightDuels(item, "tour-2", three, LIGHT_EXPERIMENT.rounds[1]!.duels).data.duels.length, 2);

    // A production prompt that changed since the reused run stops everything before any call.
    writeFileSync(join(source, "manifest.json"), JSON.stringify({ ...sourceManifest, variants: [{ id: "A", systemHash: "autre" }] }));
    await assert.rejects(launch(plan("essai-2"), () => {}, fake, root), /prompt de production a changé/);
    assert.throws(() => readFileSync(join(root, "essai-2", "manifest.json")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
