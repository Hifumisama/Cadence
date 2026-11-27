/** The lab's page: one self-contained HTML file (data, styles and script inline), opened with a double click. This module only builds the
 * data — measures from `metrics.ts`, findings from the production detectors — and pours it into `page/template.html`. */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gestesRepetes, nomsPersonnagesDeLEntree, phrasesPartagees, signesImmobilite } from "../../lib/agents/stillness";
import { ajusterDureesScene } from "../../lib/agents/treatment";
import { DUREE_GENERATION_MAX } from "../../lib/clips/clip-checks";
import { awaitsReading, LAB_ROOT, readDataset, readRun } from "./files";
import { measureScene, type SceneMetrics } from "./metrics";
import type { CallRecord, Case, Dataset, ReviewCorrection, RunManifest, SceneOutput } from "./types";

type Issue = { kind: "still" | "empty" | "duplicate" | "gesture"; label: string; detail: string; phrases: string[] };

type PlanView = { title: string; description: string; link: string | null; written: number; final: number; strong: boolean; issues: Issue[] };

type SceneView = {
  id: string;
  project: number;
  rank: number;
  title: string;
  target: number;
  moments: string[] | null;
  /** null when the call failed: `error` then says why. */
  metrics: SceneMetrics | null;
  error: string | null;
  plans: PlanView[];
  /** What the database held at export time; only for the historical source. */
  stored: NonNullable<Case["stored"]> | null;
  review: ReviewCorrection[] | null;
  facts: [string, string][];
  /** Paired retry (variant C): where the first generation came from, and whether a second call was made. null for the other sources. */
  retry: Retry | null;
};

type Retry = { from: string; triggered: boolean };

type Source = { id: string; label: string; scenes: SceneView[] };

export type PageData = { dataset: string; exportedAt: string; caseCount: number; maxPlanSeconds: number; sources: Source[] };

export type Run = { manifest: RunManifest; records: CallRecord[] };

/** Without the first output: the page only says whether a second call was made. */
const retryOf = ({ retry }: CallRecord): Retry | null => (retry ? { from: retry.from, triggered: retry.triggered } : null);

function planViews(item: Case, output: SceneOutput, metrics: SceneMetrics): PlanView[] {
  const labelled = output.plans.map((p, i) => ({ plan: `P${i + 1}`, description: p.description ?? "" }));
  const written = output.plans.map((p) => Number(p.dureeSecondes) || 0);
  const final = ajusterDureesScene(written, item.input.scene.dureeCibleSecondes);
  const shared = phrasesPartagees(labelled);
  const gestures = gestesRepetes(labelled);
  return output.plans.map((p, i) => {
    const label = `P${i + 1}`;
    const issues: Issue[] = [];
    if (metrics.emptyPlans.includes(label)) {
      issues.push({ kind: "empty", label: "Plan vide", detail: "Aucun personnage n'y agit.", phrases: [] });
    }
    if (metrics.stillPlans.includes(label)) {
      const phrases = signesImmobilite(p.description ?? "").signes.map((s) => s.phrase);
      issues.push({ kind: "still", label: "Immobile", detail: "Le personnage reste sur place.", phrases });
    }
    for (const d of shared.filter((x) => x.a === label || x.b === label)) {
      const other = d.a === label ? d.b : d.a;
      issues.push({ kind: "duplicate", label: `Doublon avec ${other}`, detail: "Les deux plans partagent des phrases entières.", phrases: d.phrases });
    }
    for (const g of gestures.filter((x) => x.b === label)) {
      issues.push({ kind: "gesture", label: "Gestes répétés", detail: `Rien de neuf après ${g.a} : ${g.familles.join(", ")}.`, phrases: [] });
    }
    return { title: p.titre, description: p.description ?? "", link: p.liaison ?? null, written: written[i]!, final: final[i]!, strong: p.tempsFort === true, issues };
  });
}

function sceneView(item: Case, output: SceneOutput | null, extra: Pick<SceneView, "error" | "stored" | "review" | "facts" | "retry">): SceneView {
  const metrics = output ? measureScene(item.input, output) : null;
  return {
    id: item.id,
    project: item.project,
    rank: item.sceneRank,
    title: item.sceneTitle,
    target: item.input.scene.dureeCibleSecondes,
    moments: item.input.scene.moments ?? null,
    metrics,
    plans: output && metrics ? planViews(item, output, metrics) : [],
    ...extra,
  };
}

const reasoningLabel = (some: boolean): string => (some ? "avec réflexion" : "sans réflexion");

function historySource(dataset: Dataset): Source {
  return {
    id: "historique",
    label: "Historique (appels d'origine)",
    scenes: dataset.cases.map((c) =>
      sceneView(c, c.historical.output, {
        error: null,
        stored: c.stored,
        review: c.review,
        retry: null,
        facts: [
          ["Date", c.historical.createdAt.slice(0, 10)],
          ["Modèle", c.historical.model],
          ["Version du prompt", c.historical.systemHash.slice(0, 8)],
          ["Réflexion", c.historical.reasoningChars > 0 ? "oui" : "non"],
          ["Durée de l'appel", `${Math.round(c.historical.durationMs / 1000)} s`],
          ["Renvois", String(c.historical.resends)],
        ],
      }),
    ),
  };
}

/** One source per variant and repetition of a run. */
function runSources(dataset: Dataset, run: Run): Source[] {
  const byId = new Map(dataset.cases.map((c) => [c.id, c]));
  const { manifest } = run;
  const when = new Date(manifest.startedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const keys = [...new Set(run.records.map((r) => `${r.variant}|${r.repetition}`))].sort();
  return keys.map((key) => {
    const [variant, repetition] = key.split("|") as [string, string];
    const records = run.records.filter((r) => r.variant === variant && String(r.repetition) === repetition && byId.has(r.caseId));
    // A paired variant may have made no call of its own: the setting is then read from the whole run.
    const reusedOnly = records.some((r) => r.retry) && records.every((r) => r.attempts.length === 0);
    const called = reusedOnly ? run.records : records;
    const reasoned = called.some((r) => r.attempts.some((a) => a.reasoning));
    const description = manifest.variants.find((v) => v.id === variant);
    return {
      id: `${manifest.id}-${variant}-r${repetition}`,
      label: `Essai ${when} · ${variant} · répétition ${repetition} · ${reasoningLabel(reasoned)}`,
      scenes: records
        .map((r) => {
          const retry = retryOf(r);
          const reused = r.attempts.length === 0 && retry != null;
          return sceneView(byId.get(r.caseId)!, r.output, {
            error: r.error,
            stored: null,
            review: null,
            retry,
            facts: [
              ["Variante", `${variant} · ${description?.label ?? ""}`],
              ["Modèle", manifest.model],
              ["Version du prompt", description?.systemHash.slice(0, 8) ?? "–"],
              ["Réflexion", reused ? "–" : r.attempts.some((a) => a.reasoning) ? "oui" : "non"],
              ["Durée de l'appel", reused ? `aucun nouvel appel (reprise de ${retry.from})` : `${Math.round(r.attempts.reduce((s, a) => s + a.durationMs, 0) / 1000)} s`],
              ["Renvois", String(r.resends)],
              ["Commit", `${manifest.commit}${manifest.dirty ? " (fichiers modifiés)" : ""}`],
            ],
          });
        })
        .sort((a, b) => a.project - b.project || a.rank - b.rank),
    };
  });
}

export function buildPageData(dataset: Dataset, runs: Run[]): PageData {
  const newestFirst = [...runs].sort((a, b) => b.manifest.startedAt.localeCompare(a.manifest.startedAt));
  return {
    dataset: dataset.name,
    exportedAt: dataset.exportedAt.slice(0, 10),
    caseCount: dataset.cases.length,
    maxPlanSeconds: DUREE_GENERATION_MAX,
    sources: [historySource(dataset), ...newestFirst.flatMap((r) => runSources(dataset, r))],
  };
}

/** The data goes into a JSON script block: `<` is escaped so that no text of the model can close it. */
export function renderPage(data: object, template: string): string {
  const marker = "__DATA__";
  if (template.split(marker).length !== 2) throw new Error("Le gabarit doit contenir exactement un emplacement de données.");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return template.replace(marker, () => json);
}

function readRuns(dataset: string, root: string = resolve(LAB_ROOT, "runs")): { shown: Run[]; hidden: number } {
  if (!existsSync(root)) return { shown: [], hidden: 0 };
  const all = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, "manifest.json")))
    .map((e) => ({ folder: join(root, e.name), ...readRun(join(root, e.name)) }))
    .filter((r) => r.manifest.dataset === dataset);
  const shown = all.filter((r) => !awaitsReading(r.folder, r.manifest));
  return { shown, hidden: all.length - shown.length };
}

/** `hidden`: comparisons left out until their blind votes are in. */
export function writePage(name: string): { file: string; hidden: number } {
  const template = readFileSync(resolve(LAB_ROOT, "src", "page", "template.html"), "utf8");
  const runs = readRuns(name);
  const html = renderPage(buildPageData(readDataset(name), runs.shown), template);
  const file = resolve(LAB_ROOT, "pages", `${name}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return { file, hidden: runs.hidden };
}

export function datasetNames(): string[] {
  const folder = resolve(LAB_ROOT, "datasets");
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}
