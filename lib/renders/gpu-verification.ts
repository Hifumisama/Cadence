/** Control of a GPU machine (ComfyUI) against the workflows of `workflows/`: pure rules, no network
 * (the script `scripts/gpu-verifier.ts` makes the calls). Used to validate a remote PC or a Pod before a
 * session: which nodes are missing, which model files are missing. */

export type Graphe = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

/** `GET /object_info` form reduced to what the control reads. A node entry describes each field by
 * `[type, options]`; a choice field is either `[["a.safetensors", …]]` (old format), or
 * `["COMBO", { options: […] }]` (recent nodes). */
export type ObjectInfo = Record<
  string,
  { input?: { required?: Record<string, unknown>; optional?: Record<string, unknown> } }
>;

type FichierAbsent = { classe: string; champ: string; valeur: string };
export type RapportWorkflow = { nom: string; noeudsAbsents: string[]; fichiersAbsents: FichierAbsent[]; ok: boolean };

/** A value that designates a model file. The rest (prompts, input image names, selectors) changes at each submission. */
const FICHIER_MODELE = /\.(safetensors|gguf|pt|pth|ckpt|bin|sft|onnx)$/i;

/** The choices a field offers, or null if it is not a choice field. */
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
