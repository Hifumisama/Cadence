/** Reports in French: one on a dataset (historical calls, no model needed), one comparing the variants of a run. */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readDataset } from "./files";
import { callSeconds, isTruncated, measureScene, median, type SceneMetrics } from "./metrics";
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
  ["Scène", "Prompt", "Cible", "Moments", "Min. plans", "Plans", "Max atteignable", "Brut", "Après code", "Ajouté par le code", "Écart final"],
  measured.map(({ c, m }) => [`${c.project} · ${c.sceneRank}`, c.historical.systemHash.slice(0, 8), m.targetSeconds, m.moments ?? "–", m.minimumPlans, m.plans,m.targetReachable ? m.maxReachableSeconds : `**${m.maxReachableSeconds}**`, m.rawSeconds, m.adjustedSeconds, signed(m.codeSeconds), percent(m.adjustedGap)]),
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

/** What the server said and what the lab measured or estimated, kept apart. Empty for a run without any of it. */
function serverMeasures(manifest: RunManifest, records: CallRecord[]): string {
  const attemptsOf = (v: string) => records.filter((r) => r.variant === v).flatMap((r) => r.attempts);
  const all = manifest.variants.flatMap((v) => attemptsOf(v.id));
  if (!all.some((a) => a.timings || a.reasoningCount || a.memory !== undefined)) return "";
  type Row = [string, (v: string) => string | number];
  const timed = (v: string) => attemptsOf(v).flatMap((a) => (a.timings ? [a.timings] : []));
  const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)} %` : "–");
  const server: Row[] = [
    ["Appels (renvois et relances compris)", (v) => attemptsOf(v).length],
    ["Jetons lus par appel", (v) => Math.round(mean(attemptsOf(v).map((a) => a.tokensIn)))],
    ["Jetons écrits par appel, réflexion comprise", (v) => Math.round(mean(attemptsOf(v).map((a) => a.tokensOut)))],
    ["Lecture du prompt (s)", (v) => (timed(v).length ? mean(timed(v).map((t) => t.promptMs / 1000)) : "–")],
    ["Jetons repris du cache par appel", (v) => (timed(v).length ? Math.round(mean(timed(v).map((t) => t.cacheN))) : "–")],
    ["Vitesse d'écriture (jetons/s)", (v) => {
      const ms = sum(timed(v).map((t) => t.predictedMs));
      return ms ? Math.round((sum(timed(v).map((t) => t.predictedN)) / ms) * 1000) : "–";
    }],
    ["Brouillons MTP acceptés", (v) => share(sum(timed(v).map((t) => t.draftAcceptedN)), sum(timed(v).map((t) => t.draftN)))],
    ["Motifs d'arrêt", (v) => [...new Set(attemptsOf(v).map((a) => a.stop ?? "?"))].map((s) => `${s} ${attemptsOf(v).filter((a) => (a.stop ?? "?") === s).length}`).join(", ")],
  ];
  const counts = (v: string) => attemptsOf(v).flatMap((a) => (a.reasoningCount ? [a.reasoningCount] : []));
  const peaks = (v: string, key: "vramPeakGb" | "ramPeakGb") => attemptsOf(v).flatMap((a) => (a.memory?.[key] != null ? [a.memory[key]!] : []));
  const peak = (v: string, key: "vramPeakGb" | "ramPeakGb") => (peaks(v, key).length ? Math.max(...peaks(v, key)) : "–");
  const methods: [string, string][] = [["tokenizer", "découpeur du serveur"], ["share", "estimation"], ["none", "sans réflexion"]];
  const lab: Row[] = [
    ["Jetons de réflexion par appel", (v) => (counts(v).length ? Math.round(mean(counts(v).map((c) => c.tokens))) : "–")],
    ["… méthode (nombre d'appels)", (v) => methods.flatMap(([m, label]) => (counts(v).some((c) => c.method === m) ? [`${label} ${counts(v).filter((c) => c.method === m).length}`] : [])).join(", ") || "–"],
    ["… textes coupés (compte minimal)", (v) => counts(v).filter((c) => c.textCut).length],
    ["Pic de VRAM observé (Go)", (v) => peak(v, "vramPeakGb")],
    ["Pic de RAM observé (Go)", (v) => peak(v, "ramPeakGb")],
    ["Appels sans relevé mémoire", (v) => attemptsOf(v).filter((a) => !a.memory).length],
  ];
  const ids = manifest.variants.map((v) => v.id);
  const grid = (rows: Row[]) => table(["Mesure", ...ids], rows.map(([label, f]) => [label, ...ids.map(f)]));
  const interval = all.find((a) => a.memory)?.memory?.intervalMs;
  return `## Mesures fournies par le serveur

${grid(server)}

## Relevés et comptages du labo (pas des mesures du serveur d'inférence)

${grid(lab)}

- Jetons de réflexion : le serveur ne les sépare pas. « Découpeur du serveur » : le texte de réflexion gardé, recompté par le
  découpeur du modèle (balises non comprises). « Estimation » : part des caractères appliquée aux jetons écrits.
- Mémoire : relevés de ComfyUI sur la même carte${interval ? `, toutes les ${interval / 1000} s environ` : ""} pendant l'appel. Un pic bref entre deux relevés
  échappe ; la VRAM compte tout ce qui occupe la carte, pas seulement le modèle.
`;
}

export function runReport(manifest: RunManifest, records: CallRecord[], dataset: Dataset): string {
  const byId = new Map(dataset.cases.map((c) => [c.id, c]));
  const measured = records.filter((r) => r.output).map((r) => ({ r, m: measureScene(byId.get(r.caseId)!.input, r.output!) }));
  const of = (variant: string) => measured.filter((x) => x.r.variant === variant);
  const ofRecords = (variant: string) => records.filter((r) => r.variant === variant);
  type Attempt = CallRecord["attempts"][number];
  const own = (r: CallRecord, of: (a: Attempt) => number) => sum(r.attempts.map(of));
  // The base of a PAIRED retry; an own retry (campaign 02) holds both generations in the same record.
  const baseOf = (r: CallRecord) => (r.retry?.from === r.variant ? undefined : records.find((b) => b.variant === r.retry?.from && b.caseId === r.caseId && b.repetition === r.repetition));
  // A paired retry costs its base generation too.
  const cost = (r: CallRecord, of: (a: Attempt) => number) => own(r, of) + (r.retry && baseOf(r) ? own(baseOf(r)!, of) : 0);
  const costSeconds = (r: CallRecord) => callSeconds(r) + (r.retry && baseOf(r) ? callSeconds(baseOf(r)!) : 0);
  // Each triggered retry, its first generation and the second side by side.
  const side = (r: CallRecord, attempts: Attempt[], output: CallRecord["output"]) => {
    const input = byId.get(r.caseId)!.input;
    const m = output ? measureScene(input, output) : null;
    const total = (of: (a: Attempt) => number) => sum(attempts.map(of));
    return [m?.plans ?? "–", m?.rawSeconds ?? "–", total((a) => a.tokensIn), total((a) => a.tokensOut), Math.round(total((a) => a.durationMs) / 1000)];
  };
  const retries = records
    .filter((r) => r.retry?.triggered && (r.retry.from === r.variant || baseOf(r)))
    .map((r) => {
      const base = baseOf(r);
      const split = r.retry!.firstAttempts ?? 0;
      const [firstPlans, firstRaw, firstIn, firstOut, firstTime] = base ? side(base, base.attempts, r.retry!.firstOutput) : side(r, r.attempts.slice(0, split), r.retry!.firstOutput);
      const [plans, raw, tokensIn, tokensOut, time] = side(r, base ? r.attempts : r.attempts.slice(split), r.error ? null : r.output);
      return [r.caseId, ...(base ? [] : [r.variant]), `r${r.repetition}`, `${firstPlans} → ${plans}`, `${firstRaw} → ${raw}`, `${firstIn} + ${tokensIn}`, `${firstOut} + ${tokensOut}`, `${firstTime} + ${time}`];
    });
  const reasoningCampaign = manifest.campaign === "02";
  // The raw duration is the main measure: the code's adjustment adds time without adding matter.
  const rows: [string, (m: SceneMetrics[], v: string) => string | number][] = [
    ["Appels réussis", (m, v) => `${m.length}/${ofRecords(v).length}`],
    ["**Écart brut moyen** (mesure principale)", (m) => percent(mean(m.map((x) => x.rawGap)))],
    ["Écart brut moyen, sans le signe", (m) => percent(mean(m.map((x) => Math.abs(x.rawGap)))).replace("+", "")],
    ["Scènes sous 85 % en brut", (m) => `${m.filter((x) => x.shortOnRaw).length}/${m.length}`],
    ["Cible inatteignable", (m) => `${m.filter((x) => !x.targetReachable).length}/${m.length}`],
    ["Minimum théorique de plans par scène", (m) => mean(m.map((x) => x.minimumPlans))],
    ["Plans produits par scène", (m) => mean(m.map((x) => x.plans))],
    ["Scènes sous le minimum de plans", (m) => `${m.filter((x) => x.plans < x.minimumPlans).length}/${m.length}`],
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
    ["Jetons lus par scène (moyenne)", (_, v) => Math.round(mean(ofRecords(v).map((r) => cost(r, (a) => a.tokensIn))))],
    ["Jetons écrits par scène (moyenne)", (_, v) => Math.round(mean(ofRecords(v).map((r) => cost(r, (a) => a.tokensOut))))],
    ["Sorties tronquées", (_, v) => ofRecords(v).filter(isTruncated).length],
    ...(reasoningCampaign
      ? ([
          ["Échecs techniques", (_, v) => ofRecords(v).filter((r) => r.error && r.errorCode !== "injoignable").length],
          ["Temps médian par scène (s)", (_, v) => Math.round(median(ofRecords(v).filter((r) => r.errorCode !== "injoignable").map(costSeconds)))],
        ] satisfies typeof rows)
      : []),
  ];
  const cells = [...new Set(measured.map((x) => `${x.r.caseId}|${x.r.variant}`))].sort();
  return `# Essai ${manifest.id}

Jeu « ${manifest.dataset} », commit ${manifest.commit}${manifest.dirty ? " (fichiers modifiés hors labo)" : ""}, modèle ${manifest.model}, ${manifest.repetitions} répétition(s).
${manifest.variants.some((v) => v.body) ? "Corps et plafond propres à chaque version :" : `Corps ajouté à la requête : \`${JSON.stringify(manifest.body)}\`.`}
${manifest.variants.map((v) => `- **${v.id}** : ${v.label} (prompt ${v.systemHash.slice(0, 8)}, ${v.systemChars} caractères)${v.body ? ` · \`${JSON.stringify(v.body)}\`, plafond ${v.maxTokens} jetons` : ""}`).join("\n")}

## Comparaison (toutes scènes)

${table(["Mesure", ...manifest.variants.map((v) => v.id)], rows.map(([label, f]) => [label, ...manifest.variants.map((v) => f(of(v.id).map((x) => x.m), v.id))]))}

## Par scène (moyennes des répétitions ; étendue entre parenthèses)

${table(
  ["Scène", "Variante", "Cible", "Moments", "Min. plans", "Plans", "Brut", "Après code", "Rendu"],
  cells.map((cell) => {
    const [id, v] = cell.split("|") as [string, string];
    const m = of(v).filter((x) => x.r.caseId === id).map((x) => x.m);
    const spread = (values: number[]) => `${mean(values)} (${Math.min(...values)}–${Math.max(...values)})`;
    return [id, v, m[0]!.targetSeconds, m[0]!.moments ?? "–", m[0]!.minimumPlans, spread(m.map((x) => x.plans)), spread(m.map((x) => x.rawSeconds)), spread(m.map((x) => x.adjustedSeconds)), "–"];
  }),
)}

« Rendu » reste vide : un essai ne rend aucune vidéo, les durées stockée et rendue n'existent que pour l'historique. Moments
couverts, progression et remplissage ne sont pas mesurés ici : ils se jugent à la lecture.
${retries.length ? `\n## Relances de durée : première génération${reasoningCampaign ? "" : " (B)"} puis relance${reasoningCampaign ? "" : " (C)"}\n\n${table(["Scène", ...(reasoningCampaign ? ["Version"] : []), "Rép.", "Plans", "Brut (s)", "Jetons lus", "Jetons écrits", "Temps (s)"], retries)}\n\nUne relance en échec affiche « – » : ${reasoningCampaign ? "la version" : "C"} garde alors la première génération.\n` : ""}${serverMeasures(manifest, records) ? `\n${serverMeasures(manifest, records)}` : ""}${records.some((r) => r.error) ? `\n## Échecs\n\n${records.filter((r) => r.error).map((r) => `- ${r.caseId} ${r.variant} r${r.repetition} : ${r.error}`).join("\n")}\n` : ""}
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
