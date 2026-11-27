import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { DemandeLlm, FournisseurLlm } from "../../lib/llm/types";
import { launch, type Plan } from "./run";
import { durationRetryMessage, minimumPlans, variantById } from "./variants";
import type { Case, SceneInput, SceneOutput } from "./types";

const input: SceneInput = { scene: { titre: "Duel", position: "1 sur 1", dureeCibleSecondes: 40, moments: ["a", "b"] } };
// Each plan has its own movement: the production check must find nothing to send back.
const GESTURES = ["Elle bondit par-dessus la table.", "Il lève les bras devant la fenêtre.", "Elle s'agenouille près du feu.", "Il pivote vers la porte."];
const scene = (...seconds: number[]): SceneOutput => ({
  plans: seconds.map((s, i) => ({ titre: `P${i}`, description: GESTURES[i]!, liaison: "coupe", dureeSecondes: s, tempsFort: false })),
  inventions: [],
  notes: "",
});

test("B adds the minimum number of plans to the input, without touching the rest", () => {
  assert.equal(minimumPlans(40), 4);
  assert.equal(minimumPlans(41), 5);
  const prepared = variantById("b").prepareInput!(input);
  assert.deepEqual(prepared.planification, { plansMinimum: 4, dureeMaximumPlanSecondes: 10 });
  assert.deepEqual(prepared.scene, input.scene);
});

test("C retries only under 85 % of the raw target, and keeps the right to stay short", () => {
  assert.equal(durationRetryMessage(scene(10, 10, 8, 6), input), null); // 34 s = 85 %
  const message = durationRetryMessage(scene(10, 10, 10), input)!;
  assert.match(message, /30 s pour 40 s visées : il manque 10 s/);
  assert.match(message, /au moins 4/);
  assert.match(message, /scène plus courte/);
});

async function replay(answers: SceneOutput[]) {
  const folder = mkdtempSync(join(tmpdir(), "labo-"));
  const item = { id: "1-s1-t1", input } as Case;
  const requests: DemandeLlm[] = [];
  const provider: FournisseurLlm = {
    nom: "factice",
    async generer(request) {
      requests.push(request);
      return { texte: JSON.stringify(answers.shift()), usage: { entree: 1, sortie: 1 }, dureeMs: 1000, modele: "m", brut: null };
    },
  };
  // Without their text replacements: an edit of the production skill must not break the repository's tests (a run still checks them).
  const variants = [variantById("B"), variantById("C")].map((v) => ({ ...v, replacements: undefined }));
  const prepared: Plan = {
    manifest: { id: "essai", dataset: "test", startedAt: "", commit: "abc", dirty: false, model: "m", body: {}, maxTokens: null, repetitions: 1, variants: variants.map((v) => ({ id: v.id, label: v.label, systemHash: "", systemChars: 0 })), cases: [item.id] },
    cases: [item],
    variants,
    calls: 2,
    conditionalCalls: 1,
  };
  const lines: string[] = [];
  try {
    await launch(prepared, (line) => lines.push(line), provider, folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  return { requests, lines, hashes: prepared.manifest.variants.map((v) => v.systemHash) };
}

test("C reuses B's generation when it is long enough", async () => {
  const { requests, lines, hashes } = await replay([scene(10, 10, 10, 10)]);
  assert.equal(requests.length, 1);
  assert.match(lines[1]!, /sans relance/);
  assert.equal(hashes[0], hashes[1]);
});

test("C asks one more generation in the same conversation when B is short", async () => {
  const { requests, lines } = await replay([scene(10, 10, 10), scene(10, 10, 10, 10)]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]!.messages.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(requests[1]!.messages[0]!.content, requests[0]!.messages[0]!.content);
  assert.match(String(requests[1]!.messages[2]!.content), /il manque 10 s/);
  assert.match(lines[1]!, /relancée/);
});
