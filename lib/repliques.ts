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

// MPEG audio (MP3) : débits (kbit/s) par version et couche, fréquences d'échantillonnage par version. Index 0 = « libre », 15 = invalide.
const DEBITS_MPEG1: Record<number, number[]> = {
  1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
};
const DEBITS_MPEG2: Record<number, number[]> = {
  1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const FREQUENCES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Durée d'un MP3 en parcourant ses trames (en-têtes MPEG audio), après un éventuel bloc ID3v2. Exacte pour un MP3 bien formé, VBR
 * compris (le débit de chaque trame est lu). La trame d'information Xing/Info qui ouvre un MP3 VBR/LAME ne porte pas de son : elle
 * n'est pas comptée. Null si aucune trame valide n'est trouvée. */
function dureeMp3(o: Uint8Array): number | null {
  let i = 0;
  if (o.length >= 10 && o[0] === 0x49 && o[1] === 0x44 && o[2] === 0x33) {
    i = 10 + (((o[6]! & 0x7f) << 21) | ((o[7]! & 0x7f) << 14) | ((o[8]! & 0x7f) << 7) | (o[9]! & 0x7f));
  }
  let echantillons = 0;
  let frequenceTrames = 0;
  let trames = 0;
  while (i + 4 <= o.length) {
    // Synchronisation : 11 bits à 1.
    if (o[i] !== 0xff || (o[i + 1]! & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const versionBits = (o[i + 1]! >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5, 1 = réservé
    const couche = 4 - ((o[i + 1]! >> 1) & 3); // 1, 2, 3 ; 4 = réservé
    const debitIdx = (o[i + 2]! >> 4) & 15;
    const freqIdx = (o[i + 2]! >> 2) & 3;
    const bourrage = (o[i + 2]! >> 1) & 1;
    if (versionBits === 1 || couche === 4 || debitIdx === 0 || debitIdx === 15 || freqIdx === 3) {
      i++;
      continue;
    }
    const debit = (versionBits === 3 ? DEBITS_MPEG1 : DEBITS_MPEG2)[couche]![debitIdx]! * 1000;
    const frequence = FREQUENCES[versionBits]![freqIdx]!;
    const parTrame = couche === 1 ? 384 : couche === 3 && versionBits !== 3 ? 576 : 1152;
    const longueur = couche === 1 ? (Math.floor((12 * debit) / frequence) + bourrage) * 4 : Math.floor(((parTrame / 8) * debit) / frequence) + bourrage;
    if (longueur < 4) {
      i++;
      continue;
    }
    // Trame d'information (Xing/Info) : le premier élément d'un MP3 VBR, sans son.
    const canalMono = ((o[i + 3]! >> 6) & 3) === 3;
    const decalageTag = 4 + (versionBits === 3 ? (canalMono ? 17 : 32) : canalMono ? 9 : 17);
    const etiquette = i + decalageTag + 4 <= o.length ? texte4(o, i + decalageTag) : "";
    if (trames === 0 && (etiquette === "Xing" || etiquette === "Info")) {
      i += longueur;
      continue;
    }
    echantillons += parTrame;
    frequenceTrames = frequence;
    trames++;
    i += longueur;
  }
  return trames > 0 && frequenceTrames > 0 ? arrondi(echantillons / frequenceTrames) : null;
}

/** Durée en secondes lue dans l'en-tête d'un WAV ou d'un FLAC, ou dans les trames d'un MP3, ou null si le format n'est pas mesurable ici
 * (M4A, OGG…) — la durée se saisit alors à la main, jamais estimée. */
export function mesurerDureeAudio(octets: Uint8Array, nomFichier: string): number | null {
  const ext = nomFichier.slice(nomFichier.lastIndexOf(".")).toLowerCase();
  if (ext === ".wav") return dureeWav(octets);
  if (ext === ".flac") return dureeFlac(octets);
  if (ext === ".mp3") return dureeMp3(octets);
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
