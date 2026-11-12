import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { decoderListeModeles, llmJoignable } from "../worker/llamaSwap";
import { analyserWorkflow, type Graphe, type ObjectInfo } from "../lib/renders/gpu-verification";

/** Checks a GPU machine before a session (remote PC, RunPod Pod):
 *   npm run gpu:verifier                  (uses COMFYUI_URL and LLM_LOCAL_URL from .env)
 *   npm run gpu:verifier -- --comfyui http://cadence-gpu:8188 --llm http://cadence-gpu:8080
 * 1. ComfyUI: each workflow in workflows/ is checked against /object_info (nodes installed, model files
 *    present in the loader lists);
 * 2. llama-swap: reachable, and the models Cadence requests (.env) are declared.
 * Read-only: launches no render and loads no language model. Exit code 1 if something is missing. */

const arg = (nom: string) => {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sansSlash = (u: string) => u.replace(/\/+$/, "");

function workflows(racine: string): { nom: string; chemin: string }[] {
  const out: { nom: string; chemin: string }[] = [];
  for (const e of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, e.name);
    if (e.isDirectory()) out.push(...workflows(chemin));
    else if (e.name.endsWith(".json")) out.push({ nom: chemin.replace(/\\/g, "/"), chemin });
  }
  return out;
}

async function controlerComfyui(url: string): Promise<boolean> {
  console.log(`\nComfyUI · ${url}`);
  let info: ObjectInfo;
  try {
    const res = await fetch(`${url}/object_info`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    info = (await res.json()) as ObjectInfo;
  } catch (e) {
    console.log(`  ✗ injoignable : ${(e as Error).message}`);
    return false;
  }
  console.log(`  ${Object.keys(info).length} nodes connus.`);
  let tout = true;
  for (const { nom, chemin } of workflows("workflows")) {
    let graphe: Graphe;
    try {
      graphe = JSON.parse(readFileSync(chemin, "utf8")) as Graphe;
    } catch {
      continue; // not an API-format graph
    }
    const r = analyserWorkflow(nom, graphe, info);
    if (r.ok) {
      console.log(`  ✓ ${nom}`);
      continue;
    }
    tout = false;
    console.log(`  ✗ ${nom}`);
    for (const c of r.noeudsAbsents) console.log(`      node absent     ${c}`);
    for (const f of r.fichiersAbsents) console.log(`      fichier absent  ${f.valeur}   (${f.classe}.${f.champ})`);
  }
  return tout;
}

async function controlerLlm(url: string): Promise<boolean> {
  console.log(`\nllama-swap · ${url}`);
  if (!(await llmJoignable(url, fetch, process.env.LLM_HEALTH_PATH ?? "/health"))) {
    console.log("  ✗ injoignable (ou /health ne répond pas)");
    return false;
  }
  let declares: string[] | null = null;
  try {
    const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(10_000) });
    declares = decoderListeModeles(await res.json());
  } catch {
    /* handled below */
  }
  if (!declares) {
    console.log("  ✗ /v1/models illisible");
    return false;
  }
  console.log(`  modèles déclarés : ${declares.join(", ") || "(aucun)"}`);
  // The models Cadence will request: the default and those set skill by skill in the .env.
  const voulus = new Set<string>();
  if (process.env.LLM_LOCAL_MODELE) voulus.add(process.env.LLM_LOCAL_MODELE);
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith("LLM_MODELE_") && v) voulus.add(v);
  let tout = true;
  for (const m of voulus) {
    const present = declares.includes(m);
    if (!present) tout = false;
    console.log(`  ${present ? "✓" : "✗"} ${m}${present ? "" : "   (demandé par le .env, absent du serveur)"}`);
  }
  if (voulus.size === 0) console.log("  (aucun modèle fixé dans le .env : LLM_LOCAL_MODELE absent)");
  return tout;
}

async function main() {
  const comfy = arg("--comfyui") ?? process.env.COMFYUI_URL;
  const llm = arg("--llm") ?? process.env.LLM_LOCAL_URL;
  if (!comfy || !llm) {
    console.error("COMFYUI_URL et LLM_LOCAL_URL (ou --comfyui et --llm) sont nécessaires.");
    process.exit(2);
  }
  const a = await controlerComfyui(sansSlash(comfy));
  const b = await controlerLlm(sansSlash(llm));
  console.log(a && b ? "\nTout est en place." : "\nIl manque des éléments (voir ✗ ci-dessus).");
  process.exit(a && b ? 0 : 1);
}

main();
