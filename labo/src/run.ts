/** Replays a dataset with one or several variants through the production executor (`executerSkill`), with no database trace. Every raw
 * answer is captured by wrapping the provider. Nothing is sent unless the caller asks for it explicitly. */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { controleurPourSkill } from "../../lib/llm/checks";
import { corpsPourSkill, creerFournisseur, maxTokensPourSkill, modelePourSkill } from "../../lib/llm/config";
import { executerSkill } from "../../lib/llm/execute";
import type { FournisseurLlm } from "../../lib/llm/types";
import { gitState, LAB_ROOT, readDataset } from "./files";
import { materialize, variantById, type Variant } from "./variants";
import type { CallRecord, Case, RunManifest, SceneOutput } from "./types";

const SKILL = "scenario-scene";

export type RunOptions = {
  dataset: string;
  variants: string[];
  repetitions: number;
  /** Subset of case ids (or of their prefixes, e.g. "261"). */
  only?: string[];
  model?: string;
  /** Fields added to the request body; otherwise what production would send. */
  body?: Record<string, unknown>;
};

export type Plan = { manifest: RunManifest; cases: Case[]; variants: Variant[]; calls: number };

/** What a run would do, computed without writing or calling anything. */
export function planRun(options: RunOptions, now = new Date()): Plan {
  const dataset = readDataset(options.dataset);
  const cases = dataset.cases.filter((c) => !options.only?.length || options.only.some((o) => c.id === o || c.id.startsWith(`${o}-`)));
  if (cases.length === 0) throw new Error("Aucun cas ne correspond.");
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1) throw new Error("Le nombre de répétitions doit être un entier d'au moins 1.");
  const variants = options.variants.map(variantById);
  const manifest: RunManifest = {
    id: `${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${options.dataset}`,
    dataset: options.dataset,
    startedAt: now.toISOString(),
    ...gitState(),
    model: options.model ?? modelePourSkill(SKILL),
    body: options.body ?? corpsPourSkill(SKILL) ?? {},
    maxTokens: maxTokensPourSkill(SKILL),
    repetitions: options.repetitions,
    variants: variants.map((v) => ({ id: v.id, label: v.label, systemHash: "", systemChars: 0 })),
    cases: cases.map((c) => c.id),
  };
  return { manifest, cases, variants, calls: cases.length * variants.length * options.repetitions };
}

/** Keeps every request and answer of one `executerSkill` call, resends included. */
function recording(provider: FournisseurLlm, attempts: CallRecord["attempts"]): FournisseurLlm {
  return {
    nom: provider.nom,
    async generer(request) {
      const answer = await provider.generer(request);
      attempts.push({
        request: { model: request.modele ?? null, body: request.corps ?? null, messages: request.messages },
        text: answer.texte,
        reasoning: answer.reflexion ?? null,
        stop: answer.arret ?? null,
        tokensIn: answer.usage.entree,
        tokensOut: answer.usage.sortie,
        durationMs: answer.dureeMs,
      });
      return answer;
    },
  };
}

async function replayCase(item: Case, variant: Variant, repetition: number, root: string, manifest: RunManifest, provider: FournisseurLlm): Promise<CallRecord> {
  const input = variant.prepareInput ? variant.prepareInput(structuredClone(item.input)) : item.input;
  const production = controleurPourSkill(SKILL, input);
  const record: CallRecord = { caseId: item.id, variant: variant.id, repetition, startedAt: new Date().toISOString(), input, attempts: [], output: null, resends: 0, error: null };
  try {
    const result = await executerSkill(SKILL, input, {
      racine: root,
      fournisseur: recording(provider, record.attempts),
      modele: manifest.model,
      corps: manifest.body,
      enregistrer: null,
      controler: (json) => [...(production?.(json) ?? []), ...(variant.extraCheck?.(json as SceneOutput, input) ?? [])],
    });
    record.output = result.json as SceneOutput;
    record.resends = result.renvois;
  } catch (e) {
    record.resends = Math.max(0, record.attempts.length - 1);
    // Run files may be shared: the address of the LLM server stays out of them.
    record.error = (e as Error).message.replace(/https?:\/\/[^\s)]+/g, "<url>");
  }
  return record;
}

export async function launch(plan: Plan, log: (line: string) => void, provider: FournisseurLlm = creerFournisseur(), runsRoot = resolve(LAB_ROOT, "runs")): Promise<string> {
  const folder = join(runsRoot, plan.manifest.id);
  if (existsSync(folder)) throw new Error(`Le dossier ${folder} existe déjà.`);
  mkdirSync(join(folder, "calls"), { recursive: true });
  const roots = new Map<string, string>();
  for (const [i, variant] of plan.variants.entries()) {
    const root = join(folder, "variants", variant.id);
    Object.assign(plan.manifest.variants[i]!, materialize(variant, root));
    roots.set(variant.id, root);
  }
  writeFileSync(join(folder, "manifest.json"), `${JSON.stringify(plan.manifest, null, 2)}\n`);

  let done = 0;
  // Variants alternate inside each repetition: a drift of the server during the run hits them equally.
  for (let repetition = 1; repetition <= plan.manifest.repetitions; repetition++) {
    for (const item of plan.cases) {
      for (const variant of plan.variants) {
        const record = await replayCase(item, variant, repetition, roots.get(variant.id)!, plan.manifest, provider);
        writeFileSync(join(folder, "calls", `${item.id}__${variant.id}__r${repetition}.json`), `${JSON.stringify(record, null, 2)}\n`);
        done += 1;
        const seconds = Math.round(record.attempts.reduce((a, x) => a + x.durationMs, 0) / 1000);
        log(`${done}/${plan.calls} ${item.id} ${variant.id} r${repetition} : ${record.error ?? `${record.output?.plans.length} plans`} (${seconds} s)`);
      }
    }
  }
  return folder;
}
