/** Campaign 02: applies its decision rule to the blind votes, and checks the pilot. Thresholds from `campaign.ts`; nothing here judges a
 * text. Pure. */

import { controleurPourSkill } from "../../lib/llm/checks";
import { controlerStructureScenario } from "../../lib/agents/screenplay-checks";
import { REASONING_CAMPAIGN, type NoteId, type ReasoningCampaign } from "./campaign";
import { callSeconds, isTruncated, median } from "./metrics";
import type { ReadingKey } from "./reading";
import { checkVotes, decimal, mean, table, yes, type Votes } from "./score";
import type { CallRecord, RunManifest } from "./types";

const EPSILON = 1e-9;
/** A server that cannot be reached is a breakdown, not a failure of a version. */
const OUTAGE = "injoignable";
/** The call timeout of production (lib/llm/config.ts). */
const CALL_TIMEOUT_SECONDS = 600;

export type ReasoningComparison = {
  notes: { id: NoteId; label: string; without: number; with: number }[];
  scenes: { caseId: string; scores: { id: NoteId; without: number; with: number }[] }[];
  failures: { without: number; with: number };
  /** Records of the reasoning version with at least one truncated answer. */
  truncated: number;
  medianSeconds: { without: number; with: number };
  /** Pairs (scene, repetition) left out of failures and times because the server was unreachable. */
  excluded: string[];
  /** Records the run should hold and does not. */
  missing: number;
  conditions: { gain: boolean; noDrop: boolean; noBigLoss: boolean; failures: boolean; noTruncation: boolean; time: boolean };
  adopted: boolean;
};

export function compareReasoning(manifest: RunManifest, records: CallRecord[], key: ReadingKey, votes: Votes, campaign: ReasoningCampaign = REASONING_CAMPAIGN): ReasoningComparison {
  if (manifest.pilot) throw new Error("Un pilote ne se note pas : ses sorties sont exclues de l'évaluation.");
  const { baseline, candidate, questions } = campaign;
  checkVotes(key, votes, questions.map((q) => q.id));
  const entries = Object.entries(key.proposals);
  const caseIds = [...new Set(entries.map(([, p]) => p.caseId))];
  const noteOf = (caseId: string, variant: string, note: NoteId): number => {
    const found = entries.find(([, p]) => p.caseId === caseId && p.variants.includes(variant));
    if (!found) throw new Error(`Version ${variant} absente de la lecture pour ${caseId}.`);
    return votes.votes[found[0]]![note]!;
  };
  const scenes = caseIds.map((caseId) => ({ caseId, scores: questions.map((q) => ({ id: q.id, without: noteOf(caseId, baseline, q.id), with: noteOf(caseId, candidate, q.id) })) }));
  const notes = questions.map((q, i) => ({ id: q.id, label: q.short, without: mean(scenes.map((s) => s.scores[i]!.without)), with: mean(scenes.map((s) => s.scores[i]!.with)) }));

  const pair = (r: CallRecord) => `${r.caseId} r${r.repetition}`;
  const excluded = [...new Set(records.filter((r) => r.errorCode === OUTAGE).map(pair))];
  const counted = (variant: string) => records.filter((r) => r.variant === variant && !excluded.includes(pair(r)));
  const failures = { without: counted(baseline).filter((r) => r.error).length, with: counted(candidate).filter((r) => r.error).length };
  const medianSeconds = { without: median(counted(baseline).map(callSeconds)), with: median(counted(candidate).map(callSeconds)) };
  const truncated = records.filter((r) => r.variant === candidate && isTruncated(r)).length;
  const missing = manifest.cases.length * manifest.repetitions * 2 - records.filter((r) => r.variant === baseline || r.variant === candidate).length;

  const conditions = {
    gain: notes.some((n) => n.with - n.without >= campaign.minGain - EPSILON),
    noDrop: notes.every((n) => n.without - n.with <= campaign.maxDrop + EPSILON),
    noBigLoss: scenes.every((s) => s.scores.every((x) => x.without - x.with < campaign.forbiddenLoss)),
    failures: failures.with <= failures.without,
    noTruncation: truncated === 0,
    time: counted(candidate).length > 0 && medianSeconds.with <= campaign.maxMedianSeconds + EPSILON,
  };
  return { notes, scenes, failures, truncated, medianSeconds, excluded, missing, conditions, adopted: missing === 0 && Object.values(conditions).every(Boolean) };
}

const seconds = (n: number) => `${Math.round(n)} s`;

export function reasoningVerdict(manifest: RunManifest, records: CallRecord[], key: ReadingKey, votes: Votes, campaign: ReasoningCampaign = REASONING_CAMPAIGN): string {
  const c = compareReasoning(manifest, records, key, votes, campaign);
  const { baseline: t0, candidate: t1 } = campaign;
  const rows: [string, string, boolean][] = [
    [`1. Une note moyenne gagne au moins ${decimal(campaign.minGain)}`, c.notes.map((n) => `${n.label} ${decimal(n.with - n.without)}`).join(" · "), c.conditions.gain],
    [`2. Aucune note moyenne ne baisse de plus de ${decimal(campaign.maxDrop)}`, "voir ci-dessus", c.conditions.noDrop],
    [`3. Aucune scène lue ne perd ${campaign.forbiddenLoss} points`, "voir le détail par scène", c.conditions.noBigLoss],
    ["4. Pas plus d'échecs techniques que T0", `${t0} ${c.failures.without}, ${t1} ${c.failures.with}`, c.conditions.failures],
    ["5. Aucune sortie tronquée avec réflexion", `${c.truncated}`, c.conditions.noTruncation],
    [`6. Temps médian par scène ≤ ${campaign.maxMedianSeconds} s`, `${t0} ${seconds(c.medianSeconds.without)}, ${t1} ${seconds(c.medianSeconds.with)}`, c.conditions.time],
  ];
  const comments = Object.entries(key.proposals).flatMap(([id, p]) => (votes.votes[id]?.comment?.trim() ? [`- ${p.caseId} (${p.variants.join(" = ")}) : ${votes.votes[id]!.comment!.trim()}`] : []));
  const verdict = c.missing
    ? `**Non concluant** : ${c.missing} enregistrement(s) manquant(s), l'essai est incomplet.`
    : c.adopted
      ? "**La réflexion devient le fonctionnement normal de `scenario-scene`** (à appliquer dans une décision séparée)."
      : "**La réflexion n'est pas adoptée** : une condition au moins n'est pas remplie.";

  return `# Verdict de l'essai ${manifest.id}

Base : variante ${manifest.base} de la campagne 01. Règle fixée avant lancement, exploratoire : ce n'est pas une preuve statistique.
Elle juge la construction des scènes, pas la progression de l'épisode.

${verdict}

${table(["Condition", "Mesuré", "Remplie"], rows.map(([a, b, ok]) => [a, b, yes(ok)]))}
${c.excluded.length ? `\nPannes (serveur injoignable), écartées des échecs et des temps pour les deux versions : ${c.excluded.join(", ")}.\n` : ""}
## Notes (${t1} / ${t0})

${table(
  ["Scène", ...c.notes.map((n) => n.label)],
  [...c.scenes.map((s) => [s.caseId, ...s.scores.map((x) => `${x.with} / ${x.without}`)]), ["**Moyenne**", ...c.notes.map((n) => `${decimal(n.with)} / ${decimal(n.without)}`)]],
)}

Le coût détaillé (temps, jetons, mémoire) est dans \`report.md\`.
${comments.length ? `\n## Commentaires de lecture\n\n${comments.join("\n")}\n` : ""}`;
}

export type PilotRow = {
  caseId: string;
  /** An output kept, which means valid against the schema. */
  schema: boolean;
  structureFindings: number;
  /** Every finding of the production check on the kept output (they trigger a resend in production). */
  productionFindings: number;
  truncated: boolean;
  error: string | null;
  seconds: number;
  /** Smallest context left over the attempts if an answer used the whole cap, and with what it really used. */
  marginAtCap: number;
  marginReal: number;
};

export function pilotRows(manifest: RunManifest, records: CallRecord[], campaign: ReasoningCampaign = REASONING_CAMPAIGN): PilotRow[] {
  return records.map((r) => {
    const output = r.output;
    const structure = output ? controlerStructureScenario({ scenes: [{ plans: output.plans }] }) : [];
    const production = output ? (controleurPourSkill("scenario-scene", r.input)?.(output) ?? []) : [];
    const smallest = (values: number[]) => (values.length ? Math.min(...values) : Number.NaN);
    return {
      caseId: r.caseId,
      schema: output != null && !r.error,
      structureFindings: structure.length,
      productionFindings: production.length,
      truncated: isTruncated(r),
      error: r.error,
      seconds: callSeconds(r),
      marginAtCap: smallest(r.attempts.map((a) => campaign.contextSize - a.tokensIn - (a.request.maxTokens ?? manifest.maxTokens ?? campaign.maxTokens))),
      marginReal: smallest(r.attempts.map((a) => campaign.contextSize - a.tokensIn - a.tokensOut)),
    };
  });
}

/** The pilot passes when every output is structurally valid, none is truncated or failed, and none exceeds the call timeout. */
const pilotPasses =(rows: PilotRow[], expected: number): boolean =>
  rows.length === expected && rows.every((r) => r.schema && r.structureFindings === 0 && !r.truncated && !r.error && r.seconds <= CALL_TIMEOUT_SECONDS);

/** Counts only: the pilot's texts are not read. */
export function pilotReport(manifest: RunManifest, records: CallRecord[], campaign: ReasoningCampaign = REASONING_CAMPAIGN): string {
  const rows = pilotRows(manifest, records, campaign);
  const ok = pilotPasses(rows, manifest.cases.length * manifest.repetitions);
  const number = (n: number) => (Number.isFinite(n) ? Math.round(n) : "–");
  return `# Pilote ${manifest.id}

Base ${manifest.base}, réflexion activée. **Sorties exclues de l'évaluation, à ne pas lire.**

Verdict : ${ok ? "**prêt pour la campagne**" : "**à corriger avant la campagne**"}.

${table(
  ["Scène", "Schéma", "Défauts de structure", "Alertes de production", "Tronquée", "Temps (s)", "Marge au plafond (jetons)", "Marge réelle (jetons)"],
  rows.map((r) => [r.caseId, yes(r.schema), r.structureFindings, r.productionFindings, r.truncated ? "**oui**" : "non", number(r.seconds), number(r.marginAtCap), number(r.marginReal)]),
)}

- Bloquant : sortie hors schéma ou en échec, défaut de structure, troncature, plus de ${CALL_TIMEOUT_SECONDS} s.
- Pour information : les alertes de production (elles déclenchent un renvoi, comme en production) ; le temps médian
  ${seconds(median(rows.map((r) => r.seconds)))} (seuil de la règle : ${campaign.maxMedianSeconds} s).
- Marge négative au plafond : une réponse qui utiliserait tout le plafond serait coupée par la fin du contexte.
- Jetons, réflexion et mémoire : \`report.md\`.
`;
}
