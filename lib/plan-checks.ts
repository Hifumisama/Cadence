// Contrôles mécaniques de la Fiche de plan — voir docs/FRICTIONS.md F02/F03
// et .claude/skills/fiche-de-plan/SKILL.md. Aucun n'a besoin d'IA : c'est la
// vérification qui remplace la relecture manuelle avant validation.

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

export type Dialogue = {
  dureeSecondes: number | null;
};

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

/** Une balise `<d>[Langue] …</d>` du prompt, avec l'emplacement exact de son
 * texte (`debut`/`fin` dans le contenu de sa section) — c'est ce qui permet de
 * la corriger sans toucher au reste de la phrase. */
export type BaliseD = {
  section: string;
  debut: number;
  fin: number;
  langue: string | null;
  texte: string;
};

export function extraireBalisesD(sections: PromptSection[]): BaliseD[] {
  const balises: BaliseD[] = [];
  for (const { section, contenu } of sections) {
    for (const m of contenu.matchAll(/<d>(\s*\[([^\]]*)\])?(\s*)([\s\S]*?)(\s*)<\/d>/g)) {
      const decalage = 3 + (m[1]?.length ?? 0) + (m[3]?.length ?? 0);
      const debut = (m.index ?? 0) + decalage;
      const texte = m[4] ?? "";
      balises.push({ section, debut, fin: debut + texte.length, langue: m[2] ?? null, texte });
    }
  }
  return balises;
}

export type SegmentEcart = {
  /** "=" commun aux deux · "-" attendu (dans la réplique) mais absent du
   * prompt · "+" présent dans le prompt mais pas dans la réplique. */
  type: "=" | "-" | "+";
  texte: string;
};

// Mots, blancs et signes de ponctuation séparés : une virgule manquante
// ressort comme une virgule, pas comme un mot entier différent.
const RE_JETONS = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

function jetons(texte: string): string[] {
  return texte.match(RE_JETONS) ?? [];
}

function tableLcs(a: string[], b: string[]): number[][] {
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
    }
  }
  return t;
}

/** Écart mot à mot entre la réplique attendue et ce que le prompt dit. */
export function ecartVerbatim(attendu: string, trouve: string): SegmentEcart[] {
  const a = jetons(attendu);
  const b = jetons(trouve);
  const t = tableLcs(a, b);
  const segments: SegmentEcart[] = [];
  const pousser = (type: SegmentEcart["type"], texte: string) => {
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.type === type) dernier.texte += texte;
    else segments.push({ type, texte });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pousser("=", a[i]!);
      i++;
      j++;
    } else if (t[i + 1]![j]! >= t[i]![j + 1]!) {
      pousser("-", a[i]!);
      i++;
    } else {
      pousser("+", b[j]!);
      j++;
    }
  }
  while (i < a.length) pousser("-", a[i++]!);
  while (j < b.length) pousser("+", b[j++]!);
  return segments;
}

/** Ressemblance 0..1 entre deux textes (part de jetons communs) — sert
 * seulement à décider qu'une balise `<d>` est probablement la version
 * déformée d'une réplique, plutôt qu'un dialogue sans rapport. */
function ressemblance(a: string, b: string): number {
  const ja = jetons(a);
  const jb = jetons(b);
  if (ja.length === 0 && jb.length === 0) return 1;
  return (2 * tableLcs(ja, jb)[0]![0]!) / (ja.length + jb.length);
}

const SEUIL_RESSEMBLANCE = 0.4;

/** Réplique liée à un plan, telle que le contrôle a besoin de la voir.
 * `audioPresent` : une prise existe (c'est la référence `<Audio N>` qui pilote
 * le lipsync) ; `priseObsolete` : le texte a changé depuis la prise. */
export type RepliqueLiee = {
  id: number;
  texte: string;
  audioPresent: boolean;
  priseObsolete: boolean;
};

export type ProblemeDialogue =
  | { type: "absente"; repliqueId: number; texte: string }
  | { type: "differente"; repliqueId: number; texte: string; trouve: string; ecart: SegmentEcart[]; balise: BaliseD }
  | { type: "orpheline"; trouve: string; balise: BaliseD }
  | { type: "sans_audio"; repliqueId: number; texte: string }
  | { type: "prise_obsolete"; repliqueId: number; texte: string };

export type ControleDialogues = {
  problemes: ProblemeDialogue[];
  /** État de chaque réplique liée dans le prompt. */
  parReplique: Record<number, "ok" | "absente" | "differente">;
  ok: boolean;
};

/** Invariant verbatim (docs/FRICTIONS.md F02, révision 2026-09-30) : chaque
 * réplique liée au plan doit apparaître au mot près, ponctuation comprise, dans
 * une balise <d> du prompt — voix de personnage comme voix off — et chaque <d>
 * doit venir d'une réplique liée. Sans ça les lèvres bougent sur un autre texte
 * que celui monté. Une réplique sans prise audio, ou dont la prise ne dit plus
 * le texte courant, est signalée aussi : la référence `<Audio N>` du lipsync
 * n'est alors pas fiable.
 *
 * Appariement : d'abord les correspondances exactes ; parmi le reste, une
 * balise assez proche d'une réplique en est la version « différente » (avec
 * l'écart), sinon la réplique est « absente » et la balise « orpheline ». */
export function controlerDialogues(
  sections: PromptSection[],
  repliques: RepliqueLiee[],
): ControleDialogues {
  const balises = extraireBalisesD(sections);
  const balisesLibres = new Set(balises.keys());
  const parReplique: ControleDialogues["parReplique"] = {};
  const sansCorrespondance: RepliqueLiee[] = [];

  for (const r of repliques) {
    const cible = r.texte.trim();
    const idx = [...balisesLibres].find((i) => balises[i]!.texte === cible);
    if (idx === undefined) {
      sansCorrespondance.push(r);
    } else {
      balisesLibres.delete(idx);
      parReplique[r.id] = "ok";
    }
  }

  const candidats = sansCorrespondance
    .flatMap((r) =>
      [...balisesLibres].map((i) => ({ r, i, sim: ressemblance(r.texte.trim(), balises[i]!.texte) })),
    )
    .filter((c) => c.sim >= SEUIL_RESSEMBLANCE)
    .sort((x, y) => y.sim - x.sim);
  const differentes = new Map<number, number>(); // repliqueId -> index de balise
  for (const c of candidats) {
    if (differentes.has(c.r.id) || !balisesLibres.has(c.i)) continue;
    differentes.set(c.r.id, c.i);
    balisesLibres.delete(c.i);
  }

  const problemes: ProblemeDialogue[] = [];
  for (const r of sansCorrespondance) {
    const i = differentes.get(r.id);
    if (i === undefined) {
      parReplique[r.id] = "absente";
      problemes.push({ type: "absente", repliqueId: r.id, texte: r.texte });
    } else {
      const balise = balises[i]!;
      parReplique[r.id] = "differente";
      problemes.push({
        type: "differente",
        repliqueId: r.id,
        texte: r.texte,
        trouve: balise.texte,
        ecart: ecartVerbatim(r.texte.trim(), balise.texte),
        balise,
      });
    }
  }
  for (const i of balisesLibres) {
    problemes.push({ type: "orpheline", trouve: balises[i]!.texte, balise: balises[i]! });
  }
  for (const r of repliques) {
    if (!r.audioPresent) problemes.push({ type: "sans_audio", repliqueId: r.id, texte: r.texte });
    else if (r.priseObsolete) problemes.push({ type: "prise_obsolete", repliqueId: r.id, texte: r.texte });
  }

  return { problemes, parReplique, ok: problemes.length === 0 };
}

/** Une phrase pour dire pourquoi les dialogues d'un plan bloquent la
 * génération (« 1 réplique absente du prompt, 1 sans prise audio »). */
export function resumerProblemesDialogues(problemes: ProblemeDialogue[]): string {
  const n = (type: ProblemeDialogue["type"]) => problemes.filter((p) => p.type === type).length;
  const morceaux: [number, string, string][] = [
    [n("absente"), "réplique absente du prompt", "répliques absentes du prompt"],
    [n("differente"), "réplique citée autrement que mot pour mot", "répliques citées autrement que mot pour mot"],
    [n("orpheline"), "dialogue du prompt sans réplique liée", "dialogues du prompt sans réplique liée"],
    [n("sans_audio"), "réplique sans prise audio", "répliques sans prise audio"],
    [n("prise_obsolete"), "prise audio à refaire (le texte a changé)", "prises audio à refaire (le texte a changé)"],
  ];
  return morceaux
    .filter(([k]) => k > 0)
    .map(([k, un, plusieurs]) => `${k} ${k > 1 ? plusieurs : un}`)
    .join(", ");
}

/** Emplacements `<Audio N>` : la voix prime sur les bruitages (F02), donc les
 * répliques prennent les slots d'abord. Renvoie le plus petit slot libre, ou
 * null s'il n'en reste plus. */
export function prochainSlotAudioLibre(pris: number[]): number | null {
  for (let slot = 1; slot <= MAX_REFS.audio; slot++) {
    if (!pris.includes(slot)) return slot;
  }
  return null;
}

/** Cohérence des refs : chaque label <Picture N>/<Audio N>/<Video N> cité
 * dans le prompt doit exister dans la table de refs du plan, et
 * inversement.
 *
 * `derivees` : les refs audio DÉRIVÉES des répliques liées (l'audio de la
 * réplique EST la ref <Audio N>, voir DialoguesPanel). Elles comptent comme
 * déclarées (un prompt qui les cite n'a pas de label orphelin) mais ne sont
 * jamais « non citées » : le contrat de plan-h3 et les fiches validées de
 * l'épisode 1 ne citent pas les voix (docs/FRICTIONS.md, « iteration-plan
 * branché », 2026-10-02). Une ref de plan_refs (bruitage, image) non citée
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

export type StatutDuree = "tient" | "a_mesurer" | "decoupage_a_envisager";

/** Durée voix (F03) : somme des répliques + marge de respiration comparée au
 * plafond (15s par défaut). Une réplique non mesurée bloque le calcul —
 * la durée se mesure, elle ne s'estime pas. */
export function calculerStatutDuree(
  dialogues: Dialogue[],
  plafondSecondes: number,
  margeSecondes: number,
): { statut: StatutDuree; totalSecondes: number | null } {
  if (dialogues.length === 0) return { statut: "tient", totalSecondes: 0 };
  if (dialogues.some((d) => d.dureeSecondes == null)) {
    return { statut: "a_mesurer", totalSecondes: null };
  }
  const total = dialogues.reduce((acc, d) => acc + (d.dureeSecondes ?? 0), 0);
  const avecMarge = total + margeSecondes;
  return {
    statut: avecMarge <= plafondSecondes ? "tient" : "decoupage_a_envisager",
    totalSecondes: Math.round(total * 100) / 100,
  };
}

// ---------------------------------------------------------------------
// Structure des shots et durée de génération — règles de agents/skills/
// plan-h3/regles.md (cadence de coupe, plancher). Pas de contrôle du « Hard cut » :
// les plans validés en production ne l'écrivent pas toujours littéralement. Signalements,
// pas de blocage : c'est de la vigilance d'écriture, pas un invariant de
// données comme le verbatim.
// ---------------------------------------------------------------------

/** Plancher par shot : en dessous, H3 rallonge ou lisse le plan. */
export const SHOT_MIN_SECONDES = 1.5;
export const DUREE_GENERATION_MIN = 5;
export const DUREE_GENERATION_MAX = 15;

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

export function controlerStructure(
  sections: PromptSection[],
  dureeGenerationSecondes: number,
): ProblemeStructure[] {
  const problemes: ProblemeStructure[] = [];

  if (
    !Number.isInteger(dureeGenerationSecondes) ||
    dureeGenerationSecondes < DUREE_GENERATION_MIN ||
    dureeGenerationSecondes > DUREE_GENERATION_MAX
  ) {
    problemes.push({
      type: "duree_invalide",
      message: `La durée de génération doit être un entier de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s (actuellement ${dureeGenerationSecondes}).`,
    });
  }

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
    if (s.timecode >= dureeGenerationSecondes) {
      problemes.push({ type: "shot_hors_duree", message: `[Shot ${s.numero}] démarre à ${formaterTimecode(s.timecode)}, au-delà des ${dureeGenerationSecondes} s du plan.` });
      continue;
    }
    if (s.timecode - precedent < SHOT_MIN_SECONDES) {
      problemes.push({
        type: "shot_trop_court",
        message: `Le shot précédent [Shot ${s.numero - 1}] ne dure que ${(s.timecode - precedent).toFixed(2)} s : sous ${SHOT_MIN_SECONDES} s, H3 rallonge ou lisse le plan.`,
      });
    }
    debuts.push(s.timecode);
  }

  const dernier = debuts[debuts.length - 1]!;
  if (debuts.length > 1 && dureeGenerationSecondes - dernier < SHOT_MIN_SECONDES && dernier < dureeGenerationSecondes) {
    problemes.push({
      type: "shot_trop_court",
      message: `Le dernier shot ne dure que ${(dureeGenerationSecondes - dernier).toFixed(2)} s : sous ${SHOT_MIN_SECONDES} s, H3 rallonge ou lisse le plan.`,
    });
  }

  return problemes;
}
