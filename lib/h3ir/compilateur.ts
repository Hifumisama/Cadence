import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BriefH3ir } from "./brief";

/** Le pont vers le compilateur Open H3 IR (paquet Python `open-h3-ir`), étape 3 du chantier (docs/PLAN_INTEGRATION_OPEN_H3_IR.md).
 *
 * Un petit script Python lancé PAR APPEL (scripts/h3ir/compiler.py : pas de service permanent). Annuler = tuer le processus et ses enfants : la génération
 * du LLM s'arrête quand la connexion se ferme. Pas de repli silencieux (décision 6) : un brouillon de repli (`degraded`) ou une compilation invalide relance
 * avec la seed suivante, deux fois au plus ; ensuite l'échec est dit clairement, jamais un texte rejeté proposé à sa place.
 *
 * Pur sauf `lancerPythonReel` ; le lanceur est injectable pour les tests. */

/** Ce que le script Python écrit sur stdout. */
export type ReponsePython = { http: number; enveloppe?: EnveloppeH3ir; fichiers?: Record<string, string>; erreur?: string };

/** L'enveloppe de `POST /v1/briefs` (h3ir/service.py:385), réduite à ce que Cadence lit. */
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

/** Un échec expliqué à l'utilisateur ; `tentatives` dit ce qui a été essayé. */
export class ErreurCompilation extends Error {
  constructor(
    message: string,
    readonly tentatives: Tentative[] = [],
  ) {
    super(message);
    this.name = "ErreurCompilation";
  }
}

export type OptionsLancement = { signal?: AbortSignal; delaiMs: number };
/** Lance `python script`, lui écrit `entree` sur stdin et rend son stdout. Rejette si le processus échoue, dépasse le délai ou est annulé. */
export type LanceurPython = (python: string, script: string, entree: string, options: OptionsLancement) => Promise<string>;

export type Env = Record<string, string | undefined>;

export type ReglagesH3ir = {
  python: string;
  script: string;
  delaiMs: number;
  /** Variables posées dans le processus Python avant l'import du paquet (sa config est lue une seule fois). */
  env: Record<string, string>;
};

const DELAI_PAR_DEFAUT_MS = 20 * 60 * 1000;
export const MAX_TENTATIVES = 3;

/** Le Python où `open-h3-ir` est installé : `H3IR_PYTHON`, sinon le venv du banc d'essai (`h3ir-lab`) s'il existe. */
export function pythonH3ir(env: Env = process.env, existe: (chemin: string) => boolean = existsSync): string {
  const voulu = env.H3IR_PYTHON?.trim();
  if (voulu) return voulu;
  for (const rel of ["h3ir-lab/.venv/Scripts/python.exe", "h3ir-lab/.venv/bin/python"]) {
    const chemin = resolve(rel);
    if (existe(chemin)) return chemin;
  }
  throw new ErreurCompilation("Open H3 IR : renseigne H3IR_PYTHON (le Python où le paquet open-h3-ir est installé, par exemple h3ir-lab\\.venv\\Scripts\\python.exe).");
}

/** Réglages du processus Python. `modele` : celui de la traduction (le même modèle, pour ne pas faire décharger llama-swap en plein calcul ; il doit voir les images). */
export function reglagesH3ir(modele: string, env: Env = process.env, existe?: (chemin: string) => boolean): ReglagesH3ir {
  const urlLlm = env.H3IR_LLM_URL?.trim() || `${(env.LLM_LOCAL_URL?.trim() || "http://localhost:8080").replace(/\/+$/, "")}/v1`;
  const delai = Number(env.H3IR_TIMEOUT_MS);
  const variables: Record<string, string> = {
    H3IR_LLM_URL: urlLlm,
    H3IR_LLM_MODEL: modele,
    // Sans cela le modèle recopie le schéma JSON sur les appels qui portent des images.
    H3IR_GUIDED_DECODING: "1",
    // Les fichiers sont désignés par chemin : le compilateur tourne sur la même machine que le stockage.
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

/** Le lanceur réel : `spawn` sans shell. Annulation et délai tuent l'arbre de processus (sous Windows `taskkill /T`, sinon SIGKILL). */
export const lancerPythonReel: LanceurPython = (python, script, entree, { signal, delaiMs }) =>
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

/** Juge une réponse du compilateur. Réussite = 201, `ready`, mode Ref2VA. Un brouillon de repli (`degraded`) ou une compilation invalide se relancent avec
 * une autre seed ; une question, un mode inattendu, un refus de la demande ou un LLM injoignable s'arrêtent tout de suite (une autre seed n'y change rien). */
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
  /** Appelé avant chaque tentative (n commence à 1) : de quoi afficher « tentative 2/3 ». */
  surTentative?: (n: number, sur: number, seed: number) => void;
};

/** Compile le brief ; jusqu'à `maxTentatives` essais (seed, seed+1, seed+2). Renvoie la première réussite, ou lève `ErreurCompilation` avec le détail. */
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
