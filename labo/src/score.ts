/** Applies the decision rule of the campaign to the blind votes. The thresholds come from `campaign.ts`; nothing here judges a text. Pure. */

import { CAMPAIGN, type Campaign } from "./campaign";
import { measureScene } from "./metrics";
import type { ReadingKey } from "./reading";
import type { CallRecord, Dataset, RunManifest } from "./types";

type Vote = { progression: number; fidelity: number; comment?: string };
export type Votes = { readingId: string; votes: Record<string, Vote> };

type Scores = { progression: number; fidelity: number };

export type Comparison = {
  variant: string;
  against: string;
  /** Read scenes: scores of both; `same` when both are the very same text. */
  scenes: { caseId: string; variant: Scores; against: Scores; same: boolean }[];
  mean: { variant: Scores; against: Scores };
  /** Mean absolute raw gap over the (scene, repetition) pairs where both have an output. */
  gap: { variant: number; against: number; pairs: number };
  repetitions: { repetition: number; variant: number; against: number; reached: boolean }[];
  conditions: { scores: boolean; noBigLoss: boolean; gap: boolean; stability: boolean };
};

const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
// Floating point: a reduction of exactly one third must count.
const EPSILON = 1e-9;

function checkVotes(key: ReadingKey, votes: Votes): void {
  if (votes.readingId !== key.readingId) throw new Error("Ces notes ne viennent pas de cette lecture.");
  const valid = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
  const missing = Object.keys(key.proposals).filter((id) => !valid(votes.votes[id]?.progression) || !valid(votes.votes[id]?.fidelity));
  if (missing.length) throw new Error(`Notes manquantes ou hors de 1 à 5 : ${missing.join(", ")}.`);
}

export function compare(variant: string, against: string, manifest: RunManifest, records: CallRecord[], dataset: Dataset, key: ReadingKey, votes: Votes, campaign: Campaign = CAMPAIGN): Comparison {
  checkVotes(key, votes);
  const entries = Object.entries(key.proposals);
  const caseIds = [...new Set(entries.map(([, p]) => p.caseId))];
  const scenes = caseIds.map((caseId) => {
    const idOf = (v: string) => {
      const found = entries.find(([, p]) => p.caseId === caseId && p.variants.includes(v));
      if (!found) throw new Error(`Variante ${v} absente de la lecture pour ${caseId}.`);
      return found[0];
    };
    const [mine, theirs] = [idOf(variant), idOf(against)];
    return { caseId, variant: votes.votes[mine]!, against: votes.votes[theirs]!, same: mine === theirs };
  });
  const scores = (side: "variant" | "against"): Scores => ({ progression: mean(scenes.map((s) => s[side].progression)), fidelity: mean(scenes.map((s) => s[side].fidelity)) });
  const means = { variant: scores("variant"), against: scores("against") };

  const byId = new Map(dataset.cases.map((c) => [c.id, c]));
  const output = (caseId: string, v: string, repetition: number) => records.find((r) => r.caseId === caseId && r.variant === v && r.repetition === repetition)?.output ?? null;
  const pairs = manifest.cases.flatMap((caseId) =>
    Array.from({ length: manifest.repetitions }, (_, i) => i + 1).flatMap((repetition) => {
      const [a, b] = [output(caseId, variant, repetition), output(caseId, against, repetition)];
      if (!a || !b) return [];
      const input = byId.get(caseId)!.input;
      return [{ repetition, variant: Math.abs(measureScene(input, a).rawGap), against: Math.abs(measureScene(input, b).rawGap) }];
    }),
  );
  const reached = (mine: number, theirs: number) => theirs > 0 && mine <= theirs * (1 - campaign.gapReduction) + EPSILON;
  const repetitions = [...new Set(pairs.map((p) => p.repetition))].sort((a, b) => a - b).map((repetition) => {
    const of = pairs.filter((p) => p.repetition === repetition);
    const [mine, theirs] = [mean(of.map((p) => p.variant)), mean(of.map((p) => p.against))];
    return { repetition, variant: mine, against: theirs, reached: reached(mine, theirs) };
  });
  const gap = { variant: mean(pairs.map((p) => p.variant)), against: mean(pairs.map((p) => p.against)), pairs: pairs.length };

  return {
    variant,
    against,
    scenes: scenes.map((s) => ({ caseId: s.caseId, variant: s.variant, against: s.against, same: s.same })),
    mean: means,
    gap,
    repetitions,
    conditions: {
      scores: (["progression", "fidelity"] as const).every((k) => means.variant[k] >= means.against[k] - campaign.scoreTolerance - EPSILON),
      noBigLoss: scenes.every((s) => (["progression", "fidelity"] as const).every((k) => s.against[k] - s.variant[k] < campaign.forbiddenLoss)),
      gap: reached(gap.variant, gap.against),
      stability: repetitions.filter((r) => r.reached).length >= campaign.minRepetitions,
    },
  };
}

const decimal = (n: number) => (Math.round(n * 100) / 100).toString().replace(".", ",");
const percent = (n: number) => `${Math.round(n * 100)} %`;
const yes = (ok: boolean) => (ok ? "oui" : "**non**");
const table = (head: string[], rows: (string | number)[][]): string => [head, head.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");

function section(c: Comparison): string {
  return `${table(
    ["Scène", `Progression ${c.variant} / ${c.against}`, `Fidélité ${c.variant} / ${c.against}`, "Même texte"],
    [
      ...c.scenes.map((s) => [s.caseId, `${s.variant.progression} / ${s.against.progression}`, `${s.variant.fidelity} / ${s.against.fidelity}`, s.same ? "oui" : "non"]),
      ["**Moyenne**", `${decimal(c.mean.variant.progression)} / ${decimal(c.mean.against.progression)}`, `${decimal(c.mean.variant.fidelity)} / ${decimal(c.mean.against.fidelity)}`, ""],
    ],
  )}

Écart brut moyen absolu : ${c.variant} ${percent(c.gap.variant)}, ${c.against} ${percent(c.gap.against)} (${c.gap.pairs} paires). Par répétition : ${c.repetitions.map((r) => `r${r.repetition} ${percent(r.variant)} / ${percent(r.against)}`).join(" · ")}.`;
}

export function scoreReport(manifest: RunManifest, records: CallRecord[], dataset: Dataset, key: ReadingKey, votes: Votes, campaign: Campaign = CAMPAIGN): string {
  const { baseline } = campaign;
  const others = manifest.variants.map((v) => v.id).filter((v) => v !== baseline);
  const against = others.map((v) => compare(v, baseline, manifest, records, dataset, key, votes, campaign));
  const verdicts = against.map((c) => {
    const k = c.conditions;
    return [c.variant, yes(k.scores), yes(k.noBigLoss), yes(k.gap), yes(k.stability), k.scores && k.noBigLoss && k.gap && k.stability ? "**retenue**" : "**non retenue**"];
  });

  let pair = "";
  if (others.includes("B") && others.includes("C")) {
    const c = compare("C", "B", manifest, records, dataset, key, votes, campaign);
    const ofC = records.filter((r) => r.variant === "C");
    const retried = ofC.filter((r) => r.retry?.triggered);
    const attempts = retried.flatMap((r) => r.attempts);
    const per = (total: number) => (retried.length ? Math.round(total / retried.length) : 0);
    pair = `\n## C contre B

Notes au moins égales : ${yes(c.conditions.scores)}. Aucune grosse perte : ${yes(c.conditions.noBigLoss)}.

${section(c)}

Coût des relances : ${retried.length}/${ofC.length} déclenchées (${retried.filter((r) => r.error).length} en échec) ; par relance, ${per(attempts.reduce((s, a) => s + a.tokensIn, 0))} jetons lus, ${per(attempts.reduce((s, a) => s + a.tokensOut, 0))} écrits, ${per(attempts.reduce((s, a) => s + a.durationMs, 0) / 1000)} s.
Gain de notes : progression ${decimal(c.mean.variant.progression - c.mean.against.progression)}, fidélité ${decimal(c.mean.variant.fidelity - c.mean.against.fidelity)}.
**Ce gain vaut-il ce coût ? À apprécier** : le code ne tranche pas.\n`;
  }

  const comments = Object.entries(key.proposals).flatMap(([id, p]) => (votes.votes[id]?.comment?.trim() ? [`- ${p.caseId} (${p.variants.join(" = ")}) : ${votes.votes[id]!.comment!.trim()}`] : []));

  return `# Verdict de l'essai ${manifest.id}

Règle fixée avant lancement, exploratoire : ce n'est pas une preuve statistique.

## Contre ${baseline}

${table(["Variante", "1. Notes", "2. Pas de grosse perte", "3. Écart réduit", "4. Stable", "Verdict"], verdicts)}

${against.map((c) => `### ${c.variant}\n\n${section(c)}`).join("\n\n")}
${pair}${comments.length ? `\n## Commentaires de lecture\n\n${comments.join("\n")}\n` : ""}`;
}
