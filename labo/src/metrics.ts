/** Automatic measures of a scene. Everything that exists in production is IMPORTED, never copied: the lab measures what Cadence does.
 * These are mechanical readings (seconds, counts, French-text heuristics): none of them says that a scene is good. Pure, tested. */

import { bornesDuree } from "../../lib/agents/conversion";
import { gestesRepetes, nomsPersonnagesDeLEntree, phrasesPartagees, planImmobile, planVide } from "../../lib/agents/stillness";
import { ajusterDureesScene } from "../../lib/agents/treatment";
import { DUREE_GENERATION_MAX } from "../../lib/clips/clip-checks";
import { recitDe } from "../../lib/clips/intent";
import type { CallRecord, SceneInput, SceneOutput } from "./types";

/** Below this share of the target, the raw duration is short: the trigger of variant C's retry. */
export const SHORT_RAW_RATIO = 0.85;

/** Theoretical minimum number of plans: the target filled with plans of the maximum length. */
export const minimumPlans = (targetSeconds: number): number => Math.ceil(targetSeconds / DUREE_GENERATION_MAX);

export type SceneMetrics = {
  targetSeconds: number;
  /** null when the input has no list of moments (treatments written before 2026-11-17). */
  moments: number | null;
  minimumPlans: number;
  plans: number;
  /** Sum of the durations written by the model. */
  rawSeconds: number;
  /** Sum after the production adjustment (`ajusterDureesScene`). */
  adjustedSeconds: number;
  /** Seconds the code added to the plans (negative: removed) without a word of text changing. */
  codeSeconds: number;
  /** Longest total these plans can reach (every plan at the maximum). */
  maxReachableSeconds: number;
  targetReachable: boolean;
  /** (total − target) / target. */
  rawGap: number;
  adjustedGap: number;
  /** Same bounds as the production duration warning, on the adjusted total. */
  withinBounds: boolean;
  narrativeWords: number;
  /** Narrative words (no dialogue, no author's instruction) per second, before and after the adjustment. */
  wordsPerRawSecond: number;
  wordsPerAdjustedSecond: number;
  dialogueLines: number;
  stillPlans: string[];
  emptyPlans: string[];
  /** Pairs of plans sharing a whole sentence or a long run of words. */
  duplicatePairs: string[];
  /** Consecutive pairs bringing no new family of movement. */
  repeatedGesturePairs: string[];
  shortOnRaw: boolean;
  /** Entries of `inventions` the model declares itself: what it admits adding, not what it added. */
  declaredInventions: number;
};

/** Model time of one record: its attempts, resends and own retry included, plus the calls that threw. */
export const callSeconds = (record: CallRecord): number => (record.attempts.reduce((a, x) => a + x.durationMs, 0) + (record.failedMs ?? 0)) / 1000;

/** True when any answer of the record, a resend included, stopped on the output cap or the end of the context. */
export const isTruncated = (record: CallRecord): boolean => record.attempts.some((a) => a.stop === "length");

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const words = (text: string): number => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const round = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;

export function measureScene(input: SceneInput, output: SceneOutput): SceneMetrics {
  const target = input.scene.dureeCibleSecondes;
  const plans = output.plans;
  const raw = plans.map((p) => Number(p.dureeSecondes) || 0);
  const rawSeconds = sum(raw);
  const adjustedSeconds = sum(ajusterDureesScene(raw, target));
  const labelled = plans.map((p, i) => ({ plan: `P${i + 1}`, description: p.description ?? "" }));
  const names = nomsPersonnagesDeLEntree(input);
  const narrativeWords = sum(labelled.map((p) => words(recitDe(p.description))));
  const bounds = bornesDuree(target);
  const empty = labelled.filter((p) => planVide(p.description, names)).map((p) => p.plan);
  return {
    targetSeconds: target,
    moments: input.scene.moments?.length ?? null,
    minimumPlans: minimumPlans(target),
    plans: plans.length,
    rawSeconds,
    adjustedSeconds,
    codeSeconds: adjustedSeconds - rawSeconds,
    maxReachableSeconds: plans.length * DUREE_GENERATION_MAX,
    targetReachable: plans.length * DUREE_GENERATION_MAX >= target,
    rawGap: round((rawSeconds - target) / target, 3),
    adjustedGap: round((adjustedSeconds - target) / target, 3),
    withinBounds: adjustedSeconds >= bounds.bas && adjustedSeconds <= bounds.haut,
    narrativeWords,
    wordsPerRawSecond: rawSeconds ? round(narrativeWords / rawSeconds) : 0,
    wordsPerAdjustedSecond: adjustedSeconds ? round(narrativeWords / adjustedSeconds) : 0,
    dialogueLines: sum(labelled.map((p) => (p.description.match(/«[^»]*»/g) ?? []).length)),
    emptyPlans: empty,
    // Same precedence as the production findings: an empty plan is not also reported as still.
    stillPlans: labelled.filter((p) => !empty.includes(p.plan) && planImmobile(p.description)).map((p) => p.plan),
    duplicatePairs: phrasesPartagees(labelled).map((d) => `${d.a}+${d.b}`),
    repeatedGesturePairs: gestesRepetes(labelled).map((r) => `${r.a}+${r.b}`),
    shortOnRaw: rawSeconds < target * SHORT_RAW_RATIO,
    declaredInventions: output.inventions?.length ?? 0,
  };
}
