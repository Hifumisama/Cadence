import { cablerSortie, NODE_IDS } from "./mapping";

/** Les variantes du banc de mesure vidéo (scripts/banc-video.ts, cahier de tests, bloc E) : le même plan rendu avec des réglages différents, pour comparer
 * temps, mémoire et qualité sans toucher à ComfyUI à la main. Chaque variante part du fichier de workflow du dépôt et n'en change que ce qu'elle dit : tout
 * est écrit ici, en pur (testé), le script ne fait que soumettre et mesurer. */

export type VarianteBanc = {
  id: string;
  libelle: string;
  /** Résolution du rendu (nœud `22:9`), en mégapixels. */
  megapixels: number;
  /** Rendu final avec upscale latent, à ce facteur (nœud `243`) ; absent = rendu natif (sans upscale, avec l'interpolation). */
  upscale?: number;
  /** Nombre d'étapes de la première passe (nœud `22:8`). */
  etapes?: number;
  /** Force du LoRA turbo (nœud `21`, `lora_2`). */
  forceTurbo?: number;
  /** Échantillonneur de la première passe (nœud `22:6`) ; `res_multistep` prend le planificateur `simple`. */
  sampler?: "euler" | "res_multistep";
  /** Décalage de sigma de l'audio (nœud `195`). */
  decalageAudio?: number;
  /** Agrandissement par pixels après le rendu (RTX Video Super Resolution, pack Nvidia VFX), à ce facteur. */
  rtx?: number;
  /** Fichier du LoRA d'accélération (dossier `models/loras` de ComfyUI), à la place de celui du workflow (nœud `21`, `lora_2`). */
  lora?: string;
  /** Où le télécharger, pour le message quand il manque. */
  loraSource?: string;
  /** Grille de sigmas fixe (liste séparée par des virgules) à la place du planificateur : certains LoRA (HyperFlow) la demandent. */
  sigmas?: string;
  /** Remplacements dans le texte du prompt (comparer deux formulations d'un même plan). */
  remplacements?: { de: string; par: string }[];
};

const LORA_LARRYVRH = "minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors";
/** La grille de HyperFlow (8 étapes, décalage vidéo 12 et audio 3 compris), telle que la publie la fiche de sa conversion ComfyUI. */
const SIGMAS_HYPERFLOW = "1.0, 0.931506, 0.839236, 0.703462, 0.5, 0.296538, 0.160764, 0.068494, 0.0";

export const VARIANTES_BANC: VarianteBanc[] = [
  { id: "V1", libelle: "0,2 MP + upscale latent ×2 (le final actuel)", megapixels: 0.2, upscale: 2 },
  { id: "V2", libelle: "0,3 MP natif", megapixels: 0.3 },
  { id: "V3", libelle: "0,4 MP natif", megapixels: 0.4 },
  { id: "V4", libelle: "0,3 MP, 8 étapes, force turbo 0,8", megapixels: 0.3, etapes: 8, forceTurbo: 0.8 },
  { id: "V5", libelle: "0,3 MP + upscale latent ×1,5", megapixels: 0.3, upscale: 1.5 },
  { id: "V6", libelle: "0,4 MP natif + RTX Super Resolution ×2", megapixels: 0.4, rtx: 2 },
  { id: "S1", libelle: "0,4 MP natif, échantillonneur euler", megapixels: 0.4, sampler: "euler" },
  { id: "S2", libelle: "0,4 MP natif, res_multistep + simple (officiel)", megapixels: 0.4, sampler: "res_multistep" },
  { id: "A1", libelle: "0,4 MP natif, décalage audio 3", megapixels: 0.4, decalageAudio: 3 },
  {
    id: "L1",
    libelle: "0,3 MP, LoRA LarryVRH v4 step600 EMA, 4 étapes",
    megapixels: 0.3,
    lora: LORA_LARRYVRH,
    loraSource: "huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI (version « pruned », pour notre modèle élagué)",
    forceTurbo: 1,
    etapes: 4,
  },
  {
    id: "L2",
    libelle: "0,3 MP, LoRA LarryVRH v4 step600 EMA, 8 étapes, euler (recette de la communauté)",
    megapixels: 0.3,
    lora: LORA_LARRYVRH,
    loraSource: "huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI (version « pruned »)",
    forceTurbo: 1,
    etapes: 8,
    sampler: "euler",
  },
  {
    id: "H1",
    libelle: "0,3 MP, HyperFlow 8 étapes (grille de sigmas fixe, euler, audio 3)",
    megapixels: 0.3,
    lora: "minimax_h3_hyperflow_8step_v1.0_comfyui_pruned_bf16.safetensors",
    loraSource: "huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI (version « pruned »)",
    forceTurbo: 1,
    sampler: "euler",
    sigmas: SIGMAS_HYPERFLOW,
    decalageAudio: 3,
  },
  { id: "K1", libelle: "0,3 MP, prompt fourni tel quel (« Hard cut to »)", megapixels: 0.3 },
  {
    id: "K2",
    libelle: "0,3 MP, coupes à la formule du guide officiel (« the camera cuts to »)",
    megapixels: 0.3,
    remplacements: [{ de: "Hard cut to", par: "the camera cuts to" }],
  },
];

/** Les variantes lancées sans précision : trois, pour un premier passage de quelques minutes. */
export const VARIANTES_PAR_DEFAUT = ["V2", "V3", "V4"];

export const NOEUD_RTX = "banc_rtx";
export const NOEUD_SIGMAS = "banc_sigmas";

type Noeud = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type Graphe = Record<string, Noeud>;

const NOEUDS = {
  etapes: "22:8",
  resolution: NODE_IDS.resolution,
  duree: NODE_IDS.dureeVideo,
  turbo: "21",
  sampler: "22:6",
  planificateur: "22:7",
  samplerUpscale: "135:30",
  decalage: "195",
  facteurUpscale: "243",
} as const;

function noeud(g: Graphe, id: string, role: string): Noeud {
  const n = g[id];
  if (!n) throw new Error(`Nœud ${id} (${role}) absent du workflow vidéo : le banc ne sait pas le régler.`);
  return n;
}

/** Le graphe à soumettre pour une variante : durée et graine posées, résolution, étapes, force turbo, échantillonneur, décalage audio et agrandissement selon la
 * variante, sortie câblée comme le fait le worker (`cablerSortie`). Le plan (prompt, références, voix) reste celui du fichier. */
export function preparerGrapheBanc(workflow: Graphe, v: VarianteBanc, opts: { dureeSecondes: number; seed?: string; prompt?: string }): Graphe {
  const g = structuredClone(workflow) as Graphe;
  noeud(g, NOEUDS.duree, "durée").inputs.value = opts.dureeSecondes;
  if (opts.seed) {
    for (const id of [NODE_IDS.seedPremierPass, NODE_IDS.seedUpscale, NODE_IDS.seedSecondPass]) {
      const n = g[id];
      if (!n) continue;
      n.inputs["seed" in n.inputs ? "seed" : "noise_seed"] = Number(opts.seed);
    }
  }
  noeud(g, NOEUDS.resolution, "résolution").inputs.megapixels = v.megapixels;
  if (opts.prompt != null || v.remplacements) {
    const n = noeud(g, NODE_IDS.prompt, "prompt");
    let texte = String(opts.prompt ?? n.inputs.value ?? "");
    for (const r of v.remplacements ?? []) texte = texte.split(r.de).join(r.par);
    n.inputs.value = texte;
  }

  // Le câblage d'upscale n'existe qu'à la résolution de base dans le worker ; le banc l'impose quelle que soit la résolution testée (V5 : 0,3 MP + upscale).
  cablerSortie(g, true, v.upscale != null ? 0.2 : v.megapixels);
  if (v.upscale != null) noeud(g, NOEUDS.facteurUpscale, "facteur d'upscale").inputs["mode.scale"] = v.upscale;

  if (v.etapes != null) noeud(g, NOEUDS.etapes, "nombre d'étapes").inputs.value = v.etapes;
  if (v.forceTurbo != null) {
    const lora = noeud(g, NOEUDS.turbo, "LoRA turbo").inputs.lora_2 as { strength: number };
    lora.strength = v.forceTurbo;
  }
  if (v.sampler) {
    noeud(g, NOEUDS.sampler, "échantillonneur").inputs.sampler_name = v.sampler;
    if (g[NOEUDS.samplerUpscale] && v.upscale != null) g[NOEUDS.samplerUpscale]!.inputs.sampler_name = v.sampler;
    if (v.sampler === "res_multistep") noeud(g, NOEUDS.planificateur, "planificateur").inputs.scheduler = "simple";
  }
  if (v.lora) {
    const lora = noeud(g, NOEUDS.turbo, "LoRA turbo").inputs.lora_2 as { on?: boolean; lora: string; strength: number };
    lora.lora = v.lora;
    lora.on = true;
  }
  if (v.sigmas) {
    g[NOEUD_SIGMAS] = { class_type: "ManualSigmas", inputs: { sigmas: v.sigmas }, _meta: { title: "Banc : grille de sigmas fixe" } };
    noeud(g, "125:12", "échantillonneur principal").inputs.sigmas = [NOEUD_SIGMAS, 0];
  }
  if (v.decalageAudio != null) noeud(g, NOEUDS.decalage, "décalage audio").inputs.shift_audio = v.decalageAudio;
  if (v.rtx != null) {
    const sortie = noeud(g, NODE_IDS.sortieFinale, "sortie finale");
    g[NOEUD_RTX] = {
      class_type: "RTXVideoSuperResolution",
      inputs: {
        images: sortie.inputs.images,
        resize_type: "scale by multiplier",
        "resize_type.scale": v.rtx,
        quality: "HIGHBITRATE_ULTRA",
        strength: 1,
        image_encoding: "8-bit RGB",
      },
      _meta: { title: "Banc : RTX Video Super Resolution" },
    };
    sortie.inputs.images = [NOEUD_RTX, 0];
  }
  return g;
}

/** Des lettres tirées au hasard (graine fixe) pour nommer les clips sans dire de quelle variante ils viennent : « clip-C.mp4 ». Même graine, mêmes lettres. */
export function codesAveugles(ids: string[], graine: number): Record<string, string> {
  let a = graine >>> 0;
  const alea = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lettres = ids.map((_, i) => String.fromCharCode(65 + i));
  for (let i = lettres.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [lettres[i], lettres[j]] = [lettres[j]!, lettres[i]!];
  }
  return Object.fromEntries(ids.map((id, i) => [id, lettres[i]!]));
}

/** Ce que ComfyUI exécuterait (nœuds dont dépend un « Video Combine »), pour vérifier un graphe sans le lancer. */
export function noeudsExecutes(g: Graphe): Set<string> {
  const vus = new Set<string>();
  const pile = Object.keys(g).filter((id) => g[id]!.class_type === "VHS_VideoCombine");
  while (pile.length) {
    const id = pile.pop()!;
    if (vus.has(id)) continue;
    vus.add(id);
    for (const v of Object.values(g[id]!.inputs)) if (Array.isArray(v) && typeof v[0] === "string" && g[v[0]]) pile.push(v[0]);
  }
  return vus;
}
