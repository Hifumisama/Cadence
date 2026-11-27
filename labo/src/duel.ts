/** Blind duels: two versions of a scene side by side, one question, "which do you keep?". The correspondence goes into a key file that the
 * page does not contain. The rule counts answers; nothing here judges a text. */

import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CONFIRMATION, DUEL_REASONS, type Confirmation } from "./campaign";
import { LAB_ROOT, readDataset, readRun } from "./files";
import { renderPage } from "./page";
import { sceneBrief, shownPlans, shuffle, type SceneBrief, type ShownPlans } from "./reading";
import { table, yes } from "./score";
import type { CallRecord, Dataset, RunManifest } from "./types";

/** `1`, `2`: the text kept; `equal`: both are worth the same; `none`: neither satisfies; `skip`: not judged. */
const CHOICES = ["1", "2", "equal", "none", "skip"] as const;
type Side = "1" | "2";

export type DuelData = {
  readingId: string;
  reasons: { id: string; label: string }[];
  duels: (SceneBrief & { id: string; texts: [ShownPlans, ShownPlans] })[];
};

export type DuelKey = {
  readingId: string;
  run: string;
  repetition: number;
  /** `sides`: the variant of text 1, then of text 2. */
  duels: Record<string, { caseId: string; sides: [string, string] }>;
};

export type DuelVote = {
  choice: (typeof CHOICES)[number];
  reasons?: string[];
  /** Texts flagged as gravely betraying what the scene must tell. */
  betrayal?: Side[];
  comment?: string;
};

export type DuelVotes = { readingId: string; duels: Record<string, DuelVote> };

export function buildDuels(
  dataset: Dataset,
  manifest: RunManifest,
  records: CallRecord[],
  plan: Confirmation = CONFIRMATION,
  random: (max: number) => number = randomInt,
  readingId: string = randomBytes(6).toString("hex"),
): { data: DuelData; key: DuelKey } {
  // The candidate is on each side as often as on the other.
  const first = shuffle(plan.scenes.map((_, i) => i % 2 === 0), random);
  const key: DuelKey = { readingId, run: manifest.id, repetition: plan.repetition, duels: {} };
  const duels = plan.scenes.map((prefix, index) => {
    const item = dataset.cases.find((c) => manifest.cases.includes(c.id) && (c.id === prefix || c.id.startsWith(`${prefix}-`)));
    if (!item) throw new Error(`La scène « ${prefix} » du protocole n'est pas dans cet essai.`);
    const sides: [string, string] = first[index] ? [plan.candidate, plan.baseline] : [plan.baseline, plan.candidate];
    const texts = sides.map((variant) => {
      const record = records.find((r) => r.caseId === item.id && r.variant === variant && r.repetition === plan.repetition);
      if (!record?.output) throw new Error(`Scène ${item.id} : pas de sortie de ${variant} à la répétition ${plan.repetition}.`);
      return shownPlans(record);
    }) as [ShownPlans, ShownPlans];
    if (JSON.stringify(texts[0]) === JSON.stringify(texts[1])) throw new Error(`Scène ${item.id} : les deux textes sont identiques, il n'y a pas de duel.`);
    const id = `d${index + 1}`;
    key.duels[id] = { caseId: item.id, sides };
    return { id, ...sceneBrief(item), texts };
  });
  return { data: { readingId, reasons: DUEL_REASONS, duels }, key };
}

export function checkDuelVotes(key: DuelKey, votes: DuelVotes): void {
  if (votes?.readingId !== key.readingId) throw new Error("Ces réponses ne viennent pas de cette lecture.");
  const missing = Object.keys(key.duels).filter((id) => !CHOICES.includes(votes.duels?.[id]?.choice as DuelVote["choice"]));
  if (missing.length) throw new Error(`Réponses manquantes ou inconnues : ${missing.join(", ")}.`);
  const sides = (value: unknown) => value === undefined || (Array.isArray(value) && value.every((s) => s === "1" || s === "2"));
  const bad = Object.keys(key.duels).filter((id) => !sides(votes.duels[id]!.betrayal));
  if (bad.length) throw new Error(`Signalement illisible : ${bad.join(", ")}.`);
}

export function decideDuels(key: DuelKey, votes: DuelVotes, plan: Confirmation = CONFIRMATION) {
  checkDuelVotes(key, votes);
  const rows = Object.entries(key.duels).map(([id, duel]) => {
    const vote = votes.duels[id]!;
    const winner = vote.choice === "1" ? duel.sides[0] : vote.choice === "2" ? duel.sides[1] : vote.choice;
    const betrayed = (vote.betrayal ?? []).map((side) => duel.sides[Number(side) - 1]!);
    return { caseId: duel.caseId, winner, betrayed, reasons: vote.reasons ?? [], comment: vote.comment?.trim() ?? "" };
  });
  const count = (winner: string) => rows.filter((r) => r.winner === winner).length;
  const wins = { candidate: count(plan.candidate), baseline: count(plan.baseline), equal: count("equal"), none: count("none"), skip: count("skip") };
  // A degradation: the candidate flagged where the baseline is not.
  const degraded = rows.filter((r) => r.betrayed.includes(plan.candidate) && !r.betrayed.includes(plan.baseline)).map((r) => r.caseId);
  return { rows, wins, degraded, reached: wins.candidate >= plan.minWins && degraded.length === 0 };
}

export function duelReport(key: DuelKey, votes: DuelVotes, plan: Confirmation = CONFIRMATION): string {
  const { rows, wins, degraded, reached } = decideDuels(key, votes, plan);
  const { baseline, candidate } = plan;
  const labels: Record<string, string> = { equal: "égalité", none: "aucun", skip: "passé" };
  const reason = (id: string) => DUEL_REASONS.find((r) => r.id === id)?.label ?? id;
  const comments = rows.filter((r) => r.comment).map((r) => `- ${r.caseId} (préféré : ${labels[r.winner] ?? r.winner}) : ${r.comment}`);
  return `# Duels de confirmation ${candidate} contre ${baseline}, essai ${key.run}

Répétition ${key.repetition}, règle fixée avant lecture, exploratoire. **Ne modifie pas le verdict de la campagne 01 et n'adopte rien.**

${reached ? `**Seuil atteint** : poursuivre le travail sur ${candidate} est justifié.` : "**Seuil non atteint**."}

${table(
    ["Condition", "Mesuré", "Remplie"],
    [
      [`1. ${candidate} gagne au moins ${plan.minWins} duels sur ${rows.length}`, `${candidate} ${wins.candidate} · ${baseline} ${wins.baseline} · égalités ${wins.equal} · aucun ${wins.none} · passés ${wins.skip}`, yes(wins.candidate >= plan.minWins)],
      [`2. ${candidate} n'est jamais seul signalé comme trahissant la scène`, degraded.length ? degraded.join(", ") : "aucun signalement de ce type", yes(degraded.length === 0)],
    ],
  )}

${table(
    ["Scène", "Préféré", "Signalé comme trahissant", "Motifs"],
    rows.map((r) => [r.caseId, labels[r.winner] ?? r.winner, r.betrayed.join(" et ") || "–", r.reasons.map(reason).join(", ") || "–"]),
  )}
${comments.length ? `\n## Commentaires\n\n${comments.join("\n")}\n` : ""}`;
}

/** Draws the duels of a run once; a second call keeps them, so that answers already given stay valid. */
export function writeDuels(folder: string): string {
  const target = join(folder, "confirmation");
  const file = join(target, "duels.html");
  const keyFile = join(target, "key.json");
  if (existsSync(keyFile)) return file;
  const { manifest, records } = readRun(folder);
  if (manifest.campaign || manifest.pilot) throw new Error("Les duels de confirmation portent sur un essai de la campagne 01.");
  const { data, key } = buildDuels(readDataset(manifest.dataset), manifest, records);
  const template = readFileSync(resolve(LAB_ROOT, "src", "page", "duel.html"), "utf8");
  mkdirSync(target, { recursive: true });
  writeFileSync(file, renderPage(data, template));
  writeFileSync(keyFile, `${JSON.stringify(key, null, 2)}\n`);
  return file;
}
