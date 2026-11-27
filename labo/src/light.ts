/** Experiment 04: the FIRST answers of three versions of one scene, read in blind duels, and the technical measures of the new calls.
 * No threshold: it looks for signs. Nothing here judges a text. */

import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { controleurPourSkill } from "../../lib/llm/checks";
import { DUEL_REASONS, LIGHT_EXPERIMENT, REASONING_CAMPAIGN } from "./campaign";
import { checkDuelVotes, type DuelData, type DuelKey, type DuelVotes } from "./duel";
import { LAB_ROOT, readDataset, readRun } from "./files";
import { callSeconds, isTruncated } from "./metrics";
import { renderPage } from "./page";
import { sceneBrief, shuffle, type ShownPlans } from "./reading";
import { table, yes } from "./score";
import { contextRows } from "./score-reasoning";
import type { CallRecord, Case, RunManifest, SceneOutput } from "./types";

type Version = { id: string; record: CallRecord };

/** The first answer of a record, before any resend; null if it is not a readable scene. */
export function firstAnswer(record: CallRecord): SceneOutput | null {
  const text = record.attempts[0]?.text ?? "";
  try {
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as SceneOutput;
    return Array.isArray(json.plans) && json.plans.every((p) => typeof p.titre === "string" && typeof p.description === "string") ? json : null;
  } catch {
    return null;
  }
}

/** T0 from the reused run, T1 and T2 from this one. */
export function versionsOf(folder: string): { manifest: RunManifest; versions: Version[] } {
  const { manifest, records } = readRun(folder);
  if (manifest.campaign !== "04" || !manifest.reuse) throw new Error("Cet essai n'est pas celui de l'expérience 04.");
  const { run, variant, repetition } = manifest.reuse;
  const reused = readRun(join(dirname(resolve(folder)), run)).records.find((r) => r.caseId === manifest.cases[0] && r.variant === variant && r.repetition === repetition);
  if (!reused) throw new Error(`L'appel réutilisé (${run}) est introuvable.`);
  return { manifest, versions: [{ id: LIGHT_EXPERIMENT.reused.id, record: reused }, ...records.map((record) => ({ id: record.variant, record }))] };
}

export function buildLightDuels(item: Case, runId: string, versions: Version[], random: (max: number) => number = randomInt, readingId: string = randomBytes(6).toString("hex")): { data: DuelData; key: DuelKey } {
  const textOf = (id: string): ShownPlans => {
    const version = versions.find((v) => v.id === id);
    const answer = version && firstAnswer(version.record);
    if (!answer) throw new Error(`${id} : pas de première réponse lisible, il n'y a pas de duel à faire.`);
    return answer.plans.map((p) => ({ title: p.titre, description: p.description }));
  };
  const key: DuelKey = { readingId, run: runId, repetition: 1, duels: {} };
  const duels = shuffle(LIGHT_EXPERIMENT.duels, random).map((pair, index) => {
    const sides = shuffle(pair, random) as [string, string];
    const id = `d${index + 1}`;
    key.duels[id] = { caseId: item.id, sides };
    return { id, ...sceneBrief(item), texts: [textOf(sides[0]), textOf(sides[1])] as [ShownPlans, ShownPlans] };
  });
  return { data: { readingId, reasons: DUEL_REASONS, duels }, key };
}

/** Draws the duels once; a second call keeps them. */
export function writeLightDuels(folder: string): string {
  const target = join(folder, "duels");
  const file = join(target, "duels.html");
  const keyFile = join(target, "key.json");
  if (existsSync(keyFile)) return file;
  const { manifest, versions } = versionsOf(folder);
  const item = readDataset(manifest.dataset).cases.find((c) => c.id === manifest.cases[0])!;
  const { data, key } = buildLightDuels(item, manifest.id, versions);
  const template = readFileSync(resolve(LAB_ROOT, "src", "page", "duel.html"), "utf8");
  mkdirSync(target, { recursive: true });
  writeFileSync(file, renderPage(data, template));
  writeFileSync(keyFile, `${JSON.stringify(key, null, 2)}\n`);
  return file;
}

const gigabytes = (value: number | null | undefined) => value ?? "–";

/** What each new call cost and whether it held technically. No plan, no text: it can be read before the duels. */
export function technicalReport(manifest: RunManifest, records: CallRecord[]): string {
  return `# Technique de l'essai ${manifest.id}

${table(
    ["Version", "Réponse lisible", "Coupée", "Renvoi de format", "Erreur", "Temps (s)", "Jetons de réflexion", "Pic VRAM (Go)", "Pic RAM (Go)"],
    records.map((r) => {
      const first = r.attempts[0];
      return [
        r.variant,
        yes(firstAnswer(r) !== null),
        isTruncated(r) ? "**oui**" : "non",
        r.resends,
        r.error ?? "–",
        Math.round(callSeconds(r)),
        first?.reasoningCount ? `${first.reasoningCount.tokens} (${first.reasoningCount.method === "tokenizer" ? "découpeur" : first.reasoningCount.method === "share" ? "estimation" : "aucun"})` : "–",
        gigabytes(first?.memory?.vramPeakGb),
        gigabytes(first?.memory?.ramPeakGb),
      ];
    }),
  )}

## Contexte, appel par appel (${REASONING_CAMPAIGN.contextSize} jetons)

${table(
    ["Enregistrement", "Appel", "Jetons envoyés", "Jetons écrits", "Marge au plafond", "Marge réelle", "Motif d'arrêt"],
    contextRows(manifest, records).map((c) => [c.record, c.kind, c.sent, c.written, c.marginAtCap, c.marginReal, c.stop]),
  )}

T0 vient d'un essai précédent. Les pics de mémoire sont ceux observés par relevés, pas des pics garantis.
`;
}

/** After the duels: who was preferred, then what the code measures on each first answer. */
export function lightReport(folder: string, votes: DuelVotes): string {
  const key = JSON.parse(readFileSync(join(folder, "duels", "key.json"), "utf8")) as DuelKey;
  checkDuelVotes(key, votes);
  const { manifest, versions } = versionsOf(folder);
  const item = readDataset(manifest.dataset).cases.find((c) => c.id === manifest.cases[0])!;
  const labels = LIGHT_EXPERIMENT.labels as Record<string, string>;
  const answers: Record<string, string> = { equal: "égalité", none: "aucun", skip: "passé" };
  const reason = (id: string) => DUEL_REASONS.find((r) => r.id === id)?.label ?? id;
  const duels = Object.entries(key.duels)
    .map(([id, duel]) => {
      const vote = votes.duels[id]!;
      const winner = vote.choice === "1" || vote.choice === "2" ? duel.sides[Number(vote.choice) - 1]! : answers[vote.choice]!;
      return {
        pair: [...duel.sides].sort().join(" contre "),
        winner,
        betrayed: (vote.betrayal ?? []).map((s) => duel.sides[Number(s) - 1]!).join(" et ") || "–",
        reasons: (vote.reasons ?? []).map(reason).join(", ") || "–",
        comment: vote.comment?.trim() ?? "",
      };
    })
    .sort((a, b) => a.pair.localeCompare(b.pair));
  const check = controleurPourSkill("scenario-scene", item.input)!;
  const comments = duels.filter((d) => d.comment).map((d) => `- ${d.pair} : ${d.comment}`);
  return `# Expérience 04, essai ${manifest.id}

Une scène, une génération par version, premières réponses. **Aucun seuil : des signes, pas une preuve.**

${Object.entries(labels).map(([id, label]) => `- **${id}** : ${label}`).join("\n")}

## Duels

${table(
    ["Duel", "Préféré", "Signalé comme trahissant", "Motifs"],
    duels.map((d) => [d.pair, d.winner, d.betrayed, d.reasons]),
  )}
${comments.length ? `\n${comments.join("\n")}\n` : ""}
## Mesures des premières réponses (cible ${item.input.scene.dureeCibleSecondes} s)

${table(
    ["Version", "Plans", "Durée brute (s)", "Temps (s)", "Jetons écrits", "Alertes que la production aurait renvoyées"],
    versions.map(({ id, record }) => {
      const answer = firstAnswer(record)!;
      const first = record.attempts[0]!;
      return [id, answer.plans.length, answer.plans.reduce((s, p) => s + (Number(p.dureeSecondes) || 0), 0), Math.round(first.durationMs / 1000), first.tokensOut, check(answer).length];
    }),
  )}
`;
}
