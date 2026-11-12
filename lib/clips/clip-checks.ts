// Contrôles mécaniques de la Fiche de plan — voir docs/FRICTIONS.md F02/F03
// et la compilation Open H3 IR. Aucun n'a besoin d'IA : c'est la
// vérification qui remplace la relecture manuelle avant validation.

import { dureeEffectiveSecondes } from "../renders/image-grid";

export type PromptSection = {
  section: string;
  contenu: string;
};

/** Marqueur de traçabilité dans jobs.workflowFichier (texte libre, pas
 * d'enum) : distingue un plan déjà tourné/importé d'un plan généré par
 * ComfyUI (qui porte le chemin réel du workflow, ex.
 * "video-generation/VID_REF2VA.json"). Voir app/plans/actions.ts,
 * importerVideoExistante. Vit ici plutôt que dans actions.ts, qui est un
 * fichier "use server" — il ne peut exporter que des fonctions async. */
export const WORKFLOW_IMPORT_MANUEL = "import-manuel";

export type RefLabel = {
  type: "picture" | "video" | "audio";
  slot: number;
};

/** Limites MiniMax H3 (voir docs/REGISTRE_ASSETS.md et l'inspection du
 * graphe ComfyUI) : 6 refs image, 2 refs vidéo, 3 refs audio par plan. */
export const MAX_REFS: Record<RefLabel["type"], number> = {
  picture: 6,
  video: 2,
  audio: 3,
};

/** Cohérence des refs : chaque label <Picture N>/<Audio N>/<Video N> cité
 * dans le prompt doit exister dans la table de refs du plan, et
 * inversement.
 *
 * `derivees` : les refs audio qui sont la VOIX d'un personnage (son master,
 * `lib/voice/queries-voice-clip.ts`). Elles comptent comme
 * déclarées (un prompt qui les cite n'a pas de label orphelin) mais ne sont
 * jamais « non citées » : les fiches compilées et les fiches validées de
 * l'épisode 1 ne citent pas les voix (docs/FRICTIONS.md, « iteration-plan
 * branché », 2026-10-02). Une ref de plan_refs (image) non citée
 * reste signalée. */
export function verifierCoherenceRefs(
  sections: PromptSection[],
  refs: RefLabel[],
  derivees: RefLabel[] = [],
): { labelsOrphelins: string[]; refsNonCitees: string[] } {
  const texte = sections.map((s) => s.contenu).join("\n");
  const labelParType: Record<RefLabel["type"], string> = {
    picture: "Picture",
    video: "Video",
    audio: "Audio",
  };

  const labelsCites = new Set(
    [...texte.matchAll(/<(Picture|Video|Audio)\s+(\d+)>/g)].map(
      (m) => `${m[1]}:${m[2]}`,
    ),
  );
  const labelsDeclares = new Set(
    refs.map((r) => `${labelParType[r.type]}:${r.slot}`),
  );
  const labelsDerives = new Set(
    derivees.map((r) => `${labelParType[r.type]}:${r.slot}`),
  );

  const labelsOrphelins = [...labelsCites].filter((l) => !labelsDeclares.has(l) && !labelsDerives.has(l));
  const refsNonCitees = [...labelsDeclares].filter((l) => !labelsCites.has(l));

  return { labelsOrphelins, refsNonCitees };
}
/** Plancher par shot des CONTRÔLES DE LA FICHE (`controlerStructure`, en-tête de la page du plan), pour toutes les fiches : celui du modèle et d'Open H3 IR
 * (`MIN_SHOT_MS` = 1200, h3ir/shots.py:42). Une fiche d'Open H3 IR peut avoir un shot de 1,2 à 1,5 s sans que ce soit une faute (décision du 2026-11-02). */
export const SHOT_MIN_FICHE_SECONDES = 1.2;
/** Plancher d'un plan : 4 s (décision de l'utilisateur, 2026-11-08 ; c'était 5). Les schémas des skills le disent en toutes lettres (« minimum » : à garder alignés). */
export const DUREE_GENERATION_MIN = 4;
/** Plafond dur d'un plan (décision du 2026-10-27) : un plan de 10 s à 0,4 MP tient sur la carte et donne des gestes plus précis qu'un plan de 15 s
 * à 0,2 MP ; au-delà, l'action se coupe. Source unique : les skills et leurs schémas disent « 10 » en toutes lettres (texte statique, à garder alignés). */
export const DUREE_GENERATION_MAX = 10;

export type ProblemeStructure = {
  type:
    | "duree_invalide"
    | "aucun_shot"
    | "shot1_timecode"
    | "shot_timecode_manquant"
    | "shot_hors_ordre"
    | "shot_numerotation"
    | "shot_trop_court"
    | "shot_hors_duree";
  message: string;
};

type ShotTrouve = { numero: number; timecode: number | null };

function enSecondes(min: string, sec: string, ms: string | undefined): number {
  return Number(min) * 60 + Number(sec) + (ms ? Number(ms.padEnd(3, "0")) / 1000 : 0);
}

/** Extrait les `[Shot N]` de la description détaillée avec leur début. Deux
 * écritures existent dans les plans validés en production : « [Shot 2] At
 * 00:03.500, … » (guide officiel) et « [Shot 2, 00:03.500–00:06.000] … »
 * (forme à intervalle). Les deux sont acceptées. */
function extraireShots(contenu: string): ShotTrouve[] {
  const re = /\[Shot\s+(\d+)(?:\s*,\s*(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\s*[–-]\s*\d{1,2}:\d{2}(?:\.\d{1,3})?[^\]]*)?\]/g;
  // Une mention « [Shot 2] » dans la phrase de style, avant [Shot 1], n'en est pas un.
  const tous = [...contenu.matchAll(re)];
  const premier = tous.findIndex((m) => Number(m[1]) === 1);
  const reperes = premier === -1 ? tous : tous.slice(premier);
  return reperes.map((m) => {
    if (m[2] != null) return { numero: Number(m[1]), timecode: enSecondes(m[2], m[3]!, m[4]) };
    const debut = (m.index ?? 0) + m[0].length;
    const tc = contenu.slice(debut, debut + 30).match(/^\s*At\s+(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?/i);
    return { numero: Number(m[1]), timecode: tc ? enSecondes(tc[1]!, tc[2]!, tc[3]) : null };
  });
}

function formaterTimecode(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
}

/** Contrôles de structure de la fiche. `dureeGenerationSecondes` est la durée NOMINALE du plan (entier de 4 à 10) ; les shots se jugent contre la durée EFFECTIVE du rendu,
 * celle de la grille d'images (lib/renders/image-grid.ts : 6 s → 6,583 s, 8 s → 8,000 s), que le rendu produit et qu'Open H3 IR utilise pour placer ses coupes. */
export function controlerStructure(
  sections: PromptSection[],
  dureeGenerationSecondes: number,
): ProblemeStructure[] {
  const problemes: ProblemeStructure[] = [];

  const dureeValide =
    Number.isInteger(dureeGenerationSecondes) && dureeGenerationSecondes >= DUREE_GENERATION_MIN && dureeGenerationSecondes <= DUREE_GENERATION_MAX;
  if (!dureeValide) {
    problemes.push({
      type: "duree_invalide",
      message: `La durée de génération doit être un entier de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s (actuellement ${dureeGenerationSecondes}).`,
    });
  }
  // Une durée invalide n'a pas de grille : on juge alors contre la valeur donnée.
  const fin = dureeValide ? dureeEffectiveSecondes(dureeGenerationSecondes) : dureeGenerationSecondes;
  const plancher = SHOT_MIN_FICHE_SECONDES - 1e-9;

  const contenu = sections.find((s) => s.section === "detailed_description")?.contenu ?? "";
  if (!contenu.trim()) return problemes;

  const shots = extraireShots(contenu);
  if (shots.length === 0) {
    problemes.push({ type: "aucun_shot", message: "La description ne contient aucun [Shot 1]." });
    return problemes;
  }

  shots.forEach((s, i) => {
    if (s.numero !== i + 1) {
      problemes.push({ type: "shot_numerotation", message: `[Shot ${s.numero}] apparaît en position ${i + 1} : les shots se suivent de 1 à N.` });
    }
  });

  if (shots[0]!.timecode != null && shots[0]!.timecode > 0) {
    problemes.push({ type: "shot1_timecode", message: "[Shot 1] démarre à 00:00.000 : il ne porte pas d'autre timecode." });
  }

  const debuts: number[] = [0];
  for (let i = 1; i < shots.length; i++) {
    const s = shots[i]!;
    if (s.timecode == null) {
      problemes.push({ type: "shot_timecode_manquant", message: `[Shot ${s.numero}] n'a pas de timecode « At MM:SS.mmm ».` });
      continue;
    }
    const precedent = debuts[debuts.length - 1]!;
    if (s.timecode <= precedent) {
      problemes.push({ type: "shot_hors_ordre", message: `[Shot ${s.numero}] démarre à ${formaterTimecode(s.timecode)}, pas après le shot précédent.` });
      continue;
    }
    if (s.timecode >= fin) {
      problemes.push({ type: "shot_hors_duree", message: `[Shot ${s.numero}] démarre à ${formaterTimecode(s.timecode)}, au-delà des ${fin.toFixed(3)} s du plan.` });
      continue;
    }
    if (s.timecode - precedent < plancher) {
      problemes.push({
        type: "shot_trop_court",
        message: `Le shot précédent [Shot ${s.numero - 1}] ne dure que ${(s.timecode - precedent).toFixed(2)} s : sous ${SHOT_MIN_FICHE_SECONDES} s, H3 rallonge ou lisse le plan.`,
      });
    }
    debuts.push(s.timecode);
  }

  const dernier = debuts[debuts.length - 1]!;
  if (debuts.length > 1 && fin - dernier < plancher && dernier < fin) {
    problemes.push({
      type: "shot_trop_court",
      message: `Le dernier shot ne dure que ${(fin - dernier).toFixed(2)} s : sous ${SHOT_MIN_FICHE_SECONDES} s, H3 rallonge ou lisse le plan.`,
    });
  }

  return problemes;
}
