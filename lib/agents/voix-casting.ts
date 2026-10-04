import { construireCode, slugifyCode } from "../assetCode";
import { normaliser, rapprocherLocuteur } from "./locuteurs";

/** Étape « casting des voix » : une VOIX pour chaque personnage qui parle et qui n'en a pas, plus la voix
 * off quand des répliques en réclament une. Pur (aucune lecture) : des personnages, des fiches de voix
 * et des répliques aux « candidats » à créer, un par voix. Sans cette étape, les répliques écrites par
 * les scénarios restent orphelines : personne ne les dit. La voix se CRÉE ici ; elle s'édite toujours
 * au casting vocal, et le son se génère à part (ComfyUI). */

export const PREFIXE_CLE_VOIX = "voix:";
export const cleSousTacheVoix = (code: string): string => `${PREFIXE_CLE_VOIX}${code}`;
export function codeDeCleVoix(cle: string | null | undefined): string | null {
  return cle && cle.startsWith(PREFIXE_CLE_VOIX) && cle.length > PREFIXE_CLE_VOIX.length ? cle.slice(PREFIXE_CLE_VOIX.length) : null;
}
/** Groupe de revue : toutes les voix à créer, une ligne cochable chacune. */
export const GROUPE_VOIX = "voix";

/** Code de la voix off quand aucun personnage ne la porte. */
export const CODE_VOIX_OFF = "VOICE_off";
const NB_REPLIQUES_EXEMPLES = 6;

export type PersonnageParlant = { id: number; code: string; description: string };
export type FicheVoixExistante = { assetCode: string; personnageId: number | null };
export type RepliqueLue = { locuteurId: number | null; voixId: number | null; locuteurTexte: string; texte: string };

export type CandidatVoix = {
  /** Clé de la sous-tâche du lot : « voix:CHAR_maya » (ou « voix:off »). */
  cle: string;
  /** Code du personnage, null pour la voix off. */
  personnageCode: string | null;
  personnageId: number | null;
  /** Code de la voix à créer : VOICE_maya, VOICE_off. */
  codeVoix: string;
  suffixe: string;
  nom: string;
  /** Description canonique du personnage (français), vide pour la voix off. */
  description: string;
  nbRepliques: number;
  exemples: string[];
  libelle: string;
  /** Raison pour laquelle la voix ne peut pas être créée ici (le code est déjà pris), sinon null. */
  bloque: string | null;
  /** Coché d'office : tout candidat non bloqué. */
  aTraiter: boolean;
};

const VOIX_OFF = /^(voix off|voix hors champ|narrateur|narratrice|narration|off|voice over|voiceover)$/;

/** Les voix à créer, dans l'ordre : personnages (ordre du registre) qui ont au moins une réplique et pas de
 * voix, puis la voix off si des répliques la réclament et qu'aucune voix « off » n'existe. */
export function candidatsVoix(personnages: PersonnageParlant[], fiches: FicheVoixExistante[], voixExistantes: { id: number; code: string }[], repliques: RepliqueLue[]): CandidatVoix[] {
  const codesPris = new Set(voixExistantes.map((v) => v.code));
  // Une réplique écrite avant son personnage garde un locuteur en simple texte : on la rapproche du registre,
  // comme à la création d'une réplique, pour savoir à qui elle appartient.
  const registre = [
    ...personnages.map((p) => ({ id: p.id, code: p.code, type: "personnage" as const })),
    ...voixExistantes.map((v) => ({ id: v.id, code: v.code, type: "voix" as const })),
  ];
  const duPersonnage = (r: RepliqueLue): number | null => {
    if (r.locuteurId != null) return r.locuteurId;
    if (r.voixId != null || !r.locuteurTexte.trim()) return null;
    return rapprocherLocuteur(r.locuteurTexte, registre).locuteurId;
  };
  const aDejaUneVoix = new Set(fiches.map((f) => f.personnageId).filter((x): x is number => x != null));
  const sortie: CandidatVoix[] = [];

  const candidat = (p: { personnageId: number | null; personnageCode: string | null; suffixe: string; nom: string; description: string; textes: string[] }): CandidatVoix => {
    const codeVoix = construireCode("voix", p.suffixe);
    // Deux personnages dont le nom se réduit au même suffixe (CHAR_maya, PROP_maya) viseraient le même code :
    // le premier passe, le suivant est bloqué (sinon l'application échouerait en cours de route).
    const dejaVise = sortie.some((x) => x.codeVoix === codeVoix);
    const bloque = codesPris.has(codeVoix)
      ? `${codeVoix} existe déjà sans être rattachée à ${p.personnageCode ?? "la voix off"} : rattache-la au casting vocal.`
      : dejaVise
        ? `${codeVoix} est déjà visé par une autre voix de cette liste : crée-la au casting vocal sous un autre nom.`
        : null;
    return {
      cle: cleSousTacheVoix(p.personnageCode ?? "off"),
      personnageCode: p.personnageCode,
      personnageId: p.personnageId,
      codeVoix,
      suffixe: p.suffixe,
      nom: p.nom,
      description: p.description,
      nbRepliques: p.textes.length,
      exemples: p.textes.slice(0, NB_REPLIQUES_EXEMPLES),
      libelle: p.personnageCode ? `Voix · ${p.nom}` : "Voix · voix off",
      bloque,
      aTraiter: bloque == null,
    };
  };

  for (const perso of personnages) {
    if (aDejaUneVoix.has(perso.id)) continue;
    const textes = repliques.filter((r) => duPersonnage(r) === perso.id).map((r) => r.texte.trim()).filter(Boolean);
    if (textes.length === 0) continue;
    const suffixe = slugifyCode(perso.code.replace(/^[A-Z]+_/, ""));
    if (!suffixe) continue;
    sortie.push(candidat({ personnageId: perso.id, personnageCode: perso.code, suffixe, nom: perso.code.replace(/^[A-Z]+_/, "").replace(/_/g, " "), description: perso.description, textes }));
  }

  // Voix off : des répliques dites « voix off » sans voix du registre pour elles.
  const sansVoix = repliques.filter((r) => r.locuteurId == null && r.voixId == null && VOIX_OFF.test(normaliser(r.locuteurTexte)));
  const uneVoixOffExiste = voixExistantes.some((v) => normaliser(v.code).split(" ").includes("off"));
  if (sansVoix.length > 0 && !uneVoixOffExiste) {
    sortie.push(candidat({ personnageId: null, personnageCode: null, suffixe: "off", nom: "Voix off", description: "", textes: sansVoix.map((r) => r.texte.trim()).filter(Boolean) }));
  }
  return sortie;
}

export function resumeCandidatsVoix(candidats: CandidatVoix[], choisis: Set<string>): { total: number; choisis: number; repliques: number } {
  const c = candidats.filter((x) => choisis.has(x.cle));
  return { total: candidats.length, choisis: c.length, repliques: c.reduce((n, x) => n + x.nbRepliques, 0) };
}
