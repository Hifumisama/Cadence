/** A variant is the PRODUCTION skill plus a few declared differences. It is materialised into the run's folder, so each run keeps the exact
 * prompt it used and production files are never touched. */

import { createHash } from "node:crypto";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargerSkill } from "../../lib/llm/skills";
import { DUREE_GENERATION_MAX } from "../../lib/clips/clip-checks";
import { REPO_ROOT } from "./files";
import { SHORT_RAW_RATIO } from "./metrics";
import type { SceneInput, SceneOutput } from "./types";

const SKILL = "scenario-scene";

export type Variant = {
  id: string;
  label: string;
  /** Text replacements in SKILL.md; each `find` must appear exactly once. */
  replacements?: { find: string; replace: string }[];
  /** Adds data to the frozen input (computed by code). */
  prepareInput?: (input: SceneInput) => SceneInput;
  /** Extra findings that trigger the (single) resend, on top of the production check. */
  extraCheck?: (output: SceneOutput, input: SceneInput) => string[];
  /** Paired retry: the first generation is the one of variant `from` (same prompt, same input, no new call); when `message` returns a
   * text, ONE more generation is asked in the same conversation. */
  retry?: { from: string; message: (first: SceneOutput, input: SceneInput) => string | null };
};

export const minimumPlans = (targetSeconds: number): number => Math.ceil(targetSeconds / DUREE_GENERATION_MAX);

// --- B: plan the number of plans from the duration ------------------------------------------------------------------------------

const PLANNING_REPLACEMENTS: NonNullable<Variant["replacements"]> = [
  {
    find: "**The goal is few plans to shoot**: each is a generation to produce, review and fix, so group rather than split.",
    replace: "**Shoot no useless plan**: each is a generation to produce, review and fix, so group the moments that fit together, as long as the number of plans still serves the duration (rule 4).",
  },
  {
    find: "4. **The scene's total follows `scene.dureeCibleSecondes`.** Choose the number of plans and their relative lengths so that the sum comes close to it; the application then adjusts the durations to hit it exactly, so never spend effort on the arithmetic. A scene of 40 s is about five plans at a measured rhythm.",
    replace:
      "4. **Plan the number of plans from the duration.** `planification.plansMinimum` is the smallest number of plans that can fill `scene.dureeCibleSecondes` with every plan at 10 s; shorter plans need more of them. Take it as your **planning objective**, and make the sum of the durations you write come close to the target: never count on anything else to lengthen the scene. Find the matter **inside what the scene already holds** (`scene.moments`; without them, `scene.intention` and `scene.momentsDeLAuteur`): a moment may be split into several visual steps only when it already contains them. **Each plan brings a new visible change, action or fact.** Never add an event, repeat a beat or stretch a plan to fill time: when the matter does not hold the duration, write a **shorter scene** and say why in `notes`. A shorter scene is a good answer; a padded one is not.",
  },
  {
    find: "- The scene's total is close to `dureeCibleSecondes`; montages are one plan; a tipping point is set up.",
    replace: "- The sum of your durations is close to `dureeCibleSecondes`, with `planification.plansMinimum` plans or more, or `notes` says why the matter does not hold it; montages are one plan; a tipping point is set up.",
  },
];

const withPlanning = (input: SceneInput): SceneInput => ({
  ...input,
  planification: { plansMinimum: minimumPlans(input.scene.dureeCibleSecondes), dureeMaximumPlanSecondes: DUREE_GENERATION_MAX },
});

// --- C: B, then one retry when the raw duration is short -------------------------------------------------------------------------

export function durationRetryMessage(first: SceneOutput, input: SceneInput): string | null {
  const target = input.scene.dureeCibleSecondes;
  const total = first.plans.reduce((sum, p) => sum + (Number(p.dureeSecondes) || 0), 0);
  if (total >= target * SHORT_RAW_RATIO) return null;
  const count = first.plans.length;
  const matter = input.scene.moments?.length ? "les moments de la scène (`scene.moments`)" : "l'intention de la scène et les paroles de l'auteur";
  return [
    `Ta scène totalise ${total} s pour ${target} s visées : il manque ${target - total} s. Elle compte ${count} plan${count > 1 ? "s" : ""} ; il en faut au moins ${minimumPlans(target)} pour atteindre la durée, à 10 s chacun.`,
    `Cherche dans ${matter} des actions ou des étapes visuelles qui y sont déjà contenues et que tu n'as pas montrées, ou qui méritent leur propre plan.`,
    "N'invente aucun événement, ne répète rien, et n'allonge aucun plan sans lui donner une action nouvelle.",
    "Si la matière ne suffit pas, garde une scène plus courte et dis pourquoi dans `notes` : c'est une réponse acceptée.",
    "",
    "Renvoie UNIQUEMENT le JSON complet de la scène, conforme au schéma, sans texte autour.",
  ].join("\n");
}

export const VARIANTS: Variant[] = [
  { id: "A", label: "Production actuelle" },
  { id: "B", label: "Nombre de plans planifié depuis la durée cible", replacements: PLANNING_REPLACEMENTS, prepareInput: withPlanning },
  {
    id: "C",
    label: `B, puis une relance si la durée brute est sous ${Math.round(SHORT_RAW_RATIO * 100)} % de la cible`,
    replacements: PLANNING_REPLACEMENTS,
    prepareInput: withPlanning,
    retry: { from: "B", message: durationRetryMessage },
  },
];

export function variantById(id: string): Variant {
  const found = VARIANTS.find((v) => v.id === id.toUpperCase());
  if (!found) throw new Error(`Variante inconnue : « ${id} ». Variantes définies : ${VARIANTS.map((v) => v.id).join(", ")}.`);
  return found;
}

export function applyReplacements(text: string, replacements: NonNullable<Variant["replacements"]>): string {
  return replacements.reduce((current, { find, replace }) => {
    const count = current.split(find).length - 1;
    if (count !== 1) throw new Error(`Remplacement impossible : le texte « ${find.slice(0, 60)}… » apparaît ${count} fois dans le skill (attendu : 1). Le skill de production a changé.`);
    return current.replace(find, () => replace);
  }, text);
}

/** Copies the production skill under `root/agents/skills/` and applies the variant. Returns what identifies the assembled prompt. */
export function materialize(variant: Variant, root: string): { systemHash: string; systemChars: number } {
  const folder = join(root, "agents", "skills", SKILL);
  cpSync(join(REPO_ROOT, "agents", "skills", SKILL), folder, { recursive: true, errorOnExist: true, force: false });
  if (variant.replacements?.length) {
    const file = join(folder, "SKILL.md");
    // Line endings normalised so that a `find` written in this file matches a checkout with CRLF.
    writeFileSync(file, applyReplacements(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), variant.replacements));
  }
  const skill = chargerSkill(SKILL, root);
  return { systemHash: createHash("sha256").update(skill.systeme).digest("hex"), systemChars: skill.caracteres };
}
