/** The blind reading of a run: a self-contained page where the versions of a scene come in a random order, without their variant, durations,
 * alerts, notes or inventions. The correspondence goes into a key file that the page does not contain. */

import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CAMPAIGN, type Campaign } from "./campaign";
import { LAB_ROOT, readDataset, readRun } from "./files";
import { renderPage } from "./page";
import type { CallRecord, Case, Dataset, RunManifest } from "./types";

type Proposal = { id: string; plans: { title: string; description: string }[] };

type ReadingScene = {
  title: string;
  intention: string;
  entry: string;
  exit: string;
  moments: string[];
  authorMoments: string;
  authorWords: string[];
  proposals: Proposal[];
};

export type ReadingData = { readingId: string; scenes: ReadingScene[] };

export type ReadingKey = {
  readingId: string;
  run: string;
  proposals: Record<string, { caseId: string; repetition: number; variants: string[] }>;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((x) => (typeof x === "string" ? x : typeof (x as { texte?: unknown })?.texte === "string" ? (x as { texte: string }).texte : JSON.stringify(x))) : [];

function shuffle<T>(values: T[], random: (max: number) => number): T[] {
  const list = [...values];
  for (let i = list.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/** The first repetition where every variant has an output for that case: fixed in advance, so that no version is picked by hand. */
function readRepetition(manifest: RunManifest, records: CallRecord[], caseId: string): CallRecord[] {
  for (let repetition = 1; repetition <= manifest.repetitions; repetition++) {
    const found = manifest.variants.map((v) => records.find((r) => r.caseId === caseId && r.variant === v.id && r.repetition === repetition && r.output));
    if (found.every(Boolean)) return found as CallRecord[];
  }
  throw new Error(`Scène ${caseId} : aucune répétition où toutes les variantes ont une sortie.`);
}

export function buildReading(
  dataset: Dataset,
  manifest: RunManifest,
  records: CallRecord[],
  campaign: Campaign = CAMPAIGN,
  random: (max: number) => number = randomInt,
  readingId: string = randomBytes(6).toString("hex"),
): { data: ReadingData; key: ReadingKey } {
  const cases = campaign.readScenes.map((prefix) => {
    const found = dataset.cases.find((c) => manifest.cases.includes(c.id) && (c.id === prefix || c.id.startsWith(`${prefix}-`)));
    if (!found) throw new Error(`La scène « ${prefix} » du protocole n'est pas dans cet essai.`);
    return found;
  });
  const key: ReadingKey = { readingId, run: manifest.id, proposals: {} };
  const scenes = cases.map((item: Case, sceneIndex): ReadingScene => {
    // Identical texts (C without retry, most often) are read once.
    const distinct = new Map<string, { plans: Proposal["plans"]; variants: string[]; repetition: number }>();
    for (const record of readRepetition(manifest, records, item.id)) {
      const plans = record.output!.plans.map((p) => ({ title: p.titre, description: p.description }));
      const same = JSON.stringify(plans);
      const known = distinct.get(same);
      if (known) known.variants.push(record.variant);
      else distinct.set(same, { plans, variants: [record.variant], repetition: record.repetition });
    }
    const proposals = shuffle([...distinct.values()], random).map((p, i): Proposal => {
      const id = `s${sceneIndex + 1}-t${i + 1}`;
      key.proposals[id] = { caseId: item.id, repetition: p.repetition, variants: p.variants };
      return { id, plans: p.plans };
    });
    const scene = item.input.scene;
    return {
      title: item.sceneTitle,
      intention: text(scene.intention),
      entry: text(scene.etatEntree),
      exit: text(scene.etatSortie),
      moments: scene.moments ?? [],
      authorMoments: text(scene.momentsDeLAuteur),
      authorWords: texts(item.input.parolesDeLAuteur),
      proposals,
    };
  });
  return { data: { readingId, scenes }, key };
}

export function writeReading(folder: string): string {
  const target = join(folder, "reading");
  const keyFile = join(target, "key.json");
  // A second draw would reshuffle the texts under the votes already given.
  if (existsSync(keyFile)) throw new Error(`La lecture existe déjà : ${join(target, "reading.html")}.`);
  const { manifest, records } = readRun(folder);
  const { data, key } = buildReading(readDataset(manifest.dataset), manifest, records);
  const template = readFileSync(resolve(LAB_ROOT, "src", "page", "reading.html"), "utf8");
  mkdirSync(target, { recursive: true });
  const file = join(target, "reading.html");
  writeFileSync(file, renderPage(data, template));
  writeFileSync(keyFile, `${JSON.stringify(key, null, 2)}\n`);
  return file;
}
