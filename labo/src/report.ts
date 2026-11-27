/** Reports in French: one on a dataset (historical calls, no model needed), one comparing the variants of a run. */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readDataset } from "./files";
import { measureScene, type SceneMetrics } from "./metrics";
import type { CallRecord, Case, Dataset, RunManifest } from "./types";

const percent = (value: number): string => `${value > 0 ? "+" : ""}${Math.round(value * 100)} %`;
const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));
const table = (head: string[], rows: (string | number)[][]): string => [head, head.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n");
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const list = (values: string[]): string => (values.length ? values.join(" ") : "–");

const LIMITS = `## Ce que ces mesures ne disent pas

- Aucune ne dit qu'une scène est bonne : ce sont des comptes et des heuristiques sur le texte français.
- « Immobile », « vide », « doublon » et « gestes répétés » sont les détecteurs de production, réglés pour la précision : un zéro ne prouve pas l'absence du défaut.
- La progression narrative et le remplissage se jugent à la lecture.
- Les mots par seconde mesurent une quantité de texte, pas une quantité d'histoire.
`;

function rendersByLink(dataset: Dataset): (string | number)[][] {
  const rendered = dataset.cases.flatMap((c) => c.stored?.plans ?? []).filter((p) => p.askedSeconds != null && p.measuredSeconds != null);
  return [...new Set(rendered.map((p) => p.link ?? "–"))].sort().map((link) => {
    const group = rendered.filter((p) => (p.link ?? "–") === link);
    return [link, group.length, mean(group.map((p) => p.askedSeconds!)), mean(group.map((p) => p.measuredSeconds!)), mean(group.map((p) => p.measuredSeconds! - p.askedSeconds!))];
  });
}

function datasetReport(dataset: Dataset): string {
  const measured = dataset.cases.map((c) => ({ c, m: measureScene(c.input, c.historical.output) }));
  const versions = [...new Set(dataset.cases.map((c) => c.historical.systemHash.slice(0, 8)))];
  const storedSum = (c: Case, key: "storedSeconds" | "measuredSeconds"): string | number => {
    const values = c.stored?.plans.map((p) => p[key]) ?? [];
    return values.length && values.every((v) => v != null) ? Math.round(sum(values as number[]) * 10) / 10 : "–";
  };
  return `# Jeu « ${dataset.name} » : les appels historiques

Exporté le ${dataset.exportedAt.slice(0, 10)} (commit ${dataset.commit}). ${dataset.cases.length} scènes, aucun appel au modèle.
Versions du prompt rencontrées : ${versions.join(", ")}. Appels avec réflexion : ${dataset.cases.filter((c) => c.historical.reasoningChars > 0).length}/${dataset.cases.length}.

**Les scènes ne sont pas comparables entre versions du prompt** : ce tableau décrit le passé, il ne compare pas de variantes.

## Durées (sortie du modèle, puis code actuel)

${table(
  ["Scène", "Prompt", "Cible", "Moments", "Plans", "Max atteignable", "Brut", "Après code", "Ajouté par le code", "Écart final"],
  measured.map(({ c, m }) => [`${c.project} · ${c.sceneRank}`, c.historical.systemHash.slice(0, 8), m.targetSeconds, m.moments ?? "–", m.plans, m.targetReachable ? m.maxReachableSeconds : `**${m.maxReachableSeconds}**`, m.rawSeconds, m.adjustedSeconds, signed(m.codeSeconds), percent(m.adjustedGap)]),
)}

- Cible inatteignable (max atteignable en gras) : **${measured.filter((x) => !x.m.targetReachable).length}/${measured.length}** scènes.
- Total : ${sum(measured.map((x) => x.m.targetSeconds))} s visées, ${sum(measured.map((x) => x.m.rawSeconds))} s écrites par le modèle, ${sum(measured.map((x) => x.m.adjustedSeconds))} s après ajustement (${signed(sum(measured.map((x) => x.m.codeSeconds)))} s ajoutées par le code).
- « Après code » est recalculé avec la règle actuelle (\`ajusterDureesScene\`) ; la valeur appliquée à l'époque peut différer.

## Texte

${table(
  ["Scène", "Mots de récit", "Mots/s (brut)", "Mots/s (final)", "Répliques", "Immobiles", "Vides", "Doublons", "Gestes répétés", "Renvoi"],
  measured.map(({ c, m }) => [`${c.project} · ${c.sceneRank}`, m.narrativeWords, m.wordsPerRawSecond, m.wordsPerAdjustedSecond, m.dialogueLines, list(m.stillPlans), list(m.emptyPlans), list(m.duplicatePairs), list(m.repeatedGesturePairs), c.historical.resends]),
)}

## En base aujourd'hui (après relecture et retouches à la main)

${table(
  ["Scène", "Titre en base", "Plans produits → stockés", "Durée stockée", "Durée mesurée des rendus", "Corrections de relecture"],
  measured.map(({ c, m }) => [
    `${c.project} · ${c.sceneRank}`,
    c.stored?.title ?? "–",
    `${m.plans} → ${c.stored?.plans.length ?? "–"}`,
    storedSum(c, "storedSeconds"),
    storedSum(c, "measuredSeconds"),
    c.review == null ? "–" : list(c.review.map((r) => `${r.handle} ${r.type} (${r.criterion})`)),
  ]),
)}

La durée mesurée est celle du dernier rendu réussi de chaque plan stocké ; « – » si un plan n'en a pas.

## Durée demandée et durée du fichier, selon la liaison

${table(["Liaison", "Plans rendus", "Demandé (moyenne, s)", "Mesuré (moyenne, s)", "Écart moyen (s)"], rendersByLink(dataset))}

${LIMITS}`;
}

const mean = (values: number[]): number => (values.length ? Math.round((sum(values) / values.length) * 100) / 100 : 0);

export function runReport(manifest: RunManifest, records: CallRecord[], dataset: Dataset): string {
  const byId = new Map(dataset.cases.map((c) => [c.id, c]));
  const measured = records.filter((r) => r.output).map((r) => ({ r, m: measureScene(byId.get(r.caseId)!.input, r.output!) }));
  const of = (variant: string) => measured.filter((x) => x.r.variant === variant);
  const ofRecords = (variant: string) => records.filter((r) => r.variant === variant);
  const ownSeconds = (r: CallRecord) => sum(r.attempts.map((a) => a.durationMs)) / 1000;
  // A paired retry costs its base generation too.
  const costSeconds = (r: CallRecord) => ownSeconds(r) + (r.retry ? sum(records.filter((b) => b.variant === r.retry!.from && b.caseId === r.caseId && b.repetition === r.repetition).map(ownSeconds)) : 0);
  // The raw duration is the main measure: the code's adjustment adds time without adding matter.
  const rows: [string, (m: SceneMetrics[], v: string) => string | number][] = [
    ["Appels réussis", (m, v) => `${m.length}/${ofRecords(v).length}`],
    ["**Écart brut moyen** (mesure principale)", (m) => percent(mean(m.map((x) => x.rawGap)))],
    ["Écart brut moyen, sans le signe", (m) => percent(mean(m.map((x) => Math.abs(x.rawGap)))).replace("+", "")],
    ["Scènes sous 85 % en brut", (m) => `${m.filter((x) => x.shortOnRaw).length}/${m.length}`],
    ["Cible inatteignable", (m) => `${m.filter((x) => !x.targetReachable).length}/${m.length}`],
    ["Plans par scène", (m) => mean(m.map((x) => x.plans))],
    ["Mots de récit par seconde (brut)", (m) => mean(m.map((x) => x.wordsPerRawSecond))],
    ["Inventions déclarées par scène", (m) => mean(m.map((x) => x.declaredInventions))],
    ["Écart final moyen (après code)", (m) => percent(mean(m.map((x) => x.adjustedGap)))],
    ["Secondes ajoutées par le code (moyenne)", (m) => mean(m.map((x) => x.codeSeconds))],
    ["Plans immobiles", (m) => sum(m.map((x) => x.stillPlans.length))],
    ["Plans vides", (m) => sum(m.map((x) => x.emptyPlans.length))],
    ["Paires en doublon", (m) => sum(m.map((x) => x.duplicatePairs.length))],
    ["Paires aux gestes répétés", (m) => sum(m.map((x) => x.repeatedGesturePairs.length))],
    ["Appels avec renvoi de production", (_, v) => ofRecords(v).filter((r) => r.resends > 0).length],
    ["Relances de durée", (_, v) => (ofRecords(v).some((r) => r.retry) ? `${ofRecords(v).filter((r) => r.retry?.triggered).length}/${ofRecords(v).length}` : "–")],
    ["Appels avec réflexion", (_, v) => ofRecords(v).filter((r) => r.attempts.some((a) => a.reasoning)).length],
    ["Temps de modèle moyen par scène (s)", (_, v) => mean(ofRecords(v).map(costSeconds))],
  ];
  const cells = [...new Set(measured.map((x) => `${x.r.caseId}|${x.r.variant}`))].sort();
  return `# Essai ${manifest.id}

Jeu « ${manifest.dataset} », commit ${manifest.commit}${manifest.dirty ? " (fichiers modifiés hors labo)" : ""}, modèle ${manifest.model}, ${manifest.repetitions} répétition(s).
Corps ajouté à la requête : \`${JSON.stringify(manifest.body)}\`.
${manifest.variants.map((v) => `- **${v.id}** : ${v.label} (prompt ${v.systemHash.slice(0, 8)}, ${v.systemChars} caractères)`).join("\n")}

## Comparaison (toutes scènes)

${table(["Mesure", ...manifest.variants.map((v) => v.id)], rows.map(([label, f]) => [label, ...manifest.variants.map((v) => f(of(v.id).map((x) => x.m), v.id))]))}

## Par scène (moyennes des répétitions ; étendue entre parenthèses)

${table(
  ["Scène", "Variante", "Cible", "Moments", "Plans", "Brut", "Après code"],
  cells.map((cell) => {
    const [id, v] = cell.split("|") as [string, string];
    const m = of(v).filter((x) => x.r.caseId === id).map((x) => x.m);
    const spread = (values: number[]) => `${mean(values)} (${Math.min(...values)}–${Math.max(...values)})`;
    return [id, v, m[0]!.targetSeconds, m[0]!.moments ?? "–", spread(m.map((x) => x.plans)), spread(m.map((x) => x.rawSeconds)), spread(m.map((x) => x.adjustedSeconds))];
  }),
)}

Un essai ne rend aucune vidéo : durées stockée et rendue n'existent que pour l'historique. Moments couverts, progression et
remplissage ne sont pas mesurés ici : ils se jugent à la lecture.
${records.some((r) => r.error) ? `\n## Échecs\n\n${records.filter((r) => r.error).map((r) => `- ${r.caseId} ${r.variant} r${r.repetition} : ${r.error}`).join("\n")}\n` : ""}
${LIMITS}`;
}

export function reportOfDataset(name: string): string {
  return datasetReport(readDataset(name));
}

export function reportOfRun(folder: string): string {
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as RunManifest;
  const records = readdirSync(join(folder, "calls"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(folder, "calls", f), "utf8")) as CallRecord);
  return runReport(manifest, records, readDataset(manifest.dataset));
}
