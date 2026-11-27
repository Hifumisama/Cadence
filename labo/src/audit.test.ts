import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { messageDeRenvoi } from "../../lib/llm/execute";
import { auditReport, collect, effectOf, findingKey, typeOfMessage } from "./audit";

const input = { scene: { titre: "S", position: "1 sur 1", dureeCibleSecondes: 20 }, briefExtrait: { personnages: [{ nom: "Mina" }] } };
const output = (...descriptions: string[]) => ({ plans: descriptions.map((description, i) => ({ titre: `P${i}`, description, liaison: "coupe", dureeSecondes: 8 })), inventions: [], notes: "" });
// The second plan only shares a rippling dress with the first: the production check calls it a repeated gesture.
const first = output("Mina avance et sa robe ondule.", "Mina ondule les hanches près du feu.");
const second = output("Mina avance et sa robe ondule.", "Mina bondit par-dessus le feu.");

test("audit: the resend message of production is recognised, its effect measured, the verdicts counted", () => {
  const root = mkdtempSync(join(tmpdir(), "labo-"));
  try {
    const run = join(root, "2026-01-01-00-00-00-test");
    mkdirSync(join(run, "calls"), { recursive: true });
    writeFileSync(join(run, "manifest.json"), JSON.stringify({ id: "test", cases: ["s"], variants: [], repetitions: 1 }));
    const message = messageDeRenvoi(["Le plan « P1 » reprend les gestes de Le plan « P0 » (ondulation) sans en apporter de nouveau."]);
    const attempt = (text: object, messages: object[]) => ({ request: { messages }, text: JSON.stringify(text) });
    const asked = [{ role: "user", content: "{}" }];
    writeFileSync(join(run, "calls", "s__A__r1.json"), JSON.stringify({ caseId: "s", variant: "A", repetition: 1, input, attempts: [attempt(first, asked), attempt(second, [...asked, { role: "assistant", content: "" }, { role: "user", content: message }])] }));

    const { firsts, resends } = collect(root);
    assert.equal(firsts.length, 1);
    assert.equal(resends.length, 1);
    assert.deepEqual(firsts[0]!.findings, [{ type: "gestes répétés", plans: [1, 2] }]);
    assert.deepEqual(resends[0]!.asked, ["gestes répétés"]);
    const effect = effectOf(resends[0]!);
    assert.deepEqual([effect.cleared, effect.suggestedAdded, effect.plans], [true, ["saut"], 0]);
    const verdicts = { [findingKey(firsts[0]!, firsts[0]!.findings[0]!)]: "mot-sans-geste" };
    assert.match(auditReport(firsts, resends, verdicts), /aucune\*\* alerte n'est juste : 1\/1/);
    assert.equal(typeOfMessage("Tout autre chose."), "autre");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
