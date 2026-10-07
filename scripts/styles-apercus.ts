import "dotenv/config";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { MEDIA_ROOT } from "../lib/media";
import { bibliothequeStyles, cheminApercuStyle } from "../lib/styles/bibliotheque";
import { IDS_SUJETS, SUJETS_APERCU } from "../lib/styles/sujets";
import { HttpComfyUIClient } from "../worker/comfyui/httpClient";
import { injecterGenerationImage, NODE_IDS_TEXTE_VERS_IMAGE, type WorkflowJson } from "../worker/comfyui/imageMapping";

/** Génère à la chaîne les images de présentation de chaque style de la bibliothèque, une par scène commune
 * (`lib/styles/sujets.ts` : lecture, nature morte, boule de feu, créature, rue de nuit, coup de pied), sur le ComfyUI
 * configuré (COMFYUI_URL), avec le même workflow qu'une vraie génération d'image (IMG_01_TextToImage, Krea 2 Turbo) : la
 * scène va dans le nœud « prompt », le descripteur du style dans le nœud « style ». Les images sont écrites dans
 * `<MEDIA_ROOT>/styles/<style>/<sujet>.webp` (servies par /api/media).
 *
 *   npm run styles:apercus [-- --only ghibli-style,van-gogh-style] [--sujets lecture,creature] [--limite 10] [--force] [--liste]
 *
 * - Ordre : sujet par sujet (tous les styles sur la lecture, puis tous sur la nature morte…), pour pouvoir juger un sujet
 *   complet avant la fin, et interrompre sans laisser de trou dans un seul sujet.
 * - Reprise : une image déjà produite est sautée (sauf --force). On peut interrompre (Ctrl+C) et relancer.
 * - Seed fixe par style ET sujet (dérivée des identifiants) : relancer avec --force redonne la même image.
 * - Les styles sont traités l'un après l'autre : ne pas lancer pendant une vraie production (le GPU est partagé).
 * - Un échec n'arrête pas la chaîne ; la liste des échecs est affichée à la fin (code de sortie 1). */

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const drapeau = (nom: string) => process.argv.includes(nom);

const INTERVALLE_POLL_MS = 1_500;
const DELAI_MAX_MS = 10 * 60_000;
const MEGAPIXELS = 1;

/** FNV-1a 32 bits : un entier stable pour un identifiant, sans dépendance. */
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
  const tous = bibliothequeStyles();
  const only = arg("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const sujetsVoulus = arg("--sujets")?.split(",").map((s) => s.trim()).filter(Boolean);
  const inconnusSujets = (sujetsVoulus ?? []).filter((id) => !IDS_SUJETS.includes(id));
  if (inconnusSujets.length) throw new Error(`Sujets inconnus : ${inconnusSujets.join(", ")} (valides : ${IDS_SUJETS.join(", ")})`);
  const sujets = SUJETS_APERCU.filter((s) => !sujetsVoulus || sujetsVoulus.includes(s.id));
  const limite = arg("--limite") ? Number(arg("--limite")) : Infinity;
  const force = drapeau("--force");

  if (only) {
    const inconnus = only.filter((id) => !tous.some((s) => s.id === id));
    if (inconnus.length) throw new Error(`Identifiants inconnus : ${inconnus.join(", ")} (voir --liste)`);
  }
  const cibles = tous.filter((s) => !only || only.includes(s.id));
  const existe = (styleId: string, sujetId: string) => existsSync(join(MEDIA_ROOT, cheminApercuStyle(styleId, sujetId)));
  const toutes = sujets.flatMap((sujet) => cibles.map((style) => ({ style, sujet })));
  const aFaire = toutes.filter((t) => force || !existe(t.style.id, t.sujet.id)).slice(0, limite);

  console.log(`${tous.length} styles dans la bibliothèque, ${cibles.length} ciblés × ${sujets.length} sujet(s) = ${toutes.length} images, ${toutes.filter((t) => existe(t.style.id, t.sujet.id)).length} déjà faites, ${aFaire.length} à générer.`);
  if (drapeau("--liste")) {
    for (const sujet of sujets) console.log(`${sujet.id.padEnd(14)} ${cibles.map((s) => (existe(s.id, sujet.id) ? "✓" : "·")).join("")}`);
    return;
  }
  if (!aFaire.length) return;

  if ((process.env.COMFYUI_MODE ?? "stub") !== "http") throw new Error("COMFYUI_MODE=http requis (le mode stub ne génère pas de vraie image).");
  const baseUrl = process.env.COMFYUI_URL;
  if (!baseUrl) throw new Error("COMFYUI_URL manquant dans .env");
  const cheminWorkflow = resolve(process.env.COMFYUI_WORKFLOW_IMAGE_PATH ?? "./workflows/image-refs/IMG_01_TextToImage.json");
  const workflow = JSON.parse(await readFile(cheminWorkflow, "utf-8")) as WorkflowJson;
  const client = new HttpComfyUIClient(baseUrl, cheminWorkflow);
  if (!(await client.healthcheck())) throw new Error(`ComfyUI injoignable (${baseUrl})`);

  const { default: sharp } = await import("sharp");
  sharp.cache(false);
  const brouillons = join(MEDIA_ROOT, "_essais", "styles");
  await mkdir(brouillons, { recursive: true });

  const echecs: { id: string; erreur: string }[] = [];
  const debut = Date.now();
  let faits = 0;
  let interrompu = false;
  process.on("SIGINT", () => {
    if (interrompu) process.exit(130);
    interrompu = true;
    console.log("\nInterruption demandée : fin de l'image en cours, puis arrêt (Ctrl+C encore pour couper net).");
  });

  for (const [i, { style: s, sujet }] of aFaire.entries()) {
    if (interrompu) break;
    const t0 = Date.now();
    const etiquette = `${s.id}/${sujet.id}`;
    const brut = join(brouillons, `${s.id}__${sujet.id}.png`);
    try {
      const graphe = injecterGenerationImage(workflow, {
        prompt: sujet.scene,
        clauseStyle: s.descriptor,
        aspect: sujet.aspect,
        megapixels: MEGAPIXELS,
        seed: String(seedPourStyle(`${s.id}/${sujet.id}`)),
        loraPersonnage: false,
        prefixeSortie: `cadence_style_${s.id}_${sujet.id}`,
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
      const final = join(MEDIA_ROOT, cheminApercuStyle(s.id, sujet.id));
      await mkdir(dirname(final), { recursive: true });
      await sharp(brut).resize({ width: sujet.largeur, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`${final}.partiel`);
      await rename(`${final}.partiel`, final); // écriture atomique : jamais d'image à moitié écrite
      await rm(brut, { force: true });
      faits++;
      const moyenne = (Date.now() - debut) / faits;
      console.log(`[${i + 1}/${aFaire.length}] ${etiquette} ${duree(Date.now() - t0)} · reste ≈ ${duree(moyenne * (aFaire.length - i - 1))}`);
    } catch (e) {
      const erreur = e instanceof Error ? e.message : String(e);
      echecs.push({ id: etiquette, erreur });
      console.error(`[${i + 1}/${aFaire.length}] ${etiquette} ÉCHEC : ${erreur}`);
      await rm(brut, { force: true });
    }
  }

  console.log(`\nTerminé : ${faits} image(s) générée(s) en ${duree(Date.now() - debut)}, ${echecs.length} échec(s)${interrompu ? ", interrompu" : ""}.`);
  if (echecs.length) {
    console.log(`Relancer : npm run styles:apercus (les images déjà faites sont sautées). Échecs : ${echecs.map((e) => e.id).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
