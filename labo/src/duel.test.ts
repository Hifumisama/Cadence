import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { CONFIRMATION } from "./campaign";
import { buildDuels, decideDuels, duelReport, type DuelKey, type DuelVote, type DuelVotes } from "./duel";
import { serveDuels } from "./duel-server";
import { awaitsReading, LAB_ROOT } from "./files";
import { renderPage } from "./page";
import type { CallRecord, Case, Dataset, RunManifest } from "./types";

const cases = CONFIRMATION.scenes.map((prefix, i) => ({ id: `${prefix}-t${i}`, sceneTitle: "Duel", input: { scene: { titre: "Duel", position: "1 sur 1", dureeCibleSecondes: 40, intention: "Un duel." } } }) as unknown as Case);
const dataset: Dataset = { name: "test", skill: "scenario-scene", exportedAt: "", commit: "", cases };
const manifest = { id: "essai", cases: cases.map((c) => c.id), variants: [{ id: "A" }, { id: "C" }], repetitions: 3 } as unknown as RunManifest;
const records = cases.flatMap((c) =>
  ["A", "C"].flatMap((variant) =>
    [1, 2].map((repetition) => ({ caseId: c.id, variant, repetition, output: { plans: [{ titre: "T", description: `Texte ${variant === "A" ? "un" : "deux"}, passage ${repetition}.`, dureeSecondes: 8 }], notes: "SECRET" } }) as unknown as CallRecord),
  ),
);

/** `choose` answers by variant name, translated to the side that holds it. */
const answers = (key: DuelKey, choose: (index: number) => string, flag: (index: number) => string[] = () => []): DuelVotes => ({
  readingId: key.readingId,
  duels: Object.fromEntries(
    Object.entries(key.duels).map(([id, duel], i) => {
      const side = (v: string) => String(duel.sides.indexOf(v) + 1) as "1" | "2";
      const wanted = choose(i);
      return [id, { choice: (duel.sides.includes(wanted) ? side(wanted) : wanted) as DuelVote["choice"], betrayal: flag(i).map(side) }];
    }),
  ),
});

test("duels: blind, on the planned repetition, the candidate as often on each side", () => {
  const { data, key } = buildDuels(dataset, manifest, records, CONFIRMATION, () => 0, "duels1");
  assert.equal(data.duels.length, 4);
  assert.equal(Object.values(key.duels).filter((d) => d.sides[0] === "C").length, 2);
  const shown = JSON.stringify(data);
  for (const secret of ["variant", "SECRET", "dureeSecondes", "-t0", "passage 1"]) assert.equal(shown.includes(secret), false, secret);
  assert.match(shown, /passage 2/);
  assert.throws(() => buildDuels(dataset, manifest, records.filter((r) => r.variant === "A"), CONFIRMATION), /pas de sortie de C/);
});

test("duels: three wins and no betrayal of its own", () => {
  const { key } = buildDuels(dataset, manifest, records, CONFIRMATION, () => 0, "duels1");
  const three = (i: number) => (i < 3 ? "C" : "skip");
  assert.equal(decideDuels(key, answers(key, three)).reached, true);
  assert.equal(decideDuels(key, answers(key, (i) => (i < 2 ? "C" : "equal"))).reached, false);
  assert.equal(decideDuels(key, answers(key, three, (i) => (i === 3 ? ["C"] : []))).reached, false);
  assert.equal(decideDuels(key, answers(key, three, (i) => (i === 3 ? ["A", "C"] : []))).reached, true);
  assert.match(duelReport(key, answers(key, three)), /Seuil atteint/);
  assert.throws(() => decideDuels(key, { readingId: key.readingId, duels: {} }), /manquantes/);
  assert.throws(() => decideDuels(key, { ...answers(key, three), readingId: "autre" }), /pas de cette lecture/);
});

test("duels: the server stays local, saves once, and the run stays hidden until then", async () => {
  const folder = mkdtempSync(join(tmpdir(), "labo-"));
  try {
    const { data, key } = buildDuels(dataset, manifest, records, CONFIRMATION, () => 0, "duels1");
    const single = { ...manifest, variants: [manifest.variants[0]!] };
    assert.equal(awaitsReading(folder, single), false);
    mkdirSync(join(folder, "confirmation"));
    writeFileSync(join(folder, "confirmation", "duels.html"), renderPage(data, readFileSync(resolve(LAB_ROOT, "src", "page", "duel.html"), "utf8")));
    writeFileSync(join(folder, "confirmation", "key.json"), JSON.stringify(key));
    assert.equal(awaitsReading(folder, single), true);

    const server = await serveDuels(folder, 0);
    try {
      assert.match(await (await fetch(server.url)).text(), /Duels à l'aveugle/);
      const post = (body: unknown, type = "application/json") => fetch(`${server.url}votes`, { method: "POST", headers: { "content-type": type }, body: JSON.stringify(body) });
      const votes = answers(key, () => "C");
      assert.equal((await post(votes, "text/plain")).status, 415);
      assert.equal((await post({ ...votes, readingId: "autre" })).status, 400);
      assert.equal((await post(votes)).status, 200);
      assert.deepEqual(JSON.parse(readFileSync(await server.saved, "utf8")), votes);
      assert.equal(awaitsReading(folder, single), false);
      assert.throws(() => serveDuels(folder, 0), /déjà enregistrées/);
    } finally {
      server.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
