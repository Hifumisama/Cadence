/** Audit of the production checks of `scenario-scene` on the answers already saved by the lab: what fires on first answers, what the resends
 * changed. No model call, no database. Counts only; whether a finding is right is judged by reading (`audits/checks-verdicts.json`). */

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { controleurPourSkill } from "../../lib/llm/checks";
import { partConservee } from "../../lib/agents/review";
import { gestesRepetes, nomsPersonnagesDeLEntree, phrasesPartagees, planImmobile, planVide } from "../../lib/agents/stillness";
import { recitDe } from "../../lib/clips/intent";
import { LAB_ROOT, readRun } from "./files";
import { table } from "./score";
import type { CallRecord, SceneOutput } from "./types";

const FINDING_TYPES = ["gestes répétés", "plan immobile", "plan vide", "phrases partagées", "liaison du premier plan", "temps fort", "structure"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

const MESSAGES: [FindingType, RegExp][] = [
  ["gestes répétés", /reprend les gestes de/],
  ["plan immobile", /le personnage reste/],
  ["plan vide", /aucun personnage n'y agit/],
  ["phrases partagées", /partagent des phrases/],
  ["liaison du premier plan", /^Le premier plan/],
  ["temps fort", /temps fort/],
  ["structure", /État en fin de plan|n'a pas de récit/],
];
export const typeOfMessage = (message: string): FindingType | "autre" => MESSAGES.find(([, re]) => re.test(message))?.[0] ?? "autre";

/** The start of every resend the executor builds (lib/llm/execute.ts). */
const RESEND_START = "Ta réponse ne respecte pas le schéma de sortie";
/** The gestures the « gestes répétés » message names: looked for in what a resend ADDS. */
const SUGGESTED: Record<string, RegExp> = {
  saut: /(?<!\p{L})(?:saut\p{L}*|bondi\p{L}*|bond)(?!\p{L})/iu,
  "glissade au sol": /glissade|gliss\p{L}*\s+(?:au|sur le)\s+sol/iu,
  "pied frappé": /(?:frapp|tap|plaqu)\p{L}*\s+(?:du|le|un|son)\s+pied|pieds?\s+frapp/iu,
  cambrure: /cambr\p{L}*/iu,
  "coup de jambe": /coup\s+de\s+(?:pied|jambe)|lanc\p{L}*\s+la\s+jambe/iu,
};
/** Words of that message that have no reason to be in a story. */
const MESSAGE_WORDS = /(?<!\p{L})(?:amplitude|en boucle|au sol ou en l['’]air)(?!\p{L})/iu;

function parseOutput(text: string): SceneOutput | null {
  try {
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as SceneOutput;
    return Array.isArray(json.plans) ? json : null;
  } catch {
    return null;
  }
}

const story = (output: SceneOutput) => output.plans.map((p) => recitDe(p.description)).join("\n");
const seconds = (output: SceneOutput) => output.plans.reduce((s, p) => s + (Number(p.dureeSecondes) || 0), 0);

/** One finding of one answer, with where it points (ranks from 1). */
export type Finding = { type: FindingType; plans: number[] };

function findingsOf(output: SceneOutput, input: unknown): Finding[] {
  const plans = output.plans.map((p, i) => ({ plan: String(i + 1), description: p.description }));
  const names = nomsPersonnagesDeLEntree(input);
  const heuristics: Finding[] = [
    ...plans.flatMap((p): Finding[] => (planVide(p.description, names) ? [{ type: "plan vide", plans: [Number(p.plan)] }] : planImmobile(p.description) ? [{ type: "plan immobile", plans: [Number(p.plan)] }] : [])),
    ...gestesRepetes(plans).map((r): Finding => ({ type: "gestes répétés", plans: [Number(r.a), Number(r.b)] })),
    ...phrasesPartagees(plans).map((r): Finding => ({ type: "phrases partagées", plans: [Number(r.a), Number(r.b)] })),
  ];
  // The structural ones come from the production check itself: it needs no rank.
  const structural = (controleurPourSkill("scenario-scene", input)?.(output) ?? [])
    .map(typeOfMessage)
    .filter((t): t is FindingType => t === "liaison du premier plan" || t === "temps fort" || t === "structure")
    .map((type): Finding => ({ type, plans: [] }));
  return [...structural, ...heuristics];
}

export type Answer = { run: string; caseId: string; variant: string; repetition: number; attempt: number; input: unknown; output: SceneOutput | null; findings: Finding[] };
export type Resend = { first: Answer; second: Answer; asked: FindingType[] };

/** Every first answer and every content resend saved under `labo/runs` (pilots excluded). */
export function collect(runsRoot = resolve(LAB_ROOT, "runs")): { firsts: Answer[]; resends: Resend[] } {
  const firsts: Answer[] = [];
  const resends: Resend[] = [];
  const folders = existsSync(runsRoot) ? readdirSync(runsRoot).filter((f) => existsSync(join(runsRoot, f, "manifest.json"))).sort() : [];
  for (const run of folders) {
    const { manifest, records } = readRun(join(runsRoot, run));
    if (manifest.pilot) continue;
    for (const record of records) {
      let previous: Answer | null = null;
      for (const [attempt, a] of record.attempts.entries()) {
        const answer = answerOf(run, record, attempt, a.text);
        const last = (a.request.messages as { content?: unknown }[] | undefined)?.at(-1)?.content;
        if (typeof last === "string" && last.startsWith(RESEND_START) && previous) {
          const asked = last.split("\n").filter((l) => l.startsWith("- ")).map((l) => typeOfMessage(l.slice(2)));
          resends.push({ first: previous, second: answer, asked: asked.filter((t): t is FindingType => t !== "autre") });
        } else firsts.push(answer);
        previous = answer;
      }
    }
  }
  return { firsts, resends };
}

function answerOf(run: string, record: CallRecord, attempt: number, text: string): Answer {
  const output = parseOutput(text);
  return { run, caseId: record.caseId, variant: record.variant, repetition: record.repetition, attempt, input: record.input, output, findings: output ? findingsOf(output, record.input) : [] };
}

/** What a resend did to the answer. Pure. */
export function effectOf({ first, second, asked }: Resend) {
  const before = first.output!;
  const after = second.output!;
  const count = (a: Answer, type: FindingType) => a.findings.filter((f) => f.type === type).length;
  const added = Object.entries(SUGGESTED).filter(([, re]) => re.test(story(after)) && !re.test(story(before))).map(([name]) => name);
  return {
    asked,
    cleared: asked.length > 0 && second.findings.length === 0,
    worse: second.findings.length > first.findings.length,
    newTypes: FINDING_TYPES.filter((t) => count(second, t) > 0 && count(first, t) === 0),
    suggestedAdded: added,
    messageWords: MESSAGE_WORDS.test(story(after)) && !MESSAGE_WORDS.test(story(before)),
    kept: partConservee(story(before), story(after)),
    plans: after.plans.length - before.plans.length,
    seconds: seconds(after) - seconds(before),
    inventions: (after.inventions?.length ?? 0) - (before.inventions?.length ?? 0),
    replacedTitles: before.plans.filter((p) => !after.plans.some((q) => q.titre === p.titre)).length,
  };
}

/** How often a listed gesture shows up in one first answer and not in another of the same scene and variant: what a plain new generation adds. */
function naturalVariation(firsts: Answer[]): { added: number; pairs: number } {
  const groups = new Map<string, SceneOutput[]>();
  for (const a of firsts) if (a.output) groups.set(`${a.run}|${a.caseId}|${a.variant}`, [...(groups.get(`${a.run}|${a.caseId}|${a.variant}`) ?? []), a.output]);
  let added = 0;
  let pairs = 0;
  for (const group of groups.values()) {
    for (const x of group) {
      for (const y of group) {
        if (x === y) continue;
        pairs += 1;
        if (Object.values(SUGGESTED).some((re) => re.test(story(y)) && !re.test(story(x)))) added += 1;
      }
    }
  }
  return { added, pairs };
}

/** What the reading by hand decides of a finding (`audits/checks-verdicts.json`). */
const VERDICTS: Record<string, string> = {
  juste: "Juste",
  "mot-sans-geste": "Fausse : le mot ne désigne pas un geste du personnage",
  "autre-apport": "Fausse : le plan apporte autre chose",
  continuation: "Fausse : continuation voulue d'un plan lié",
  agit: "Fausse : le personnage agit",
  demandé: "Demandé par la scène",
};

export const findingKey = (a: Answer, f: Finding): string => `${a.run.slice(11, 19)}|${a.caseId}|${a.variant}|r${a.repetition}|a${a.attempt}|${f.type}|${f.plans.join("+")}`;

const share = (n: number, of: number) => (of ? `${n}/${of} (${Math.round((100 * n) / of)} %)` : "–");

function verdictSection(firsts: Answer[], resends: Resend[], verdicts: Record<string, string>): string {
  const all = firsts.flatMap((a) => a.findings.map((f) => ({ type: f.type, verdict: verdicts[findingKey(a, f)] })));
  const judged = all.filter((f) => f.verdict);
  const used = FINDING_TYPES.filter((t) => all.some((f) => f.type === t));
  const sound = (r: Resend, wanted: string[]) => r.first.findings.some((f) => wanted.includes(verdicts[findingKey(r.first, f)] ?? ""));
  const none = resends.filter((r) => !sound(r, ["juste"]));
  return `## Jugement à la lecture (${judged.length} alertes jugées sur ${all.length})

${table(
    ["Jugement", ...used],
    Object.entries(VERDICTS).map(([code, label]) => [label, ...used.map((t) => judged.filter((f) => f.type === t && f.verdict === code).length)]),
  )}

Renvois dont **aucune** alerte n'est juste : ${share(none.length, resends.length)}.
`;
}

export function auditReport(firsts: Answer[], resends: Resend[], verdicts: Record<string, string> = {}): string {
  const readable = firsts.filter((a) => a.output);
  const effects = resends.filter((r) => r.first.output && r.second.output).map(effectOf);
  const withGestures = effects.filter((e) => e.asked.includes("gestes répétés"));
  const without = effects.filter((e) => !e.asked.includes("gestes répétés"));
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const group = (name: string, list: typeof effects) => [
    name,
    list.length,
    share(list.filter((e) => e.cleared).length, list.length),
    share(list.filter((e) => e.worse).length, list.length),
    share(list.filter((e) => e.newTypes.length).length, list.length),
    share(list.filter((e) => e.suggestedAdded.length).length, list.length),
    share(list.filter((e) => e.messageWords).length, list.length),
  ];
  return `# Contrôles de \`scenario-scene\` : comptes sur les réponses enregistrées

## Premières réponses (${readable.length} lisibles sur ${firsts.length})

${table(
    ["Alerte", "Réponses concernées", "Alertes", "Renvois qui la citent"],
    FINDING_TYPES.map((t) => [t, share(readable.filter((a) => a.findings.some((f) => f.type === t)).length, readable.length), readable.reduce((n, a) => n + a.findings.filter((f) => f.type === t).length, 0), resends.filter((r) => r.asked.includes(t)).length]),
  )}

Au moins une alerte : ${share(readable.filter((a) => a.findings.length).length, readable.length)}.

${Object.keys(verdicts).length ? `${verdictSection(firsts, resends, verdicts)}\n` : ""}## Ce que les renvois ont changé (${effects.length})

${table(
    ["Renvois", "Nombre", "Plus aucune alerte", "Plus d'alertes qu'avant", "Nouveau type d'alerte", "Ajoute un geste de la liste", "Reprend des mots du message"],
    [group("avec « gestes répétés »", withGestures), group("sans", without), group("tous", effects)],
  )}

Témoin, sans aucun renvoi : entre deux premières réponses indépendantes d'une même scène, un geste de la liste apparaît
dans ${share(naturalVariation(firsts).added, naturalVariation(firsts).pairs)} des cas.

Renvois qui raccourcissent la scène : ${share(effects.filter((e) => e.seconds < 0).length, effects.length)} ; qui suppriment des plans : ${share(effects.filter((e) => e.plans < 0).length, effects.length)}.

${table(
    ["Mesure par renvoi", "Médiane", "Minimum", "Maximum"],
    (
      [
        ["Part du récit conservée (%)", effects.map((e) => Math.round(100 * e.kept))],
        ["Plans en plus ou en moins", effects.map((e) => e.plans)],
        ["Secondes en plus ou en moins", effects.map((e) => e.seconds)],
        ["Titres de plan disparus", effects.map((e) => e.replacedTitles)],
        ["Inventions déclarées en plus", effects.map((e) => e.inventions)],
      ] as [string, number[]][]
    ).map(([name, values]) => [name, median(values), values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 0]),
  )}
`;
}
