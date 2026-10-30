// Simule le worker : enchaîne LABO_PROD_1_GEN, _2_UPSCALE et _3_FIN sur un ComfyUI, en injectant les champs du contrat
// (dossier des latents, graine) et en chronométrant chaque étape.
//
//   COMFYUI_URL=http://<hôte>:8188 node workflows/labo/simuler-prod.mjs [--seed 123] [--etapes gen,upscale,fin] [--dossier sim_xxx]
//
// Sans --dossier, un dossier neuf est créé (output/h3_latents/<dossier>/gen et /up). Pour reprendre une étape seule
// (par ex. relancer fin), repasser le même --dossier.
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));
const url = process.env.COMFYUI_URL;
if (!url) throw new Error("COMFYUI_URL requis (ex. http://localhost:8188)");

const arg = (nom, defaut) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : defaut;
};
const seed = Number(arg("seed", Math.floor(Math.random() * 2 ** 40)));
const dossier = arg("dossier", `sim_${new Date().toISOString().replace(/\W/g, "").slice(0, 14)}`);
const etapes = arg("etapes", "gen,upscale,fin").split(",");
const clientId = `simulation-${Date.now()}`;

const charger = async (fichier) => JSON.parse(await readFile(join(ici, fichier), "utf8"));

// Ce que le worker injectera : chaque étape est décrite par ses nœuds d'entrée.
const injections = {
  gen: (g) => {
    g["16"].inputs.seed = seed;
    g["302"].inputs.filename_prefix = `h3_latents/${dossier}/gen/clip`;
    g["302"].inputs.clip_index = 1;
  },
  upscale: (g) => {
    g["310"].inputs.latent_path = `h3_latents/${dossier}/gen`;
    g["310"].inputs.clip_index = 1;
    g["103"].inputs.seed = seed;
    g["303"].inputs.filename_prefix = `h3_latents/${dossier}/up/clip`;
    g["303"].inputs.clip_index = 1;
  },
  fin: (g) => {
    g["310"].inputs.latent_path = `h3_latents/${dossier}/gen`;
    g["320"].inputs.latent_path = `h3_latents/${dossier}/up`;
    g["34"].inputs.filename_prefix = `prod_fin_${dossier}`;
  },
};
const fichiers = { gen: "LABO_PROD_1_GEN.json", upscale: "LABO_PROD_2_UPSCALE.json", fin: "LABO_PROD_3_FIN.json" };

async function lancer(nom) {
  const graphe = await charger(fichiers[nom]);
  injections[nom](graphe);
  const debut = Date.now();
  const res = await fetch(`${url}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: graphe, client_id: clientId }),
  });
  const corps = await res.json();
  if (!res.ok) throw new Error(`${nom} refusé par ComfyUI : ${JSON.stringify(corps).slice(0, 1500)}`);
  const id = corps.prompt_id;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const h = await (await fetch(`${url}/history/${id}`)).json();
    const entree = h[id];
    if (!entree) continue;
    const statut = entree.status?.status_str;
    if (statut === "error") throw new Error(`${nom} en erreur : ${JSON.stringify(entree.status.messages?.at(-1))?.slice(0, 1500)}`);
    if (entree.status?.completed) {
      const secondes = Math.round((Date.now() - debut) / 1000);
      console.log(`${nom.padEnd(8)} ${String(secondes).padStart(4)} s   sorties : ${Object.keys(entree.outputs ?? {}).join(", ") || "(aucune dans /history)"}`);
      return secondes;
    }
  }
}

// Envoie dans le `input` de ComfyUI les fichiers de workflows/labo/essais/ qu'il n'a pas déjà (jamais d'écrasement).
async function envoyerEssais() {
  const noms = (await readdir(join(ici, "essais"))).filter((n) => !n.startsWith("."));
  for (const nom of noms) {
    const existe = await fetch(`${url}/view?${new URLSearchParams({ filename: nom, type: "input" })}`, { method: "HEAD" });
    if (existe.ok) {
      console.log(`essai    ${nom} : déjà présent`);
      continue;
    }
    const form = new FormData();
    form.append("image", new Blob([await readFile(join(ici, "essais", nom))]), nom);
    form.append("type", "input");
    form.append("overwrite", "false");
    const res = await fetch(`${url}/upload/image`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`envoi de ${nom} refusé : ${res.status} ${(await res.text()).slice(0, 300)}`);
    console.log(`essai    ${nom} : envoyé`);
  }
}

console.log(`dossier ${dossier}, seed ${seed}, étapes ${etapes.join(" → ")}`);
if (!process.argv.includes("--sans-envoi")) await envoyerEssais();
let total = 0;
for (const nom of etapes) total += await lancer(nom);
console.log(`total    ${String(total).padStart(4)} s   (chaîne en une passe, mesurée : 433 s)`);
console.log(`latents  output/h3_latents/${dossier}/{gen,up}/clip_00001.safetensors`);
