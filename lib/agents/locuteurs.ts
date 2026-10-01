/** Qui dit une réplique : rapprocher le locuteur écrit par l'agent (« Maya », « CHAR_maya »,
 * « voix off ») du registre du projet. Pur, testé. JAMAIS d'asset créé par ce chemin (« l'histoire
 * d'abord ») : un locuteur inconnu devient un locuteur LIBRE, signalé comme invention dans la
 * revue (modèle de `repliques` : locuteurId | voixId | locuteurTexte, F02). */

export type AssetLocuteur = { id: number; code: string; type: "personnage" | "voix" };

export type LocuteurResolu = {
  locuteurId: number | null;
  voixId: number | null;
  locuteurTexte: string;
  /** Trouvé dans le registre (ou « voix off » légitime) ; sinon c'est une invention à valider. */
  connu: boolean;
};

const MAX_LOCUTEUR = 100;

/** Minuscules, sans accents ni ponctuation, espaces réduits. */
export function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** « CHAR_maya » → « maya » (même règle que lib/repliques.ts, sans le dépendre). */
const nomDeCode = (code: string): string => normaliser(code.replace(/^[A-Z]+_/, ""));

const VOIX_OFF = /^(voix off|voix hors champ|narrateur|narratrice|narration|off|voice over|voiceover)$/;

/** Le locuteur d'une réplique d'après son libellé. L'ordre : voix off → personnage par code ou par
 * nom exact → personnage dont le nom est le premier mot → locuteur libre. */
export function rapprocherLocuteur(nom: string, registre: AssetLocuteur[]): LocuteurResolu {
  const brut = nom.trim();
  const n = normaliser(brut);
  if (!n) return { locuteurId: null, voixId: null, locuteurTexte: "Inconnu", connu: false };

  if (VOIX_OFF.test(n)) {
    const voix = registre.find((a) => a.type === "voix" && normaliser(a.code).split(" ").includes("off"));
    if (voix) return { locuteurId: null, voixId: voix.id, locuteurTexte: "", connu: true };
    return { locuteurId: null, voixId: null, locuteurTexte: "Voix off", connu: true };
  }

  const personnages = registre.filter((a) => a.type === "personnage");
  const exact = personnages.find((a) => normaliser(a.code) === n || nomDeCode(a.code) === n);
  if (exact) return { locuteurId: exact.id, voixId: null, locuteurTexte: "", connu: true };

  // Une voix du registre citée par son code (« VOICE_off ») : c'est ce que le modèle écrit quand le
  // registre lui donne les codes.
  const voix = registre.find((a) => a.type === "voix" && (normaliser(a.code) === n || nomDeCode(a.code) === n));
  if (voix) return { locuteurId: null, voixId: voix.id, locuteurTexte: "", connu: true };

  // « Maya (au téléphone) », « Maya, à voix basse » : le premier mot suffit s'il est sans ambiguïté.
  const premier = n.split(" ")[0]!;
  const candidats = personnages.filter((a) => nomDeCode(a.code) === premier || normaliser(a.code) === premier);
  if (candidats.length === 1) return { locuteurId: candidats[0]!.id, voixId: null, locuteurTexte: "", connu: true };

  return { locuteurId: null, voixId: null, locuteurTexte: brut.slice(0, MAX_LOCUTEUR), connu: false };
}

/** Texte comparable d'une réplique (pour ne pas créer deux fois la même dans un épisode). */
export const texteComparable = (t: string): string => normaliser(t);
