/** Shared shapes of the quality lab. A dataset is a frozen copy of what the database held; once exported, nothing here reads the database. */

import type { TimingsServeur } from "../../lib/llm/types";

type PlanOutput = { titre: string; description: string; liaison?: string; dureeSecondes: number; tempsFort?: boolean };
export type SceneOutput = { plans: PlanOutput[]; inventions?: string[]; notes?: string };

/** The part of the `scenario-scene` input the lab reads; the rest is replayed untouched. */
export type SceneInput = {
  scene: { titre: string; position: string; dureeCibleSecondes: number; moments?: string[] } & Record<string, unknown>;
} & Record<string, unknown>;

type HistoricalCall = {
  traceId: number;
  createdAt: string;
  model: string;
  /** SHA-256 of the system prompt of that day: tells apart the versions of the skill. */
  systemHash: string;
  /** Characters of reasoning kept by the trace; 0 = the model did not reason. */
  reasoningChars: number;
  resends: number;
  /** Findings that triggered the resend, or null. */
  validationErrors: string[] | null;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  /** Raw text of the LAST attempt (the trace does not keep the earlier ones). */
  rawOutput: string | null;
  output: SceneOutput;
};

type StoredPlan = {
  title: string;
  description: string;
  link: string | null;
  storedSeconds: number;
  /** Last successful render of the plan: duration asked to ComfyUI, and duration measured in the file (null if the file or ffprobe is missing). */
  askedSeconds: number | null;
  measuredSeconds: number | null;
  successfulRenders: number;
};

/** What the database holds TODAY for that scene: it includes the review and the user's own edits, so it is not the model's output. */
export type StoredScene = { sceneId: number; title: string; targetSeconds: number | null; plans: StoredPlan[] };

export type ReviewCorrection = { handle: string; type: string; criterion: string; reason: string };

export type Case = {
  id: string;
  project: number;
  /** Rank of the scene in its episode, from 1. */
  sceneRank: number;
  sceneTitle: string;
  input: SceneInput;
  historical: HistoricalCall;
  stored: StoredScene | null;
  /** Corrections the screenplay review asked on this scene's plans; null if the project has no review trace. */
  review: ReviewCorrection[] | null;
};

export type Dataset = { name: string; skill: "scenario-scene"; exportedAt: string; commit: string; cases: Case[] };

/** Memory SAMPLED during a call: a short peak between two samples is missed. */
export type MemoryPeak = { vramPeakGb: number | null; ramPeakGb: number | null; vramFirstGb: number | null; samples: number; intervalMs: number };

/** `tokenizer`: counted by the model's tokenizer on the kept text; `share`: ESTIMATED from the share of characters; `none`: no reasoning.
 * `textCut`: the kept text had reached its limit, the count is a lower bound. */
export type ReasoningCount = { tokens: number; method: "tokenizer" | "share" | "none"; textCut?: boolean };

/** One replayed call, saved whole. `attempts` holds EVERY raw answer, resends included. */
export type CallRecord = {
  caseId: string;
  variant: string;
  repetition: number;
  startedAt: string;
  input: unknown;
  attempts: {
    request: { model: string | null; body: unknown; messages: unknown; maxTokens?: number | null };
    text: string;
    reasoning: string | null;
    stop: string | null;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    servedModel?: string;
    /** Measures given by llama-server, when it returns them. */
    timings?: TimingsServeur;
    /** null: the probe returned nothing; absent: no probe. */
    memory?: MemoryPeak | null;
    reasoningCount?: ReasoningCount;
  }[];
  /** Output the production code would keep, or null if the call failed. */
  output: SceneOutput | null;
  resends: number;
  error: string | null;
  /** Code of the model error (`delai`, `sortie_invalide`, `injoignable`…), when there is one. */
  errorCode?: string;
  /** Time spent in calls that threw: they leave no attempt. */
  failedMs?: number;
  /** Paired retry (variant C): `from` gave the first generation; `attempts` holds only the new calls, none when nothing was triggered.
   * When `from` is the variant itself (campaign 02 on a base with a retry), `attempts` holds both and `firstAttempts` says how many made
   * the first generation. */
  retry?: { from: string; triggered: boolean; firstOutput: SceneOutput; firstAttempts?: number };
};

export type RunManifest = {
  id: string;
  dataset: string;
  startedAt: string;
  commit: string;
  /** True when files of the repository differed from that commit. */
  dirty: boolean;
  model: string;
  /** Fields added to the request body (reasoning settings). */
  body: Record<string, unknown>;
  maxTokens: number | null;
  repetitions: number;
  variants: { id: string; label: string; systemHash: string; systemChars: number; body?: Record<string, unknown>; maxTokens?: number }[];
  cases: string[];
  /** Absent = campaign 01. */
  campaign?: "02";
  /** Variant of campaign 01 whose prompt both versions of campaign 02 use. */
  base?: string;
  /** A pilot checks that the run works: never read, scored or shown. */
  pilot?: boolean;
};
