/** Replays a dataset with one or several variants through the production executor (`executerSkill`), with no database trace. Every raw
 * answer is captured by wrapping the provider. Nothing is sent unless the caller asks for it explicitly. */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { controleurPourSkill } from "../../lib/llm/checks";
import { corpsPourSkill, creerFournisseur, maxTokensPourSkill, modelePourSkill } from "../../lib/llm/config";
import { executerSkill } from "../../lib/llm/execute";
import { ErreurLlm, type FournisseurLlm, type MessageLlm } from "../../lib/llm/types";
import { LIGHT_EXPERIMENT, REASONING_CAMPAIGN } from "./campaign";
import { gitState, LAB_ROOT, readDataset, readRun } from "./files";
import { callSeconds } from "./metrics";
import { countReasoning, type Probes } from "./probes";
import { lightVariants, materialize, reasoningVariants, variantById, type Variant } from "./variants";
import type { CallRecord, Case, RunManifest, SceneInput, SceneOutput } from "./types";

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
  /** Campaign 02 and experiment 04: their versions are fixed, `variants` stays empty. */
  campaign?: "02" | "04";
  /** Experiment 04: folder names of the runs that give the reused versions, in the round's order. */
  reuse?: string[];
  /** Experiment 04: round, from 1. */
  round?: number;
  /** Campaign 02: the variant of campaign 01 that was kept. */
  base?: string;
  /** Campaign 02: three scenes with reasoning only, to check that the run works. */
  pilot?: boolean;
};

export type Plan = {
  manifest: RunManifest;
  cases: Case[];
  variants: Variant[];
  /** Records the run will write: one per case, variant and repetition. */
  calls: number;
  /** Among them, those of paired variants: they call the model only when their retry is triggered. */
  conditionalCalls: number;
};

/** The pilot's scenes: the shortest, the median and the longest input. Pure. */
export function pickPilotCases(cases: Case[]): Case[] {
  const sorted = [...cases].sort((a, b) => JSON.stringify(a.input).length - JSON.stringify(b.input).length || a.id.localeCompare(b.id));
  const picked = [sorted[0], sorted[Math.floor((sorted.length - 1) / 2)], sorted.at(-1)];
  return [...new Set(picked.filter((c): c is Case => c != null))];
}

/** The settings of a round of experiment 04 (the first by default). */
export function lightRound(number = 1) {
  const round = LIGHT_EXPERIMENT.rounds[number - 1];
  if (!round) throw new Error(`Expérience 04 : tour inconnu (1 à ${LIGHT_EXPERIMENT.rounds.length}).`);
  return round;
}

/** The variants of a run, in the order they are replayed. */
export function variantsOf(options: RunOptions): Variant[] {
  if (options.campaign === "04") {
    if (options.only?.length || options.body || options.variants.length || options.base || options.pilot || options.repetitions !== 1) throw new Error("Expérience 04 : scène, versions et corps sont fixés (ni --only, ni --body, ni --variants, ni --base, ni --pilot, ni --reps).");
    const round = lightRound(options.round);
    if (options.reuse?.length !== round.reused.length) throw new Error(`Expérience 04 : --reuse attend ${round.reused.length} dossier(s) d'essai, séparés par des virgules, pour ${round.reused.map((r) => r.id).join(" puis ")}.`);
    return lightVariants(round.variants);
  }
  if (options.reuse || options.round) throw new Error("--reuse et --round ne valent que pour l'expérience 04.");
  if (options.campaign !== "02") {
    if (options.base || options.pilot) throw new Error("--base et --pilot ne valent que pour la campagne 02 (--campaign 02).");
    // A paired variant reads the generation of another: that one runs first.
    const variants = options.variants.map(variantById).sort((a, b) => Number(Boolean(a.retry)) - Number(Boolean(b.retry)));
    for (const v of variants) {
      if (v.retry && !variants.some((x) => x.id === v.retry!.from)) throw new Error(`La variante ${v.id} part de la génération de ${v.retry.from} : lance les deux (--variants ${v.retry.from},${v.id}).`);
    }
    return variants;
  }
  const base = options.base?.toUpperCase();
  if (!base || !REASONING_CAMPAIGN.bases.includes(base)) throw new Error(`Campagne 02 : --base est obligatoire, la variante retenue par la campagne 01 (${REASONING_CAMPAIGN.bases.join(", ")}).`);
  if (options.only?.length || options.body || options.variants.length) throw new Error("Campagne 02 : scènes, corps et versions sont fixés par le protocole (ni --only, ni --body, ni --variants).");
  const both = reasoningVariants(base);
  return options.pilot ? both.filter((v) => v.id === REASONING_CAMPAIGN.candidate) : both;
}

/** What a run would do, computed without writing or calling anything. */
export function planRun(options: RunOptions, now = new Date()): Plan {
  const variants = variantsOf(options);
  const dataset = readDataset(options.dataset);
  const light = options.campaign === "04";
  const only = light ? [lightRound(options.round).scene ?? LIGHT_EXPERIMENT.scene] : options.only;
  const wanted = dataset.cases.filter((c) => !only?.length || only.some((o) => c.id === o || c.id.startsWith(`${o}-`)));
  const cases = options.pilot ? pickPilotCases(wanted) : wanted;
  if (cases.length === 0) throw new Error("Aucun cas ne correspond.");
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1) throw new Error("Le nombre de répétitions doit être un entier d'au moins 1.");
  const reasoning = options.campaign !== undefined;
  const suffix = light ? "-04" : reasoning ? (options.pilot ? "-02-pilote" : "-02") : "";
  const reuse = light
    ? lightRound(options.round).reused.map((wanted, i) => {
        const run = options.reuse![i]!;
        checkReuse(readRun(join(LAB_ROOT, "runs", run)), wanted, cases[0]!);
        return { id: wanted.id, run, variant: wanted.variant, repetition: wanted.repetition };
      })
    : undefined;
  const manifest: RunManifest = {
    id: `${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${options.dataset}${suffix}`,
    dataset: options.dataset,
    startedAt: now.toISOString(),
    ...gitState(),
    model: options.model ?? modelePourSkill(SKILL),
    // Campaign 02 and experiment 04 set body and cap per version: nothing comes from the environment.
    body: reasoning ? {} : (options.body ?? corpsPourSkill(SKILL) ?? {}),
    maxTokens: reasoning ? REASONING_CAMPAIGN.maxTokens : maxTokensPourSkill(SKILL),
    repetitions: options.repetitions,
    variants: variants.map((v) => ({ id: v.id, label: v.label, systemHash: "", systemChars: 0, ...(v.body ? { body: v.body } : {}), ...(v.maxTokens ? { maxTokens: v.maxTokens } : {}) })),
    cases: cases.map((c) => c.id),
    ...(options.campaign === "02" ? { campaign: "02" as const, base: options.base!.toUpperCase(), ...(options.pilot ? { pilot: true } : {}) } : {}),
    ...(reuse ? { campaign: "04" as const, reuse, round: options.round ?? 1 } : {}),
  };
  const perVariant = cases.length * options.repetitions;
  return { manifest, cases, variants, calls: perVariant * variants.length, conditionalCalls: perVariant * variants.filter((v) => v.retry).length };
}

/** A reused record stands for a version only if it saw the same input, with the version's reasoning switch, and was not cut. Pure. */
export function checkReuse(source: { records: CallRecord[] }, reuse: { variant: string; repetition: number; thinking: boolean }, item: Case): void {
  const record = source.records.find((r) => r.caseId === item.id && r.variant === reuse.variant && r.repetition === reuse.repetition);
  const first = record?.attempts[0];
  if (!record || !first) throw new Error(`Réutilisation impossible : pas d'appel ${reuse.variant} r${reuse.repetition} pour ${item.id}.`);
  if (JSON.stringify(record.input) !== JSON.stringify(item.input)) throw new Error("Réutilisation impossible : l'entrée diffère.");
  const kwargs = (first.request.body as { chat_template_kwargs?: { enable_thinking?: boolean } } | null)?.chat_template_kwargs;
  if (kwargs?.enable_thinking !== reuse.thinking) throw new Error(`Réutilisation impossible : cet appel n'a pas été fait ${reuse.thinking ? "avec" : "sans"} réflexion.`);
  if (first.stop === "length") throw new Error("Réutilisation impossible : la réponse est coupée.");
}

/** Keeps every request and answer of one `executerSkill` call, resends included, with what the probes saw around it. */
function recording(provider: FournisseurLlm, record: CallRecord, probes: Probes): FournisseurLlm {
  return {
    nom: provider.nom,
    async generer(request) {
      let sampling: ReturnType<NonNullable<Probes["memory"]>> | undefined;
      try {
        sampling = probes.memory?.();
      } catch {
        /* a probe never stops a run */
      }
      const stopSampling = async () => (sampling ? sampling.stop().catch(() => null) : undefined);
      const started = Date.now();
      let answer;
      try {
        answer = await provider.generer(request);
      } catch (e) {
        record.failedMs = (record.failedMs ?? 0) + (Date.now() - started);
        await stopSampling();
        throw e;
      }
      const memory = await stopSampling();
      const reasoningCount = probes.countTokens
        ? await countReasoning({ reasoning: answer.reflexion ?? null, text: answer.texte, tokensOut: answer.usage.sortie, model: request.modele ?? answer.modele }, probes.countTokens)
        : undefined;
      record.attempts.push({
        request: { model: request.modele ?? null, body: request.corps ?? null, messages: request.messages, maxTokens: request.maxTokens ?? null },
        text: answer.texte,
        reasoning: answer.reflexion ?? null,
        stop: answer.arret ?? null,
        tokensIn: answer.usage.entree,
        tokensOut: answer.usage.sortie,
        durationMs: answer.dureeMs,
        servedModel: answer.modele,
        ...(answer.timings ? { timings: answer.timings } : {}),
        ...(memory !== undefined ? { memory } : {}),
        ...(reasoningCount ? { reasoningCount } : {}),
      });
      return answer;
    },
  };
}

type Context = { variant: Variant; root: string; manifest: RunManifest; provider: FournisseurLlm; probes: Probes };

/** One production execution (check and resend included), written into `record`. On failure the record keeps the output it had. */
async function execute(record: CallRecord, input: SceneInput, request: SceneInput | MessageLlm[], { variant, root, manifest, provider, probes }: Context): Promise<void> {
  const production = controleurPourSkill(SKILL, input);
  // A record may already hold a first generation (own retry).
  const attemptsBefore = record.attempts.length;
  const resendsBefore = record.resends;
  try {
    const result = await executerSkill(SKILL, request, {
      racine: root,
      fournisseur: recording(provider, record, probes),
      modele: manifest.model,
      corps: variant.body ?? manifest.body,
      ...(variant.maxTokens ? { maxTokens: variant.maxTokens } : {}),
      enregistrer: null,
      // Experiment 04 compares first answers: no content check, so no resend (a broken format still gets one).
      ...(manifest.campaign === "04" ? {} : { controler: (json: unknown) => [...(production?.(json) ?? []), ...(variant.extraCheck?.(json as SceneOutput, input) ?? [])] }),
    });
    record.output = result.json as SceneOutput;
    record.resends = resendsBefore + result.renvois;
  } catch (e) {
    record.resends = resendsBefore + Math.max(0, record.attempts.length - attemptsBefore - 1);
    // Run files may be shared: the address of the LLM server stays out of them.
    record.error = (e as Error).message.replace(/https?:\/\/[^\s)]+/g, "<url>");
    if (e instanceof ErreurLlm) record.errorCode = e.code;
  }
}

const emptyRecord = (caseId: string, variant: string, repetition: number, input: unknown): CallRecord => ({ caseId, variant, repetition, startedAt: new Date().toISOString(), input, attempts: [], output: null, resends: 0, error: null });

/** The first request, the answer kept, then the retry message. */
const retryConversation = (input: SceneInput, firstText: string, message: string): MessageLlm[] => [
  { role: "user", content: JSON.stringify(input) },
  { role: "assistant", content: firstText },
  { role: "user", content: message },
];

async function replayCase(item: Case, repetition: number, context: Context): Promise<CallRecord> {
  const { variant } = context;
  const input = variant.prepareInput ? variant.prepareInput(structuredClone(item.input)) : item.input;
  const record = emptyRecord(item.id, variant.id, repetition, input);
  await execute(record, input, input, context);
  if (!variant.ownRetry || !record.output) return record;
  const first = record.output;
  const message = variant.ownRetry(first, input);
  record.retry = { from: variant.id, triggered: message != null, firstOutput: first, firstAttempts: record.attempts.length };
  if (message != null) await execute(record, input, retryConversation(input, record.attempts.at(-1)!.text, message), context);
  return record;
}

/** The second half of a paired variant: starts from the generation of `base`, asks one more only if the variant's message says so. */
async function replayRetry(base: CallRecord, context: Context): Promise<CallRecord> {
  const { variant } = context;
  const input = base.input as SceneInput;
  const record = emptyRecord(base.caseId, variant.id, base.repetition, input);
  if (!base.output) {
    record.error = `Pas de première génération : ${base.variant} a échoué.`;
    return record;
  }
  record.output = base.output;
  const message = variant.retry!.message(base.output, input);
  record.retry = { from: base.variant, triggered: message != null, firstOutput: base.output };
  if (message == null) return record;
  await execute(record, input, retryConversation(input, base.attempts.at(-1)!.text, message), context);
  return record;
}

export async function launch(
  plan: Plan,
  log: (line: string) => void,
  provider: FournisseurLlm = creerFournisseur(),
  runsRoot = resolve(LAB_ROOT, "runs"),
  probes: Probes = {},
): Promise<string> {
  const folder = join(runsRoot, plan.manifest.id);
  if (existsSync(folder)) throw new Error(`Le dossier ${folder} existe déjà.`);
  mkdirSync(join(folder, "calls"), { recursive: true });
  const roots = new Map<string, string>();
  for (const [i, variant] of plan.variants.entries()) {
    const root = join(folder, "variants", variant.id);
    Object.assign(plan.manifest.variants[i]!, materialize(variant, root));
    roots.set(variant.id, root);
  }
  const t0 = [plan.manifest.reuse ?? []].flat().find((r) => (r.id ?? "T0") === "T0");
  const t1 = plan.manifest.variants.find((v) => v.id === "T1");
  if (t0 && t1) {
    // A replayed T1 must run the very prompt T0 ran.
    const before = readRun(join(runsRoot, t0.run)).manifest.variants.find((v) => v.id === t0.variant)?.systemHash;
    if (before !== t1.systemHash) {
      rmSync(folder, { recursive: true, force: true });
      throw new Error("Réutilisation impossible : le prompt de production a changé depuis cet essai.");
    }
  }
  writeFileSync(join(folder, "manifest.json"), `${JSON.stringify(plan.manifest, null, 2)}\n`);

  let done = 0;
  // Variants alternate inside each repetition: a drift of the server during the run hits them equally.
  for (let repetition = 1; repetition <= plan.manifest.repetitions; repetition++) {
    for (const [caseIndex, item] of plan.cases.entries()) {
      const records = new Map<string, CallRecord>();
      // Campaign 02: the second call of a scene finds the prompt in the server's cache, so each version goes first in turn.
      const order = plan.manifest.campaign === "02" && (caseIndex + repetition) % 2 === 0 ? [...plan.variants].reverse() : plan.variants;
      for (const variant of order) {
        const context: Context = { variant, root: roots.get(variant.id)!, manifest: plan.manifest, provider, probes };
        const record = variant.retry ? await replayRetry(records.get(variant.retry.from)!, context) : await replayCase(item, repetition, context);
        records.set(variant.id, record);
        writeFileSync(join(folder, "calls", `${item.id}__${variant.id}__r${repetition}.json`), `${JSON.stringify(record, null, 2)}\n`);
        done += 1;
        const seconds = Math.round(callSeconds(record));
        const retried = record.retry ? (record.retry.triggered ? ", relancée" : ", sans relance") : "";
        // No result in the progress: a comparison is read blind first.
        log(`${done}/${plan.calls} ${item.id} ${variant.id} r${repetition} : ${record.error ?? "ok"}${retried} (${seconds} s)`);
      }
    }
  }
  return folder;
}
