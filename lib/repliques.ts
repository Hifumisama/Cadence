/** Répliques autonomes (docs/FRICTIONS.md F02, révision 2026-09-30) — constantes
 * métier et fonctions pures : sans accès disque ni base, importables côté client
 * comme côté serveur. Les requêtes vivent dans lib/queries-repliques.ts. */

import type { BaliseD } from "./plan-checks";

/** Vie d'une réplique : `a_produire` (texte écrit, pas de prise), `prise_posee`
 * (une prise audio existe, pas encore jugée bonne), `validee` (prise retenue,
 * durée mesurée). Varchar contrôlé ici, pas d'enum pg. */
export const STATUTS_REPLIQUE = ["a_produire", "prise_posee", "validee"] as const;
export type StatutReplique = (typeof STATUTS_REPLIQUE)[number];

export const LIBELLE_STATUT_REPLIQUE: Record<StatutReplique, string> = {
  a_produire: "À produire",
  prise_posee: "Prise posée",
  validee: "Validée",
};

export function estStatutReplique(v: string): v is StatutReplique {
  return (STATUTS_REPLIQUE as readonly string[]).includes(v);
}

/** La prise ne dit plus le texte courant : le texte a changé depuis qu'elle a
 * été posée. Sans prise, rien n'est obsolète. */
export function priseObsolete(r: { fichier: string | null; fichierTexte: string | null; texte: string }): boolean {
  return r.fichier != null && (r.fichierTexte ?? "").trim() !== r.texte.trim();
}

// ---------------------------------------------------------------------
// Locuteur — encodé dans un seul <select> : `p:<id>` un personnage, `v:<id>`
// une voix du catalogue sans personnage (voix off), `t:<texte>` un locuteur
// libre (foule, « inconnu »).
// ---------------------------------------------------------------------

export type LocuteurChoisi =
  | { kind: "personnage"; id: number }
  | { kind: "voix"; id: number }
  | { kind: "texte"; texte: string };

export function decoderLocuteur(valeur: string): LocuteurChoisi | null {
  const [tete, ...reste] = valeur.split(":");
  const corps = reste.join(":");
  if (tete === "p" || tete === "v") {
    const id = Number(corps);
    return Number.isInteger(id) && id > 0 ? { kind: tete === "p" ? "personnage" : "voix", id } : null;
  }
  if (tete === "t") {
    const texte = corps.trim();
    return texte ? { kind: "texte", texte } : null;
  }
  return null;
}

/** « CHAR_maya » -> « maya » : ce qu'on lit dans une liste de répliques. */
export function nomLocuteur(code: string): string {
  return code.replace(/^[A-Z]+_/, "");
}

// ---------------------------------------------------------------------
// Prompt H3 — insertion / correction d'une balise <d>
// ---------------------------------------------------------------------

const LANGUES_BALISE: Record<string, string> = {
  french: "Français",
  english: "English",
  spanish: "Español",
  german: "Deutsch",
  italian: "Italiano",
  portuguese: "Português",
};

/** Langue de la fiche voix (« French ») -> libellé de la balise (`[Français]`,
 * voir le skill fiche-de-plan). Une langue inconnue est reprise telle quelle. */
export function langueBalise(langue: string | null | undefined): string {
  const l = (langue ?? "").trim();
  return LANGUES_BALISE[l.toLowerCase()] ?? (l || "Français");
}

/** Remplace le texte d'une balise existante par la réplique exacte, sans
 * toucher au reste de la phrase. */
export function corrigerBalise(contenu: string, balise: Pick<BaliseD, "debut" | "fin">, texte: string): string {
  return contenu.slice(0, balise.debut) + texte.trim() + contenu.slice(balise.fin);
}

/** Ajoute une balise `<d>` en fin de section. L'emplacement exact dans la
 * phrase reste au choix de l'auteur : c'est une amorce, pas une mise en scène. */
export function ajouterBalise(contenu: string, qui: string, langue: string, texte: string): string {
  const base = contenu.trimEnd();
  const ligne = `${qui} says, <d>[${langue}] ${texte.trim()}</d>`;
  return base ? `${base}\n${ligne}` : ligne;
}

// ---------------------------------------------------------------------
// Durée mesurée sur la prise (F03 : « ça se mesure, ça ne s'estime pas »)
// ---------------------------------------------------------------------

function u32le(o: Uint8Array, i: number): number {
  return (o[i]! | (o[i + 1]! << 8) | (o[i + 2]! << 16) | (o[i + 3]! << 24)) >>> 0;
}

function texte4(o: Uint8Array, i: number): string {
  return String.fromCharCode(o[i]!, o[i + 1]!, o[i + 2]!, o[i + 3]!);
}

function arrondi(s: number): number {
  return Math.round(s * 100) / 100;
}

function dureeWav(o: Uint8Array): number | null {
  if (o.length < 12 || texte4(o, 0) !== "RIFF" || texte4(o, 8) !== "WAVE") return null;
  let octetsParSeconde = 0;
  let i = 12;
  while (i + 8 <= o.length) {
    const id = texte4(o, i);
    const taille = u32le(o, i + 4);
    if (id === "fmt " && i + 20 <= o.length) {
      octetsParSeconde = u32le(o, i + 16);
    } else if (id === "data") {
      // Taille 0 ou 0xFFFFFFFF : fichier écrit en flux, on prend ce qui reste.
      const dispo = o.length - (i + 8);
      const octets = taille === 0 || taille === 0xffffffff || taille > dispo ? dispo : taille;
      return octetsParSeconde > 0 ? arrondi(octets / octetsParSeconde) : null;
    }
    i += 8 + taille + (taille % 2);
  }
  return null;
}

function dureeFlac(o: Uint8Array): number | null {
  if (o.length < 42 || texte4(o, 0) !== "fLaC") return null;
  // Premier bloc de métadonnées = STREAMINFO (type 0), 34 octets.
  if ((o[4]! & 0x7f) !== 0) return null;
  const d = 8;
  const frequence = (o[d + 10]! << 12) | (o[d + 11]! << 4) | (o[d + 12]! >> 4);
  const total = (o[d + 13]! & 0x0f) * 2 ** 32 + ((o[d + 14]! << 24) >>> 0) + (o[d + 15]! << 16) + (o[d + 16]! << 8) + o[d + 17]!;
  return frequence > 0 && total > 0 ? arrondi(total / frequence) : null;
}

/** Durée en secondes lue dans l'en-tête d'un WAV ou d'un FLAC, ou null si le
 * format n'est pas mesurable ici (MP3, M4A…) — la durée se saisit alors à la
 * main, jamais estimée. */
export function mesurerDureeAudio(octets: Uint8Array, nomFichier: string): number | null {
  const ext = nomFichier.slice(nomFichier.lastIndexOf(".")).toLowerCase();
  if (ext === ".wav") return dureeWav(octets);
  if (ext === ".flac") return dureeFlac(octets);
  return null;
}

// ---------------------------------------------------------------------
// Export des audios seuls (montage : DaVinci Resolve ; OTIO plus tard)
// ---------------------------------------------------------------------

export type LigneExportReplique = {
  uuid: string;
  /** Rang de la réplique dans le montage : plan d'apparition (position dans
   * l'épisode, selon `ordre`), puis son emplacement audio dans ce plan. */
  rang: number;
  episodeNumero: number;
  locuteur: string;
  voix: string | null;
  texte: string;
  dureeSecondes: number | null;
  statut: string;
  /** Chemin relatif au stockage média (MEDIA_ROOT), ou null sans prise. */
  fichier: string | null;
  /** Plans où elle est utilisée — position dans l'épisode + slot <Audio N>. */
  plans: { planUuid: string; position: number; slot: number }[];
};

function celluleCsv(v: string | number | null): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportRepliquesCsv(lignes: LigneExportReplique[]): string {
  const entete = ["rang", "uuid", "episode", "locuteur", "voix", "texte", "duree_secondes", "statut", "fichier", "plans"];
  const corps = lignes.map((l) =>
    [
      l.rang,
      l.uuid,
      l.episodeNumero,
      l.locuteur,
      l.voix,
      l.texte,
      l.dureeSecondes,
      l.statut,
      l.fichier,
      l.plans.map((p) => `${String(p.position).padStart(2, "0")}:${p.slot}`).join(" "),
    ]
      .map(celluleCsv)
      .join(","),
  );
  return [entete.join(","), ...corps].join("\n") + "\n";
}
