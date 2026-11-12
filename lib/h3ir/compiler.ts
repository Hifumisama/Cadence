import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BriefH3ir } from "./brief";

/** The bridge to the Open H3 IR compiler (Python package `open-h3-ir`), step 3 of the project (docs/PLAN_INTEGRATION_OPEN_H3_IR.md).
 *
 * A small Python script launched PER CALL (scripts/h3ir/compiler.py: no permanent service). Cancelling = killing the process and its children: the LLM's
 * generation stops when the connection closes. No silent fallback (decision 6): a fallback draft (`degraded`) or an invalid compilation retries with the
 * next seed, twice at most; after that the failure is stated clearly, never a rejected text offered in its place.
 *
 * Pure except `lancerPythonReel`; the launcher is injectable for tests. */

/** What the Python script writes to stdout. */
export type ReponsePython = { http: number; enveloppe?: EnveloppeH3ir; fichiers?: Record<string, string>; erreur?: string };

/** The `POST /v1/briefs` envelope (h3ir/service.py:385), reduced to what Cadence reads. */
export type EnveloppeH3ir = {
  id?: string;
  status?: string;
  source?: string;
  fallback_reason?: string | null;
  question?: unknown;
  errors?: { rule: string; message: string }[];
  detail?: { code?: string; message?: string } | string;
  ir?: {
    mode?: string;
    prompt?: string;
    prompt_tokens?: number;
    sections?: Record<string, string>;
    manifest?: { slot: number; label: string; kind: string; sha256: string; wiring?: string; role: string }[];
    target?: { nominal_seconds?: number; frames?: number; effective_seconds?: number };
    diagnostics?: { rule: string; severity: string; message: string }[];
  };
};

export type Tentative = { seed: number; dureeMs: number; issue: "ok" | "relance" | "echec"; raison?: string };

export type ResultatCompilation = { enveloppe: EnveloppeH3ir; fichiers: Record<string, string>; tentatives: Tentative[]; seedUtilisee: number };

/** A failure explained to the user; `tentatives` says what was tried. */
export class ErreurCompilation extends Error {
  constructor(
    message: string,
    readonly tentatives: Tentative[] = [],
  ) {
    super(message);
    this.name = "ErreurCompilation";
  }
}

type OptionsLancement = { signal?: AbortSignal; delaiMs: number };
/** Launches `python script`, writes it `entree` on stdin and returns its stdout. Rejects if the process fails, exceeds the delay or is cancelled. */
export type LanceurPython = (python: string, script: string, entree: string, options: OptionsLancement) => Promise<string>;

export type Env = Record<string, string | undefined>;

export type ReglagesH3ir = {
  python: string;
  script: string;
  delaiMs: number;
  /** Variables set in the Python process before the package is imported (its config is read only once). */
  env: Record<string, string>;
};

const DELAI_PAR_DEFAUT_MS = 20 * 60 * 1000;
const MAX_TENTATIVES = 3;

/** The Python where `open-h3-ir` is installed: `H3IR_PYTHON`, otherwise the `.venv-h3ir` environment at the root (`requirements-h3ir.txt`) if it exists. */
export function pythonH3ir(env: Env = process.env, existe: (chemin: string) => boolean = existsSync): string {
  const voulu = env.H3IR_PYTHON?.trim();
  if (voulu) return voulu;
  for (const rel of [".venv-h3ir/Scripts/python.exe", ".venv-h3ir/bin/python"]) {
    const chemin = resolve(rel);
    if (existe(chemin)) return chemin;
  }
  throw new ErreurCompilation("Open H3 IR : renseigne H3IR_PYTHON (le Python où le paquet open-h3-ir est installé, ou crée .venv-h3ir à la racine avec requirements-h3ir.txt).");
}

/** Settings of the Python process. `modele`: that of the translation (the same model, so as not to have llama-swap unload it in the middle of a computation; it must see the images). */
export function reglagesH3ir(modele: string, env: Env = process.env, existe?: (chemin: string) => boolean): ReglagesH3ir {
  const urlLlm = env.H3IR_LLM_URL?.trim() || `${(env.LLM_LOCAL_URL?.trim() || "http://localhost:8080").replace(/\/+$/, "")}/v1`;
  const delai = Number(env.H3IR_TIMEOUT_MS);
  const variables: Record<string, string> = {
    H3IR_LLM_URL: urlLlm,
    H3IR_LLM_MODEL: modele,
    // Without this the model copies the JSON schema onto the calls that carry images.
    H3IR_GUIDED_DECODING: "1",
    // The files are designated by path: the compiler runs on the same machine as the storage.
    H3IR_ALLOW_ASSET_PATHS: "1",
    PYTHONUTF8: "1",
  };
  for (const cle of ["H3IR_LLM_KEY", "H3IR_LLM_TIMEOUT", "H3IR_LLM_MAX_TOKENS", "H3IR_STATE_DIR"] as const) {
    const v = env[cle]?.trim();
    if (v) variables[cle] = v;
  }
  return {
    python: pythonH3ir(env, existe),
    script: resolve("scripts/h3ir/compiler.py"),
    delaiMs: Number.isFinite(delai) && delai > 0 ? delai : DELAI_PAR_DEFAUT_MS,
    env: variables,
  };
}

/** The real launcher: `spawn` without a shell. Cancellation and delay kill the process tree (on Windows `taskkill /T`, otherwise SIGKILL). */
const lancerPythonReel: LanceurPython = (python, script, entree, { signal, delaiMs }) =>
  new Promise((ok, ko) => {
    if (signal?.aborted) return ko(new ErreurCompilation("Annulée."));
    const enfant = spawn(python, [script], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } });
    const sortie: Buffer[] = [];
    const erreurs: Buffer[] = [];
    let fini = false;
    const terminer = (f: () => void) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      signal?.removeEventListener("abort", annuler);
      f();
    };
    const tuer = () => {
      if (enfant.pid == null) return;
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(enfant.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => undefined);
      else enfant.kill("SIGKILL");
    };
    const annuler = () => {
      tuer();
      terminer(() => ko(new ErreurCompilation("Annulée.")));
    };
    const minuteur = setTimeout(() => {
      tuer();
      terminer(() => ko(new ErreurCompilation(`Open H3 IR n'a pas répondu en ${delaiMs >= 60_000 ? `${Math.round(delaiMs / 60_000)} min` : `${Math.round(delaiMs / 1000)} s`} : le processus a été arrêté.`)));
    }, delaiMs);
    signal?.addEventListener("abort", annuler, { once: true });

    enfant.stdout.on("data", (d: Buffer) => sortie.push(d));
    enfant.stderr.on("data", (d: Buffer) => erreurs.push(d));
    enfant.on("error", (err: NodeJS.ErrnoException) =>
      terminer(() =>
        ko(
          err.code === "ENOENT"
            ? new ErreurCompilation(`Python introuvable (« ${python} ») : renseigne H3IR_PYTHON.`)
            : new ErreurCompilation(`Impossible de lancer Python : ${err.message}`),
        ),
      ),
    );
    enfant.on("close", (code) =>
      terminer(() => {
        if (code === 0) return ok(Buffer.concat(sortie).toString("utf8"));
        const detail = Buffer.concat(erreurs).toString("utf8").trim().split(/\r?\n/).slice(-4).join(" | ");
        ko(new ErreurCompilation(`Le compilateur Open H3 IR s'est arrêté (code ${code}) : ${detail || "sans message"}. As-tu installé open-h3-ir dans ce Python ?`));
      }),
    );
    enfant.stdin.on("error", () => undefined);
    enfant.stdin.end(entree);
  });

type Verdict = { ok: true } | { ok: false; relancer: boolean; raison: string };

const dit = (e: EnveloppeH3ir | undefined) => {
  const d = e?.detail;
  return typeof d === "string" ? d : d?.message ? `${d.code ? `${d.code} : ` : ""}${d.message}` : "";
};

/** Judges a response from the compiler. Success = 201, `ready`, Ref2VA mode. A fallback draft (`degraded`) or an invalid compilation retries with
 * another seed; a question, an unexpected mode, a refusal of the request or an unreachable LLM stop at once (another seed changes nothing). */
export function jugerReponse(rep: ReponsePython): Verdict {
  if (rep.http === 0) return { ok: false, relancer: false, raison: `Le pont Python a échoué : ${rep.erreur ?? "sans message"}` };
  const e = rep.enveloppe;
  if (rep.http === 201) {
    if (e?.status === "needs_input") return { ok: false, relancer: false, raison: "Open H3 IR pose une question (mode ambigu) : le brief doit déclarer ses rôles." };
    if (e?.status === "degraded") return { ok: false, relancer: true, raison: `brouillon de repli refusé (${e.fallback_reason ?? "raison inconnue"})` };
    if (e?.ir?.mode !== "ref2va") return { ok: false, relancer: false, raison: `Open H3 IR a choisi le mode « ${e?.ir?.mode ?? "?"} » au lieu de Ref2VA : le plan doit avoir des images de référence.` };
    if (e?.status !== "ready" || !e.ir?.prompt) return { ok: false, relancer: true, raison: `statut « ${e?.status ?? "?"} » sans prompt` };
    return { ok: true };
  }
  if (e?.status === "invalid") {
    const regles = (e.errors ?? []).slice(0, 3).map((x) => x.rule).join(", ");
    return { ok: false, relancer: true, raison: `compilation invalide${regles ? ` (${regles})` : ""}` };
  }
  const code = typeof e?.detail === "object" ? e.detail?.code : undefined;
  if (rep.http === 502) return { ok: false, relancer: true, raison: `le LLM a mal répondu (${dit(e) || "502"})` };
  if (rep.http === 503 || code === "llm-unavailable") return { ok: false, relancer: false, raison: `Le LLM ou un outil d'analyse est injoignable : ${dit(e) || "503"}` };
  return { ok: false, relancer: false, raison: `Open H3 IR a refusé le brief : ${dit(e) || `HTTP ${rep.http}`}` };
}

export type OptionsCompilation = {
  reglages: ReglagesH3ir;
  signal?: AbortSignal;
  lancer?: LanceurPython;
  maxTentatives?: number;
  /** Called before each attempt (n starts at 1): enough to display « tentative 2/3 ». */
  surTentative?: (n: number, sur: number, seed: number) => void;
};

/** Compiles the brief; up to `maxTentatives` attempts (seed, seed+1, seed+2). Returns the first success, or throws `ErreurCompilation` with the detail. */
export async function compilerAvecRelances(brief: BriefH3ir, options: OptionsCompilation): Promise<ResultatCompilation> {
  const lancer = options.lancer ?? lancerPythonReel;
  const max = options.maxTentatives ?? MAX_TENTATIVES;
  const base = brief.seed ?? 1;
  const tentatives: Tentative[] = [];
  for (let n = 1; n <= max; n++) {
    if (options.signal?.aborted) throw new ErreurCompilation("Annulée.", tentatives);
    const seed = base + n - 1;
    options.surTentative?.(n, max, seed);
    const debut = Date.now();
    let rep: ReponsePython;
    try {
      const brut = await lancer(options.reglages.python, options.reglages.script, JSON.stringify({ brief: { ...brief, seed }, env: options.reglages.env }), {
        signal: options.signal,
        delaiMs: options.reglages.delaiMs,
      });
      try {
        rep = JSON.parse(brut) as ReponsePython;
      } catch {
        throw new ErreurCompilation(`Réponse illisible du compilateur : ${brut.slice(0, 200)}`);
      }
    } catch (err) {
      if (err instanceof ErreurCompilation) throw new ErreurCompilation(err.message, [...tentatives, { seed, dureeMs: Date.now() - debut, issue: "echec", raison: err.message }]);
      throw err;
    }
    const verdict = jugerReponse(rep);
    const dureeMs = Date.now() - debut;
    if (verdict.ok) {
      tentatives.push({ seed, dureeMs, issue: "ok" });
      return { enveloppe: rep.enveloppe!, fichiers: rep.fichiers ?? {}, tentatives, seedUtilisee: seed };
    }
    tentatives.push({ seed, dureeMs, issue: verdict.relancer && n < max ? "relance" : "echec", raison: verdict.raison });
    if (!verdict.relancer) throw new ErreurCompilation(verdict.raison, tentatives);
  }
  const raisons = tentatives.map((t, i) => `essai ${i + 1} (seed ${t.seed}) : ${t.raison}`).join(" ; ");
  throw new ErreurCompilation(`Open H3 IR n'a pas produit de prompt valide après ${max} essais — ${raisons}. Réessaie, ou change la description du plan.`, tentatives);
}
