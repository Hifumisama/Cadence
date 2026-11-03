/** Contrôle d'une machine GPU (ComfyUI) contre les workflows de `workflows/` : règles pures, sans réseau
 * (le script `scripts/gpu-verifier.ts` fait les appels). Sert à valider un PC distant ou un Pod avant une
 * séance : quels nodes manquent, quels fichiers de modèles manquent. */

export type Graphe = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

/** Forme de `GET /object_info` réduite à ce que le contrôle lit. Une entrée de node décrit chaque champ par
 * `[type, options]` ; un champ à choix est soit `[["a.safetensors", …]]` (ancien format), soit
 * `["COMBO", { options: […] }]` (nodes récents). */
export type ObjectInfo = Record<
  string,
  { input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> } }
>;

export type FichierAbsent = { classe: string; champ: string; valeur: string };
export type RapportWorkflow = { nom: string; noeudsAbsents: string[]; fichiersAbsents: FichierAbsent[]; ok: boolean };

/** Une valeur qui désigne un fichier de modèle. Le reste (prompts, noms d'images d'entrée, sélecteurs) change à chaque soumission. */
const FICHIER_MODELE = /\.(safetensors|gguf|pt|pth|ckpt|bin|sft|onnx)$/i;

/** Les choix qu'un champ propose, ou null si ce n'est pas un champ à choix. */
export function optionsDuChamp(definition: unknown): string[] | null {
  if (!Array.isArray(definition) || definition.length === 0) return null;
  const [premier, details] = definition;
  if (Array.isArray(premier)) return premier.filter((x): x is string => typeof x === "string");
  if (premier === "COMBO" && details && typeof details === "object") {
    const options = (details as { options?: unknown }).options;
    if (Array.isArray(options)) return options.filter((x): x is string => typeof x === "string");
  }
  return null;
}

export function analyserWorkflow(nom: string, graphe: Graphe, info: ObjectInfo): RapportWorkflow {
  const noeudsAbsents = new Set<string>();
  const fichiersAbsents: FichierAbsent[] = [];
  for (const noeud of Object.values(graphe)) {
    const classe = noeud?.class_type;
    if (!classe) continue;
    const def = info[classe];
    if (!def) {
      noeudsAbsents.add(classe);
      continue;
    }
    for (const [champ, valeur] of Object.entries(noeud.inputs ?? {})) {
      if (typeof valeur !== "string" || !FICHIER_MODELE.test(valeur)) continue;
      const options = optionsDuChamp(def.input?.required?.[champ] ?? def.input?.optional?.[champ]);
      if (options && !options.includes(valeur)) fichiersAbsents.push({ classe, champ, valeur });
    }
  }
  return {
    nom,
    noeudsAbsents: [...noeudsAbsents].sort(),
    fichiersAbsents,
    ok: noeudsAbsents.size === 0 && fichiersAbsents.length === 0,
  };
}
