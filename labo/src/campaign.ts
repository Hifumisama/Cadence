/** The campaigns, as written in `protocols/` BEFORE any replay. Changing a value here after seeing results voids the protocol. */

export type NoteId = "progression" | "fidelity" | "coherence";

/** One note of 1 to 5 asked by the blind reading. */
export type Question = { id: NoteId; label: string; short: string };

const PROGRESSION: Question = { id: "progression", short: "Progression", label: "Progression : chaque plan apporte-t-il du nouveau ?" };
const FIDELITY: Question = { id: "fidelity", short: "Fidélité", label: "Fidélité : les moments et les intentions sont-ils respectés, sans remplissage ?" };
const COHERENCE: Question = { id: "coherence", short: "Cohérence", label: "Cohérence : les plans s'enchaînent-ils sans se contredire ?" };

/** The five scenes whose target was unreachable in the history, and a short control. */
const READ_SCENES = ["259-s2", "261-s1", "261-s2", "261-s3", "264-s1", "264-s2"];

/** Campaign 01 (`protocols/01-duration.md`): planning the number of plans. */
export const CAMPAIGN = {
  /** Variant every other is compared to. */
  baseline: "A",
  /** Scenes read blind (prefixes of case ids). */
  readScenes: READ_SCENES,
  questions: [PROGRESSION, FIDELITY],
  /** (1) Mean scores at least those of the compared variant, minus this. */
  scoreTolerance: 0.25,
  /** (2) No read scene loses this many points or more on one score. */
  forbiddenLoss: 2,
  /** (3) The mean absolute raw gap drops by at least this share. */
  gapReduction: 1 / 3,
  /** (4) …and by that share in at least this many repetitions. */
  minRepetitions: 2,
};

export type Campaign = typeof CAMPAIGN;

/** Follow-up of campaign 01 (`protocols/03-confirmation.md`): blind duels on outputs nobody read, no new call. */
export const CONFIRMATION = {
  baseline: "A",
  candidate: "C",
  repetition: 2,
  /** The three read scenes C retried in that repetition, and the one that blocked it. */
  scenes: ["259-s2", "261-s1", "261-s2", "261-s3"],
  /** Duels the candidate must win; it must also never be the only text flagged as betraying a scene. */
  minWins: 3,
};

export type Confirmation = typeof CONFIRMATION;

/** Experiment 04 (`proposals/experiment-04-reasoning-light.md`): one scene, three versions, FIRST answers compared in blind duels. */
export const LIGHT_EXPERIMENT = {
  scene: "264-s2",
  /** T0 is not replayed: the first answer of this record of campaign 01 (never read). */
  reused: { id: "T0", variant: "A", repetition: 2 },
  /** The new prompt of T2, from the lab folder. */
  skillFile: "proposals/scenario-scene-reasoning/SKILL.md",
  labels: { T0: "Skill actuel, sans réflexion", T1: "Skill actuel, avec réflexion", T2: "Skill repensé, avec réflexion" },
  duels: [
    ["T0", "T1"],
    ["T1", "T2"],
  ] as [string, string][],
};

/** Optional reasons of a duel. */
export const DUEL_REASONS = [
  { id: "progression", label: "Progression" },
  { id: "fidelity", label: "Fidélité" },
  { id: "repetition", label: "Répétitions" },
  { id: "writing", label: "Écriture" },
  { id: "coherence", label: "Cohérence" },
];

/** Campaign 02 (`protocols/02-reasoning.md`): the model's reasoning, T0 without it and T1 with it, on the variant kept by campaign 01. */
export const REASONING_CAMPAIGN = {
  baseline: "T0",
  candidate: "T1",
  readScenes: READ_SCENES,
  questions: [PROGRESSION, FIDELITY, COHERENCE],
  /** Variants of campaign 01 that can serve as the common prompt. */
  bases: ["A", "B", "C"],
  repetitions: 3,
  reasoningEffort: "xhigh",
  /** Output cap of both versions, reasoning included. */
  maxTokens: 28_000,
  /** Context of the server's single slot (`--ctx-size`, `--parallel 1`, read on 2026-11-27). */
  contextSize: 45_056,
  /** (1) At least one mean note gains this much… */
  minGain: 0.5,
  /** (2) …and none drops by more than this. */
  maxDrop: 0.25,
  /** (3) No read scene loses this many points or more on one note. */
  forbiddenLoss: 2,
  /** (6) Median time of one scene with reasoning, resends and retry included. */
  maxMedianSeconds: 180,
};

export type ReasoningCampaign = typeof REASONING_CAMPAIGN;
