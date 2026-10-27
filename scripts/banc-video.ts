/** Banc de mesure vidéo (cahier de tests, bloc E) : soumet à un ComfyUI le même plan rendu avec plusieurs variantes de réglages (résolution, étapes, force du
 * turbo, upscale, échantillonneur…), et rapporte pour chacune le temps de rendu et le pic de mémoire GPU. Les clips sont enregistrés sous des lettres tirées au hasard
 * (clip-A.mp4…) : on les compare à l'œil sans savoir lesquels sont lesquels ; la correspondance est dans cle.json, à ouvrir après.
 *
 *   npm run banc:video -- --liste
 *   npm run banc:video -- --url http://127.0.0.1:8188 --variantes V2,V3,V4 --duree 6
 *   npm run banc:video -- --variantes K1,K2 --prompt prompt-d-un-plan.txt     (comparer deux formulations d'un même prompt)
 *
 * Le plan (prompt, personnages, décor, voix) est celui du fichier de workflow (par défaut workflows/video-generation/VID_REF2VA.json) : ses images et son audio doivent
 * exister dans le dossier d'entrée de ComfyUI. Le worker de Cadence n'a pas besoin de tourner. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VARIANTES_BANC, VARIANTES_PAR_DEFAUT, codesAveugles, preparerGrapheBanc, type Graphe, type VarianteBanc } from "../worker/comfyui/banc-variantes";
import { NODE_IDS } from "../worker/comfyui/mapping";

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const drapeau = (nom: string) => process.argv.includes(`--${nom}`);

const GO = 1024 ** 3;
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stats = { system?: { comfyui_version?: string; pytorch_version?: string }; devices?: { name: string; vram_total: number; vram_free: number }[] };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok && r.status !== 400) throw new Error(`${url} : HTTP ${r.status}`);
  return (await r.json()) as T;
}

type Resultat = { id: string; libelle: string; code?: string; secondes: number | null; picMemoireGo: number | null; memoireAvantGo: number | null; fichier?: string; erreur?: string };

async function executer(
  base: string,
  graphe: Graphe,
  delaiMs: number,
): Promise<{ secondes: number | null; picGo: number; avantGo: number; sortie?: { filename: string; subfolder: string; type: string }; erreur?: string }> {
  const lireMemoire = async () => {
    const s = await json<Stats>(`${base}/system_stats`);
    const d = s.devices?.[0];
    return d ? (d.vram_total - d.vram_free) / GO : 0;
  };
  const avantGo = await lireMemoire().catch(() => 0);
  const debut = Date.now();
  const r = await json<{ prompt_id?: string; error?: unknown; node_errors?: Record<string, unknown> }>(`${base}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: graphe, client_id: randomUUID() }),
  });
  if (!r.prompt_id || (r.node_errors && Object.keys(r.node_errors).length > 0)) {
    return { secondes: null, picGo: 0, avantGo, erreur: `refusé par ComfyUI : ${JSON.stringify(r.error ?? r.node_errors).slice(0, 600)}` };
  }
  let picGo = avantGo;
  const sonde = setInterval(() => {
    lireMemoire().then((g) => { picGo = Math.max(picGo, g); }, () => undefined);
  }, 500);
  try {
    while (Date.now() - debut < delaiMs) {
      await attendre(1000);
      const h = await json<Record<string, { outputs?: Record<string, { gifs?: { filename: string; subfolder: string; type: string }[] }>; status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] } }>>(`${base}/history/${r.prompt_id}`);
      const e = h[r.prompt_id];
      if (!e?.status) continue;
      if (e.status.status_str === "error") {
        const m = e.status.messages?.find(([nom]) => nom === "execution_error")?.[1];
        return { secondes: null, picGo, avantGo, erreur: `échec dans ComfyUI : ${String(m?.exception_message ?? "voir son journal").slice(0, 600)}` };
      }
      if (e.status.completed) {
        const ts = (nom: string) => e.status!.messages?.find(([n]) => n === nom)?.[1]?.timestamp as number | undefined;
        const a = ts("execution_start"), b = ts("execution_success");
        const secondes = a != null && b != null ? (b - a) / 1000 : (Date.now() - debut) / 1000;
        const sortie = e.outputs?.[NODE_IDS.sortieFinale]?.gifs?.[0];
        return { secondes, picGo, avantGo, sortie, erreur: sortie ? undefined : "aucune vidéo en sortie du nœud final" };
      }
    }
    return { secondes: null, picGo, avantGo, erreur: `délai dépassé (${Math.round(delaiMs / 60000)} min)` };
  } finally {
    clearInterval(sonde);
  }
}

/** Les LoRA que ComfyUI voit dans `models/loras`, ou null s'il ne les liste pas (on ne bloque alors rien : l'échec, s'il y en a un, vient de ComfyUI). */
async function lorasInstallees(base: string): Promise<Set<string> | null> {
  try {
    const o = await json<{ LoraLoaderModelOnly?: { input?: { required?: { lora_name?: [string[]] } } } }>(`${base}/object_info/LoraLoaderModelOnly`);
    const liste = o.LoraLoaderModelOnly?.input?.required?.lora_name?.[0];
    return Array.isArray(liste) ? new Set(liste) : null;
  } catch {
    return null;
  }
}

async function telecharger(base: string, s: { filename: string; subfolder: string; type: string }, dest: string) {
  const q = new URLSearchParams({ filename: s.filename, subfolder: s.subfolder, type: s.type });
  const r = await fetch(`${base}/view?${q}`);
  if (!r.ok) throw new Error(`téléchargement : HTTP ${r.status}`);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

async function main() {
  if (drapeau("liste")) {
    console.log("Variantes disponibles (par défaut : " + VARIANTES_PAR_DEFAUT.join(", ") + ") :");
    for (const v of VARIANTES_BANC) console.log(`  ${v.id}  ${v.libelle}`);
    return;
  }
  const base = (argument("url") ?? process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
  const fichier = argument("workflow") ?? "workflows/video-generation/VID_REF2VA.json";
  const duree = Number(argument("duree") ?? 6);
  const seed = argument("seed") ?? "123456789";
  const delaiMs = Number(argument("delai") ?? 60) * 60_000;
  const ids = (argument("variantes") ?? VARIANTES_PAR_DEFAUT.join(",")).split(",").map((x) => x.trim()).filter(Boolean);
  const choisies: VarianteBanc[] = ids.map((id) => {
    const v = VARIANTES_BANC.find((x) => x.id === id);
    if (!v) throw new Error(`Variante inconnue : ${id} (voir --liste)`);
    return v;
  });
  if (!Number.isInteger(duree) || duree < 5 || duree > 10) throw new Error("--duree : un entier de 5 à 10 secondes.");
  const workflow = JSON.parse(await readFile(fichier, "utf-8")) as Graphe;
  // Un prompt à tester à la place de celui du fichier (copié depuis la page d'un plan de Cadence) : indispensable pour K1 et K2, qui comparent des formulations.
  const fichierPrompt = argument("prompt");
  const prompt = fichierPrompt ? (await readFile(fichierPrompt, "utf-8")).trim() : undefined;
  const texteDuPrompt = prompt ?? String(workflow[NODE_IDS.prompt]?.inputs.value ?? "");

  const stats = await json<Stats>(`${base}/system_stats`).catch(() => null);
  if (!stats) throw new Error(`ComfyUI ne répond pas sur ${base} (--url).`);
  const carte = stats.devices?.[0];
  console.log(`ComfyUI ${stats.system?.comfyui_version ?? "?"} · PyTorch ${stats.system?.pytorch_version ?? "?"} · ${carte?.name ?? "carte inconnue"} · ${carte ? (carte.vram_total / GO).toFixed(1) : "?"} Go`);
  console.log(`Plan : ${fichier} · ${duree} s · graine ${seed} · variantes : ${ids.join(", ")}`);

  const horodatage = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const dossier = argument("sortie") ?? join("data", "banc-video", horodatage);
  await mkdir(dossier, { recursive: true });
  const codes = codesAveugles(ids, Number(seed) || 1);

  if (!drapeau("sans-echauffement")) {
    console.log("Échauffement (charge les modèles, 5 s, résultat jeté)…");
    const chauffe = await executer(base, preparerGrapheBanc(workflow, VARIANTES_BANC.find((x) => x.id === "V2")!, { dureeSecondes: 5, seed }), delaiMs);
    if (chauffe.erreur) console.log("  échauffement : " + chauffe.erreur);
  }

  const installees = await lorasInstallees(base);
  const resultats: Resultat[] = [];
  for (const v of choisies) {
    process.stdout.write(`${v.id} · ${v.libelle} … `);
    const manque = v.lora && installees && !installees.has(v.lora) ? `LoRA absent de ComfyUI : ${v.lora} (à télécharger : ${v.loraSource ?? "voir la fiche du cahier"}, puis à mettre dans models/loras)` : null;
    const inutile = (v.remplacements ?? []).find((r) => !texteDuPrompt.includes(r.de));
    if (manque || inutile) {
      const erreur = manque ?? `le prompt ne contient pas « ${inutile!.de} » : cette variante serait identique à la base (donnez un prompt de Cadence avec --prompt fichier.txt)`;
      resultats.push({ id: v.id, libelle: v.libelle, code: codes[v.id], secondes: null, picMemoireGo: null, memoireAvantGo: null, erreur });
      console.log(`IGNORÉE (${erreur})`);
      continue;
    }
    const g = preparerGrapheBanc(workflow, v, { dureeSecondes: duree, seed, prompt });
    const x = await executer(base, g, delaiMs);
    const res: Resultat = { id: v.id, libelle: v.libelle, code: codes[v.id], secondes: x.secondes, picMemoireGo: Math.round(x.picGo * 10) / 10, memoireAvantGo: Math.round(x.avantGo * 10) / 10, erreur: x.erreur };
    if (x.sortie) {
      res.fichier = `clip-${codes[v.id]}.mp4`;
      await telecharger(base, x.sortie, join(dossier, res.fichier)).catch((e) => { res.erreur = String(e); });
    }
    resultats.push(res);
    console.log(res.erreur ? `ÉCHEC (${res.erreur})` : `${Math.round(x.secondes ?? 0)} s, pic ${res.picMemoireGo} Go`);
    await writeFile(join(dossier, "resultats.json"), JSON.stringify({ comfyui: stats.system, carte, plan: fichier, dureeSecondes: duree, seed, variantes: resultats }, null, 2));
    await writeFile(join(dossier, "cle.json"), JSON.stringify(Object.fromEntries(resultats.map((r) => [r.code, { variante: r.id, libelle: r.libelle }])), null, 2));
  }

  await writeFile(
    join(dossier, "LISEZ-MOI.txt"),
    [
      "Banc de mesure vidéo de Cadence.",
      "",
      "1. Regardez les clips clip-A.mp4, clip-B.mp4… sans ouvrir cle.json : les lettres ne disent pas de quelle variante vient chaque clip.",
      "2. Dans le cahier de tests, ligne « Clip A », « Clip B »… : notez l'identité des personnages, le geste, la voix, la douceur, et un rang.",
      "3. Dites à Claude « j'ai rempli E1 » : il ouvre cle.json et resultats.json (temps et mémoire mesurés ici) et fait le tableau.",
      "",
      "Mémoire : la mémoire GPU utilisée sur la carte au pic, tous programmes confondus (ce que ComfyUI renvoie sur /system_stats).",
    ].join("\n"),
  );
  console.log(`\nTerminé. Dossier : ${dossier}`);
  console.log("Regardez les clips à l'aveugle (clip-A.mp4…), puis ouvrez cle.json.");
  const echecs = resultats.filter((r) => r.erreur).length;
  if (echecs) console.log(`${echecs} variante(s) en échec : voir resultats.json.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
