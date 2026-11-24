import "dotenv/config";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { MEDIA_ROOT } from "../lib/media";
import { bibliothequeStyles, cheminApercuStyle as cheminApercu } from "../lib/styles/library";
import { APERCUS_STYLES } from "../lib/styles/showcase";
import { HttpComfyUIClient } from "../worker/comfyui/httpClient";
import { injecterGenerationImage, NODE_IDS_TEXTE_VERS_IMAGE, type WorkflowJson } from "../worker/comfyui/imageMapping";

/** Generates the showcase image of each library style (lib/styles/showcase.ts, ticket 06): ONE 16:9 image per style, its title painted in,
 * on the configured ComfyUI (COMFYUI_URL), with the same workflow as a real image generation (IMG_01_TextToImage, H3 Image): the scene goes
 * into the « prompt » node, the style's descriptor into the « style » node. Written to `<MEDIA_ROOT>/styles/<id>/apercu.webp`.
 *
 *   npx tsx scripts/styles-apercus.ts [--only ghibli-style,8-bit-style] [--force] [--seed-plus 1]
 *
 * - Resumable: an image already there is skipped (unless --force). Ctrl+C stops after the current image.
 * - Fixed seed per style (from its id, shifted by --seed-plus to try another draw): --force gives the same image again.
 * - A failure does not stop the batch; the failures are listed at the end (exit code 1). The GPU is shared: not during a production. */

const arg = (nom: string): string | undefined => {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const INTERVALLE_POLL_MS = 1_500;
const DELAI_MAX_MS = 10 * 60_000;
const MEGAPIXELS = 2;
const LARGEUR = 1600;

/** FNV-1a 32 bits: a stable integer for an id, without dependency. */
export function seedPourStyle(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const duree = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")} s`);

async function main() {
  const bibliotheque = new Map(bibliothequeStyles().map((s) => [s.id, s]));
  const only = arg("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const decalage = Number(arg("--seed-plus") ?? 0);
  const force = process.argv.includes("--force");
  const inconnus = APERCUS_STYLES.filter((a) => !bibliotheque.has(a.id)).map((a) => a.id);
  if (inconnus.length) throw new Error(`Styles absents de la bibliothèque : ${inconnus.join(", ")}`);
  const cibles = APERCUS_STYLES.filter((a) => !only || only.includes(a.id));
  const aFaire = cibles.filter((a) => force || !existsSync(join(MEDIA_ROOT, cheminApercu(a.id))));
  console.log(`${cibles.length} style(s) ciblé(s), ${aFaire.length} aperçu(s) à générer.`);
  if (!aFaire.length) return;

  if ((process.env.COMFYUI_MODE ?? "stub") !== "http") throw new Error("COMFYUI_MODE=http requis (le mode stub ne génère pas de vraie image).");
  const baseUrl = process.env.COMFYUI_URL;
  if (!baseUrl) throw new Error("COMFYUI_URL manquant dans .env");
  const cheminWorkflow = resolve(process.env.COMFYUI_WORKFLOW_IMAGE_PATH ?? "./workflows/image-refs/IMG_01_TextToImage.json");
  const workflow = JSON.parse(await readFile(cheminWorkflow, "utf-8")) as WorkflowJson;
  const client = new HttpComfyUIClient(baseUrl);
  if (!(await client.healthcheck())) throw new Error(`ComfyUI injoignable (${baseUrl})`);

  const { default: sharp } = await import("sharp");
  sharp.cache(false);
  const brouillons = join(MEDIA_ROOT, "_essais", "styles");
  await mkdir(brouillons, { recursive: true });

  const echecs: string[] = [];
  const debut = Date.now();
  let faits = 0;
  let interrompu = false;
  process.on("SIGINT", () => {
    if (interrompu) process.exit(130);
    interrompu = true;
    console.log("\nInterruption : fin de l'image en cours, puis arrêt (Ctrl+C encore pour couper net).");
  });

  for (const [i, a] of aFaire.entries()) {
    if (interrompu) break;
    const t0 = Date.now();
    const brut = join(brouillons, `${a.id}__apercu.png`);
    try {
      const graphe = injecterGenerationImage(workflow, {
        prompt: a.scene,
        clauseStyle: bibliotheque.get(a.id)!.descriptor,
        aspect: "16:9",
        megapixels: MEGAPIXELS,
        seed: String(seedPourStyle(a.id) + decalage),
        prefixeSortie: `cadence_apercu_${a.id}`,
      });
      const promptId = await client.submitGraph(graphe);
      let sortie: string | null = null;
      while (Date.now() - t0 < DELAI_MAX_MS) {
        const r = await client.pollImage(promptId, NODE_IDS_TEXTE_VERS_IMAGE.sortie);
        if (r.statut === "erreur") throw new Error(r.message);
        if (r.statut === "termine") {
          sortie = r.cheminSortieDistant;
          break;
        }
        await pause(INTERVALLE_POLL_MS);
      }
      if (!sortie) throw new Error("Délai dépassé (10 min)");
      await client.fetchOutput(sortie, brut);
      const final = join(MEDIA_ROOT, cheminApercu(a.id));
      await mkdir(dirname(final), { recursive: true });
      await sharp(brut).resize({ width: LARGEUR, withoutEnlargement: true }).webp({ quality: 84 }).toFile(`${final}.partiel`);
      await rename(`${final}.partiel`, final); // atomic: never a half-written image
      await rm(brut, { force: true });
      faits++;
      console.log(`[${i + 1}/${aFaire.length}] ${a.id} ${duree(Date.now() - t0)} · reste ≈ ${duree(((Date.now() - debut) / faits) * (aFaire.length - i - 1))}`);
    } catch (e) {
      echecs.push(a.id);
      console.error(`[${i + 1}/${aFaire.length}] ${a.id} ÉCHEC : ${e instanceof Error ? e.message : String(e)}`);
      await rm(brut, { force: true });
    }
  }
  console.log(`\nTerminé : ${faits} aperçu(s) en ${duree(Date.now() - debut)}, ${echecs.length} échec(s)${interrompu ? ", interrompu" : ""}.`);
  if (echecs.length) {
    console.log(`Échecs : ${echecs.join(", ")} (relancer : les aperçus déjà faits sont sautés)`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
