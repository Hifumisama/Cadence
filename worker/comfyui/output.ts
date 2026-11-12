/** Lecture tolérante de la sortie d'un nœud dans /history. Chaque type de nœud de
 * sauvegarde range ses fichiers sous une clé qui lui est propre : `images`
 * (SaveImage), `audio` (SaveAudio*, à confirmer sur un vrai run), `gifs` /
 * `videos` (VHS_VideoCombine). Plutôt que de coder la clé en dur, on cherche la
 * première liste de fichiers (objets avec un `filename`), les clés connues
 * d'abord. */

export type FichierSortie = { filename: string; subfolder?: string; type?: string };

const CLES_CONNUES = ["images", "audio", "gifs", "videos"] as const;

function listeDeFichiers(v: unknown): FichierSortie[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const fichiers = v.filter(
    (x): x is FichierSortie => typeof x === "object" && x !== null && typeof (x as { filename?: unknown }).filename === "string",
  );
  return fichiers.length > 0 ? fichiers : null;
}

/** Le premier fichier de sortie d'un nœud (celui qui n'est pas un temporaire
 * s'il y a le choix), ou null s'il n'y en a pas encore. */
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

/** « sous-dossier/fichier.ext » : la forme que `fetchOutput` sait relire. */
export function cheminSortieDistant(f: FichierSortie): string {
  return `${f.subfolder ?? ""}/${f.filename}`.replace(/^\//, "");
}
