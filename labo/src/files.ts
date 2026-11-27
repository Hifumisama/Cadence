import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Dataset } from "./types";

export const LAB_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
export const REPO_ROOT = resolve(LAB_ROOT, "..");

export function datasetPath(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`Nom de jeu invalide : « ${name} ».`);
  return resolve(LAB_ROOT, "datasets", `${name}.json`);
}

export function readDataset(name: string): Dataset {
  return JSON.parse(readFileSync(datasetPath(name), "utf8")) as Dataset;
}

export function gitState(): { commit: string; dirty: boolean } {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  // The lab's own files do not count: a run writes there.
  return { commit: git("rev-parse", "--short", "HEAD"), dirty: git("status", "--porcelain", "--", ".", ":(exclude)labo") !== "" };
}
