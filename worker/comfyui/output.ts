/** Tolerant reading of a node's output in /history. Each type of save node stores its files under a key of its own: `images`
 * (SaveImage), `audio` (SaveAudio*, to be confirmed on a real run), `gifs` /
 * `videos` (VHS_VideoCombine). Rather than hard-coding the key, we look for the
 * first list of files (objects with a `filename`), known keys
 * first. */

export type FichierSortie = { filename: string; subfolder?: string; type?: string };

const CLES_CONNUES = ["images", "audio", "gifs", "videos"] as const;

function listeDeFichiers(v: unknown): FichierSortie[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const fichiers = v.filter(
    (x): x is FichierSortie => typeof x === "object" && x !== null && typeof (x as { filename?: unknown }).filename === "string",
  );
  return fichiers.length > 0 ? fichiers : null;
}

/** The first output file of a node (the one that is not a temporary one
 * if there is a choice), or null if there is none yet. */
export function premierFichierSortie(sortie: unknown): FichierSortie | null {
  if (typeof sortie !== "object" || sortie === null) return null;
  const o = sortie as Record<string, unknown>;
  const cles = [...CLES_CONNUES, ...Object.keys(o).filter((k) => !(CLES_CONNUES as readonly string[]).includes(k))];
  for (const cle of cles) {
    const liste = listeDeFichiers(o[cle]);
    if (liste) return liste.find((f) => f.type !== "temp") ?? liste[0]!;
  }
  return null;
}

/** « sous-dossier/fichier.ext » (subfolder/file.ext): the form that `fetchOutput` can read back. */
export function cheminSortieDistant(f: FichierSortie): string {
  return `${f.subfolder ?? ""}/${f.filename}`.replace(/^\//, "");
}
