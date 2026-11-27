/** Shared shapes of the quality lab. A dataset is a frozen copy of what the database held; once exported, nothing here reads the database. */

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

/** One replayed call, saved whole. `attempts` holds EVERY raw answer, resends included. */
export type CallRecord = {
  caseId: string;
  variant: string;
  repetition: number;
  startedAt: string;
  input: unknown;
  attempts: { request: { model: string | null; body: unknown; messages: unknown }; text: string; reasoning: string | null; stop: string | null; tokensIn: number; tokensOut: number; durationMs: number }[];
  /** Output the production code would keep, or null if the call failed. */
  output: SceneOutput | null;
  resends: number;
  error: string | null;
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
  variants: { id: string; label: string; systemHash: string; systemChars: number }[];
  cases: string[];
};
