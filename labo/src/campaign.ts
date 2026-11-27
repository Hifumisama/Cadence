/** Campaign 01, as written in `protocols/01-duration.md` BEFORE any replay. Changing a value here after seeing results voids the protocol. */

export const CAMPAIGN = {
  /** Variant every other is compared to. */
  baseline: "A",
  /** Scenes read blind (prefixes of case ids): the five whose target was unreachable in the history, and a short control. */
  readScenes: ["259-s2", "261-s1", "261-s2", "261-s3", "264-s1", "264-s2"],
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
