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
  replique: string;
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

/** Invariant verbatim : la réplique du tableau dialogue doit apparaître au
 * mot près (ponctuation comprise) dans une balise <d> du prompt. Sans ça les
 * lèvres bougent sur un autre texte que celui monté (voir REGISTRE_ASSETS.md,
 * section Voix). */
export function verifierInvariantVerbatim(
  sections: PromptSection[],
  dialogues: Dialogue[],
): { replique: string; trouvee: boolean }[] {
  const texte = sections.map((s) => s.contenu).join("\n");
  const balisesD = [...texte.matchAll(/<d>(?:\[[^\]]*\])?(.*?)<\/d>/gs)].map(
    (m) => (m[1] ?? "").trim(),
  );
  return dialogues.map((d) => ({
    replique: d.replique,
    trouvee: balisesD.some((b) => b === d.replique.trim()),
  }));
}

/** Cohérence des refs : chaque label <Picture N>/<Audio N>/<Video N> cité
 * dans le prompt doit exister dans la table de refs du plan, et
 * inversement. */
export function verifierCoherenceRefs(
  sections: PromptSection[],
  refs: RefLabel[],
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

  const labelsOrphelins = [...labelsCites].filter((l) => !labelsDeclares.has(l));
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
    totalSecondes: total,
  };
}
