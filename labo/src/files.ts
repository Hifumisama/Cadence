import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CallRecord, Dataset, RunManifest } from "./types";

export const LAB_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
export const REPO_ROOT = resolve(LAB_ROOT, "..");

export function datasetPath(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`Nom de jeu invalide : « ${name} ».`);
  return resolve(LAB_ROOT, "datasets", `${name}.json`);
}

export function readDataset(name: string): Dataset {
  return JSON.parse(readFileSync(datasetPath(name), "utf8")) as Dataset;
}

export function readRun(folder: string): { manifest: RunManifest; records: CallRecord[] } {
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as RunManifest;
  const calls = join(folder, "calls");
  const records = existsSync(calls)
    ? readdirSync(calls)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(calls, f), "utf8")) as CallRecord)
    : [];
  return { manifest, records };
}

const voted = (folder: string, reading: string) => existsSync(join(folder, reading, "votes.json"));

/** A comparison of variants whose blind votes are not in yet, or whose confirmation duels are drawn and not answered: its results are not
 * shown, so that the reader stays blind. */
export const awaitsReading = (folder: string, manifest: RunManifest): boolean =>
  manifest.campaign === "04"
    ? !voted(folder, "duels")
    : (manifest.variants.length > 1 && !voted(folder, "reading")) || (existsSync(join(folder, "confirmation", "key.json")) && !voted(folder, "confirmation"));

export function gitState():{ commit: string; dirty: boolean } {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  // The lab's own files do not count: a run writes there.
  return { commit: git("rev-parse", "--short", "HEAD"), dirty: git("status", "--porcelain", "--", ".", ":(exclude)labo") !== "" };
}
