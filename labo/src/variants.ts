/** A variant is the PRODUCTION skill plus a few declared differences. It is materialised into the run's folder, so each run keeps the exact
 * prompt it used and production files are never touched. */

import { createHash } from "node:crypto";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargerSkill } from "../../lib/llm/skills";
import { REPO_ROOT } from "./files";
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
};

/** B and C are not defined yet: their design is awaiting arbitration (see labo/handoff/). */
export const VARIANTS: Variant[] = [{ id: "A", label: "Production actuelle" }];

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
