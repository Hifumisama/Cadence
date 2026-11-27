import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEvaluation, evaluationReport, parseAnswer, quoteFound } from "./evaluation";

const brief = { title: "Scène", intention: "Elle peint.", entry: "", exit: "", moments: ["Elle s'assoit."], authorMoments: "", authorWords: [] };
const texts = ["T0", "T1", "T2"].map((version, i) => ({ version, plans: [{ title: `Titre ${i}`, description: `Elle s’assoit près de la source numéro ${i}.` }] }));

test("outside reading: blind file, answer checked, quotes verified, compared with the author's duels", () => {
  const { markdown, key } = buildEvaluation(brief, texts, ["run"], () => 0, "eval1");
  for (const secret of ["T0", "T1", "T2", "réflexion", "skill"]) assert.equal(markdown.includes(secret), false, secret);
  assert.deepEqual(Object.keys(key.texts), ["A", "B", "C"]);
  assert.deepEqual(Object.values(key.texts).sort(), ["T0", "T1", "T2"]);
  assert.match(markdown, /### Texte C/);

  const letter = (version: string) => Object.keys(key.texts).find((l) => key.texts[l] === version)!;
  const answer = {
    evaluationId: "eval1",
    ranking: [[letter("T1")], [letter("T0"), letter("T2")]],
    texts: Object.fromEntries(["T0", "T1", "T2"].map((v, i) => [letter(v), { betrays: false, defects: v === "T0" ? [{ type: "langue", quote: "« Elle s'assoit près de la source »" }, { type: "autre", quote: `phrase inventée ${i}` }] : [] }])),
  };
  const parsed = parseAnswer(`Voici ma réponse :\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``, key);
  const report = evaluationReport(key, parsed, texts, [{ sides: ["T0", "T1"], winner: "T0" }, { sides: ["T2", "T0"], winner: null }]);
  assert.match(report, /\| T0 contre T1 \| T0 \| T1 \|/);
  assert.match(report, /\| T0 contre T2 \| pas encore répondu \| égalité \|/);
  assert.match(report, /Elle s'assoit près de la source » » \| oui|source » \| oui/);
  assert.match(report, /phrase inventée 0 » \| \*\*non\*\*/);

  assert.equal(quoteFound("elle s'assoit  près", texts[0]!.plans), true);
  assert.equal(quoteFound("", texts[0]!.plans), false);
  assert.throws(() => parseAnswer("rien", key), /illisible/);
  assert.throws(() => parseAnswer(JSON.stringify({ ...answer, evaluationId: "autre" }), key), /ne porte pas/);
  assert.throws(() => parseAnswer(JSON.stringify({ ...answer, ranking: [[letter("T0")]] }), key), /Classement incomplet/);
});
