/** What the lab reads from the servers around a call: the memory of the card (ComfyUI) and the number of reasoning tokens (the model's
 * tokenizer through llama-swap). Best effort: a probe that fails returns null and never interrupts a run. No address leaves this module. */

import { configLlm, type Env } from "../../lib/llm/config";
import type { MemoryPeak, ReasoningCount } from "./types";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type MemorySampler = () => { stop: () => Promise<MemoryPeak | null> };
export type TokenCounter = (text: string, model: string) => Promise<number | null>;
export type Probes = { memory?: MemorySampler; countTokens?: TokenCounter };

const PROBE_TIMEOUT_MS = 4000;
/** The provider keeps at most this many characters of reasoning (lib/llm/compatibleOpenAI.ts). */
const REASONING_KEPT_CHARS = 100_000;

const gigabytes = (bytes: number): number => Math.round((bytes / 2 ** 30) * 100) / 100;
const used = (total: unknown, free: unknown): number | null => (typeof total === "number" && typeof free === "number" ? total - free : null);

/** Samples `GET /system_stats` of ComfyUI (the same card as the model) from the start of a call to its end. */
export function memorySampler(url: string, options: { fetch?: Fetch; intervalMs?: number } = {}): MemorySampler {
  const call = options.fetch ?? fetch;
  const intervalMs = options.intervalMs ?? 1000;
  return () => {
    const samples: { vram: number | null; ram: number | null }[] = [];
    const take = async () => {
      try {
        const answer = await call(`${url}/system_stats`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
        if (!answer.ok) return;
        const body = (await answer.json()) as { devices?: { vram_total?: number; vram_free?: number }[]; system?: { ram_total?: number; ram_free?: number } };
        const sample = { vram: used(body.devices?.[0]?.vram_total, body.devices?.[0]?.vram_free), ram: used(body.system?.ram_total, body.system?.ram_free) };
        if (sample.vram != null || sample.ram != null) samples.push(sample);
      } catch {
        /* unreachable: no sample */
      }
    };
    let pending: Promise<void> | null = take();
    const tick = () => {
      pending ??= take().finally(() => (pending = null));
    };
    void pending.finally(() => (pending = null));
    const timer = setInterval(tick, intervalMs);
    timer.unref?.();
    return {
      async stop() {
        clearInterval(timer);
        await pending;
        await take();
        if (samples.length === 0) return null;
        const peak = (key: "vram" | "ram") => {
          const values = samples.flatMap((s) => (s[key] == null ? [] : [s[key]!]));
          return values.length ? gigabytes(Math.max(...values)) : null;
        };
        const first = samples[0]!.vram;
        return { vramPeakGb: peak("vram"), ramPeakGb: peak("ram"), vramFirstGb: first == null ? null : gigabytes(first), samples: samples.length, intervalMs };
      },
    };
  };
}

/** Counts tokens with the tokenizer of the loaded model (llama-server `/tokenize`, behind llama-swap). Generates nothing. */
export function tokenCounter(url: string, options: { fetch?: Fetch } = {}): TokenCounter {
  const call = options.fetch ?? fetch;
  return async (text, model) => {
    try {
      const answer = await call(`${url}/upstream/${encodeURIComponent(model)}/tokenize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS * 5),
      });
      if (!answer.ok) return null;
      const tokens = ((await answer.json()) as { tokens?: unknown }).tokens;
      return Array.isArray(tokens) ? tokens.length : null;
    } catch {
      return null;
    }
  };
}

/** Reasoning tokens of one answer, always with the way they were obtained: the server counts them inside the written tokens. */
export async function countReasoning(answer: { reasoning: string | null; text: string; tokensOut: number; model: string }, counter: TokenCounter): Promise<ReasoningCount> {
  const reasoning = answer.reasoning ?? "";
  if (!reasoning) return { tokens: 0, method: "none" };
  const cut = reasoning.length >= REASONING_KEPT_CHARS ? { textCut: true } : {};
  const exact = await counter(reasoning, answer.model).catch(() => null);
  if (exact != null) return { tokens: exact, method: "tokenizer", ...cut };
  return { tokens: Math.round((answer.tokensOut * reasoning.length) / (reasoning.length + answer.text.length)), method: "share", ...cut };
}

/** The real probes, from the same variables as the worker. */
export function serverProbes(env: Env = process.env): Probes {
  const comfy = env.COMFYUI_URL?.trim().replace(/\/+$/, "");
  return { ...(comfy ? { memory: memorySampler(comfy) } : {}), countTokens: tokenCounter(configLlm(env).url) };
}
