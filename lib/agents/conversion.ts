import { avecTitreDansImage, titreDansPrompt } from "../posters/posters";
import { PREFIXE_PAR_TYPE, TYPES_ASSET, slugifyCode } from "../assets/assetCode";
import type { ChangementBrut } from "./changes";
import { estLiaison } from "../clips/clip-link";
import { ajusterDureesScene, repartirDureesScenes } from "./treatment";
import type { Avertissement, PlaceScene, Position } from "./types";

/** From validated skill outputs to the changes of a proposal — IN CODE, without a second
 * call to the model. Pure, tested. The enrichment (current state, overwrite, scope) comes
 * afterwards, from the appliers. */

// --- prompt-asset -----------------------------------------------------------

export type SortiePromptAsset = {
  methode: "generation" | "edition";
  raisonMethode: string;
  sources?: string[];
  promptGeneration: string;
  remarques: { type: string; message: string }[];
};

export type AssetCourant = {
  id: number;
  code: string;
  type: string;
  methodeGeneration: string | null;
};

const TYPES_REMARQUE_SOUCIS = new Set(["voix-ou-musique", "description-vague", "incoherence-famille", "dependance-parent", "absence-ou-point-de-vue"]);

function avertissementsRemarques(remarques: { type: string; message: string }[]): Avertissement[] {
  return remarques.map((r) => ({ type: "info" as const, texte: TYPES_REMARQUE_SOUCIS.has(r.type) ? `${r.type} : ${r.message}` : r.message }));
}

/** An asset to modify: its prompt (and, if the agent recommends it differently, its method).
 * The canonical description is never rewritten by this skill. */
export function depuisPromptAsset(sortie: SortiePromptAsset, asset: AssetCourant): ChangementBrut[] {
  const apres: Record<string, unknown> = { promptGeneration: sortie.promptGeneration };
  if (sortie.methode !== (asset.methodeGeneration ?? "generation")) apres.methodeGeneration = sortie.methode;
  const avertissements = avertissementsRemarques(sortie.remarques ?? []);
  if (apres.methodeGeneration) {
    avertissements.unshift({ type: "info", texte: `Méthode recommandée : ${sortie.methode}. ${sortie.raisonMethode}` });
  }
  return [
    {
      groupe: "assets",
      cibleType: "asset",
      cibleRef: String(asset.id),
      libelle: `${asset.code} · prompt de génération`,
      operation: "modifier",
      apres,
      avertissements,
    },
  ];
}

/** A registry asset (step 2): to CREATE (does not exist) or to complete (its prompt is missing or is
 * rewritten). `description` is the canonical description from the brief: it creates the asset, or completes
 * an existing asset whose description is empty; it never replaces a written description. */
export type AssetDuRegistre = {
  code: string;
  type: string;
  suffixe: string;
  description: string;
  existant: AssetCourant | null;
  descriptionVide?: boolean;
};

export function depuisRegistreAsset(sortie: SortiePromptAsset, a: AssetDuRegistre): ChangementBrut[] {
  if (a.existant) {
    const bruts = depuisPromptAsset(sortie, a.existant).map((c) => ({ ...c, groupe: "assets" }));
    if (a.descriptionVide && a.description.trim()) {
      for (const c of bruts) c.apres = { ...(c.apres as Record<string, unknown>), description: a.description.trim() };
    }
    return bruts;
  }
  return [
    {
      groupe: "assets",
      cibleType: "asset",
      cibleRef: null,
      libelle: `${a.code} · nouvel asset`,
      operation: "creer",
      apres: {
        type: a.type,
        suffixe: a.suffixe,
        description: a.description.trim(),
        promptGeneration: sortie.promptGeneration,
        methodeGeneration: "generation",
      },
      avertissements: avertissementsRemarques(sortie.remarques ?? []),
    },
  ];
}

/** `{ liaison }` to write with a screenplay clip, or nothing if the output gives none (or an unknown value). */
const liaisonDe = (p: { liaison?: string }): { liaison?: string } => (estLiaison(p.liaison) ? { liaison: p.liaison } : {});

// --- scenario-episode -------------------------------------------------------

export type SortieScenarioEpisode = {
  episode: { titre: string; resume: string };
  scenes: {
    titre: string;
    fonction: string;
    /** Visual frame held across the whole scene. (The scene genre was removed on 2026-11-09: an old output that still
     * carries one is read, its genre ignored.) */
    ambiance?: string;
    plans: {
      titre: string;
      description: string;
      /** Link with the previous clip (lib/clips/clip-link.ts): absent from an older screenplay, in which case the clip's link does not change. */
      liaison?: string;
      dureeSecondes: number;
    }[];
  }[];
  inventions: string[];
  notes: string;
};

export type EpisodeCourant = {
  id: number;
  titre: string;
  resume: string;
  scenes: { id: number; titre: string }[];
  plans: { uuid: string; titre: string; sceneId: number | null }[];
};

const norme = (s: string) => s.trim().toLowerCase();

/** Tolerated gap between the screenplay's total duration and the brief's target duration before warning. */
export const ECART_DUREE_TOLERE = 0.2;

/** "Total duration" warning: a whole episode's screenplay deviates from the brief's target duration. Pure. */
export function avertissementDuree(totalSecondes: number, cibleSecondes: number | null | undefined): Avertissement | null {
  if (!cibleSecondes || cibleSecondes <= 0 || totalSecondes <= 0) return null;
  const ecart = (totalSecondes - cibleSecondes) / cibleSecondes;
  if (Math.abs(ecart) <= ECART_DUREE_TOLERE) return null;
  const pct = Math.round(Math.abs(ecart) * 100);
  return {
    type: "info",
    texte: `Durée totale des plans : ${totalSecondes} s pour ${cibleSecondes} s visées au brief (${ecart > 0 ? "+" : "−"}${pct} %). ${ecart > 0 ? "Plus long que voulu : resserre ou fusionne des plans." : "Plus court que voulu : ajoute de la matière ou revois la durée visée."}`,
  };
}

export type OptionsScenario = {
  /** Target duration of an episode (brief): a WHOLE episode's screenplay is compared against it (deviation warning). */
  dureeCibleSecondes?: number | null;
  /** Prefix for the symbolic keys: a batch puts several episodes into ONE proposal, and their keys
   * ("scene-1"…) must not collide. */
  prefixeCle?: string;
  /** Display group imposed on all changes (batch: `ep-<id>`, one group per episode). */
  groupe?: string;
  /** Batch: an episode that ALREADY has content sees its changes flagged as an overwrite
   * (special review section, unticked). An empty skeleton overwrites nothing. */
  signalerEcrasement?: boolean;
};

/** Whole episode ("compléter / préparer l'épisode"): the episode, its scenes, its clips and their
 * descriptions (the dialogue is written there). What already exists (same title) is MODIFIED, the rest is created: never twice. The
 * new clips are added at the end of the episode, in the output's order. Nothing is deleted (a new screenplay that changes the titles ADDS its clips to those
 * that exist: the review says so). */
export function depuisScenarioEpisode(sortie: SortieScenarioEpisode, ep: EpisodeCourant, options: OptionsScenario = {}): ChangementBrut[] {
  const pref = options.prefixeCle ?? "";
  const g = (defaut: string) => options.groupe ?? defaut;
  const aDuContenu = ep.scenes.length > 0 || ep.plans.length > 0;
  const ecrase = (texte: string) => (options.signalerEcrasement && aDuContenu ? { ecrase: texte } : {});
  const changements: ChangementBrut[] = [];
  const inventions: Avertissement[] = (sortie.inventions ?? []).map((t) => ({ type: "invention", texte: t }));

  if (norme(sortie.episode.titre) !== norme(ep.titre) || sortie.episode.resume.trim() !== ep.resume.trim()) {
    changements.push({
      groupe: g("episodes"),
      cibleType: "episode",
      cibleRef: String(ep.id),
      libelle: `Épisode · ${sortie.episode.titre}`,
      operation: "modifier",
      apres: { titre: sortie.episode.titre, resume: sortie.episode.resume },
      ...ecrase("Le titre et le résumé actuels de l'épisode seront remplacés."),
    });
  }

  let planCree = false;
  for (const [i, sc] of sortie.scenes.entries()) {
    const existante = ep.scenes.find((s) => norme(s.titre) === norme(sc.titre));
    const cleScene = existante ? null : `${pref}scene-${i + 1}`;
    if (!existante) {
      changements.push({
        groupe: g("scenes"),
        cle: cleScene,
        cibleType: "scene",
        cibleRef: null,
        libelle: `Scène · ${sc.titre}`,
        operation: "creer",
        sousGroupe: sc.titre,
        apres: {
          titre: sc.titre,
          fonction: sc.fonction,
          episodeId: ep.id,
          ...(sc.ambiance?.trim() ? { ambiance: sc.ambiance.trim() } : {}),
        },
      });
    }
    for (const [j, p] of sc.plans.entries()) {
      const dejaLa = ep.plans.find((x) => norme(x.titre) === norme(p.titre));
      const avert: Avertissement[] =
        !dejaLa && ep.plans.length > 0 && !planCree
          ? [{ type: "info", texte: `Cet épisode a déjà ${ep.plans.length} plan${ep.plans.length > 1 ? "s" : ""} : les plans nouveaux s'ajoutent à la fin, rien n'est supprimé.` }]
          : [];
      if (dejaLa) {
        changements.push({
          groupe: g("plans"),
          cibleType: "plan",
          cibleRef: dejaLa.uuid,
          libelle: `Plan · ${p.titre}`,
          operation: "modifier",
          sousGroupe: sc.titre,
          apres: { description: p.description, dureeGenerationSecondes: p.dureeSecondes, ...liaisonDe(p) },
          avertissements: avert,
          ...ecrase(`La description et la durée actuelles de « ${p.titre} » seront remplacées.`),
        });
      } else {
        planCree = true;
        const clePlan = `${pref}plan-${i + 1}-${j + 1}`;
        changements.push({
          groupe: g("plans"),
          cle: clePlan,
          cibleType: "plan",
          cibleRef: null,
          libelle: `Plan · ${p.titre}`,
          operation: "creer",
          position: { fin: true },
          sousGroupe: sc.titre,
          apres: {
            titre: p.titre,
            description: p.description,
            dureeGenerationSecondes: p.dureeSecondes,
            ...liaisonDe(p),
            episodeId: ep.id,
            ...(existante ? { sceneId: existante.id } : { sceneCle: cleScene }),
          },
          avertissements: avert,
        });
      }
    }
  }

  // The inventions and notes are attached to the first change (the review surfaces them).
  if (changements.length > 0) {
    const total = sortie.scenes.reduce((s, sc) => s + sc.plans.reduce((t, p) => t + (Number.isFinite(p.dureeSecondes) ? p.dureeSecondes : 0), 0), 0);
    const ecartDuree = avertissementDuree(total, options.dureeCibleSecondes);
    changements[0]!.avertissements = [
      ...(changements[0]!.avertissements ?? []),
      ...(ecartDuree ? [ecartDuree] : []),
      ...inventions,
      ...(sortie.notes?.trim() ? [{ type: "info" as const, texte: sortie.notes.trim() }] : []),
    ];
  }
  return changements;
}

// --- traitement-episode and scenario-scene (step E: a feature film's screenplay, scene by scene) ---------------------

export type SortieTraitement = {
  scenes: {
    titre: string;
    fonction: string;
    ambiance?: string;
    intention: string;
    etatEntree: string;
    etatSortie: string;
    poids: number;
    momentsDeLAuteur?: string;
  }[];
  inventions: string[];
  notes: string;
};

/** An episode's treatment becomes SCENES (creations, with their treatment): the durations in seconds are computed HERE from the weights, so that
 * their sum falls exactly on the target duration. A scene whose title already exists is left alone; two scenes with the same title are told apart (each scene's
 * screenplay finds its own by title). Pure, tested. */
export function depuisTraitement(
  sortie: SortieTraitement,
  ep: Pick<EpisodeCourant, "id" | "scenes">,
  options: { dureeEpisodeSecondes: number; prefixeCle?: string; groupe?: string },
): ChangementBrut[] {
  const pref = options.prefixeCle ?? "";
  const durees = repartirDureesScenes(sortie.scenes.map((s) => s.poids), options.dureeEpisodeSecondes);
  const pris = new Set(ep.scenes.map((s) => norme(s.titre)));
  const changements: ChangementBrut[] = [];
  for (const [i, sc] of sortie.scenes.entries()) {
    let titre = sc.titre.trim();
    for (let n = 2; pris.has(norme(titre)); n++) titre = `${sc.titre.trim()} (${n})`;
    pris.add(norme(titre));
    changements.push({
      groupe: options.groupe ?? "scenes",
      cle: `${pref}scene-${i + 1}`,
      cibleType: "scene",
      cibleRef: null,
      libelle: `Scène · ${titre}`,
      operation: "creer",
      sousGroupe: titre,
      apres: {
        titre,
        fonction: sc.fonction,
        episodeId: ep.id,
        ...(sc.ambiance?.trim() ? { ambiance: sc.ambiance.trim() } : {}),
        traitement: {
          intention: sc.intention,
          etatEntree: sc.etatEntree,
          etatSortie: sc.etatSortie,
          dureeCibleSecondes: durees[i]!,
          momentsDeLAuteur: sc.momentsDeLAuteur ?? "",
        },
      },
      avertissements: i === 0 ? [...(sortie.inventions ?? []).map((t) => ({ type: "invention" as const, texte: t })), ...(sortie.notes?.trim() ? [{ type: "info" as const, texte: sortie.notes.trim() }] : [])] : [],
    });
  }
  return changements;
}

export type SortieScenarioScene = {
  plans: { titre: string; description: string; liaison?: string; dureeSecondes: number }[];
  inventions: string[];
  notes: string;
};

/** The clips of ONE scene (created by the treatment): same changes as an episode screenplay restricted to this scene, whose durations are brought back to the
 * scene's target duration (`ajusterDureesScene`). Clips are compared only with the scene's own clips: a title reused elsewhere in the film does not
 * "modify" a clip of another scene. Pure, tested. */
export function depuisScenarioScene(
  sortie: SortieScenarioScene,
  ep: EpisodeCourant,
  scene: { id: number; titre: string; fonction: string; dureeCibleSecondes: number },
  options: { prefixeCle?: string; groupe?: string } = {},
): ChangementBrut[] {
  const durees = ajusterDureesScene(
    sortie.plans.map((p) => Number(p.dureeSecondes) || 0),
    scene.dureeCibleSecondes,
  );
  return depuisScenarioEpisode(
    {
      episode: { titre: ep.titre, resume: ep.resume },
      scenes: [{ titre: scene.titre, fonction: scene.fonction, plans: sortie.plans.map((p, i) => ({ ...p, dureeSecondes: durees[i]! })) }],
      inventions: sortie.inventions,
      notes: sortie.notes,
    },
    { ...ep, plans: ep.plans.filter((p) => p.sceneId === scene.id) },
    { ...options, dureeCibleSecondes: scene.dureeCibleSecondes },
  );
}

/** A single clip to insert at a position ("a cutaway clip after clip X"): the first
 * clip of the output's first scene, with its lines of dialogue. The scene is that of the reference clip. */
export function depuisPlanAInserer(
  sortie: SortieScenarioEpisode,
  cible: { episodeId: number; position: Position; sceneId: number | null },
): ChangementBrut[] {
  const p = sortie.scenes[0]?.plans[0];
  if (!p) return [];
  const info: Avertissement[] = [
    ...(sortie.inventions ?? []).map((t) => ({ type: "invention" as const, texte: t })),
    ...(sortie.notes?.trim() ? [{ type: "info" as const, texte: sortie.notes.trim() }] : []),
  ];
  return [
    {
      groupe: "plans",
      cle: "plan-insere",
      cibleType: "plan",
      cibleRef: null,
      libelle: `Plan · ${p.titre}`,
      operation: "creer",
      position: cible.position,
      apres: {
        titre: p.titre,
        description: p.description,
        dureeGenerationSecondes: p.dureeSecondes,
        ...liaisonDe(p),
        episodeId: cible.episodeId,
        ...(cible.sceneId != null ? { sceneId: cible.sceneId } : {}),
      },
      avertissements: info,
    },
  ];
}

/** A single SCENE to insert ("Nouvelle scène" between two scenes): the output's first scene, with its clips. The scene carries its place
 * (`apresSceneId` or `debut`); its clips join it by their key and sit in its block (the episode's order is grouped by scene). A
 * new scene has no treatment: it is written here in one piece, with its clips. Pure, tested. */
export function depuisSceneAInserer(
  sortie: SortieScenarioEpisode,
  cible: { episodeId: number; place: PlaceScene; titresPris?: string[] },
): ChangementBrut[] {
  const sc = sortie.scenes[0];
  if (!sc || sc.plans.length === 0) return [];
  const pris = new Set((cible.titresPris ?? []).map(norme));
  let titre = sc.titre.trim();
  for (let n = 2; pris.has(norme(titre)); n++) titre = `${sc.titre.trim()} (${n})`;
  const info: Avertissement[] = [
    ...(sortie.inventions ?? []).map((t) => ({ type: "invention" as const, texte: t })),
    ...(sortie.notes?.trim() ? [{ type: "info" as const, texte: sortie.notes.trim() }] : []),
  ];
  return [
    {
      groupe: "scenes",
      cle: "scene-inseree",
      cibleType: "scene",
      cibleRef: null,
      libelle: `Scène · ${titre}`,
      operation: "creer",
      sousGroupe: titre,
      apres: {
        titre,
        fonction: sc.fonction,
        episodeId: cible.episodeId,
        ...cible.place,
        ...(sc.ambiance?.trim() ? { ambiance: sc.ambiance.trim() } : {}),
      },
      avertissements: info,
    },
    ...sc.plans.map(
      (p, j): ChangementBrut => ({
        groupe: "plans",
        cle: `plan-insere-${j + 1}`,
        cibleType: "plan",
        cibleRef: null,
        libelle: `Plan · ${p.titre}`,
        operation: "creer",
        position: { fin: true },
        sousGroupe: titre,
        apres: {
          titre: p.titre,
          description: p.description,
          dureeGenerationSecondes: p.dureeSecondes,
          // The first clip of a new scene is a cut: no end state to carry over.
          ...liaisonDe(j === 0 ? { ...p, liaison: "coupe" } : p),
          episodeId: cible.episodeId,
          sceneCle: "scene-inseree",
        },
      }),
    ),
  ];
}

/** A single clip to correct (scope `plan`): its description and duration, from the output of the
 * `scenario-episode` skill restricted to this clip. */
export function depuisCorrectionPlan(sortie: SortieScenarioEpisode, plan: { uuid: string; titre: string }): ChangementBrut[] {
  const p = sortie.scenes[0]?.plans[0];
  if (!p) return [];
  return [
    {
      groupe: "plans",
      cibleType: "plan",
      cibleRef: plan.uuid,
      libelle: `Plan · ${plan.titre}`,
      operation: "modifier",
      apres: { description: p.description, dureeGenerationSecondes: p.dureeSecondes, ...liaisonDe(p) },
      avertissements: [
        ...(sortie.inventions ?? []).map((t) => ({ type: "invention" as const, texte: t })),
      ],
    },
  ];
}

/** The codes of the characters whose brief says the voice is a voice-over (thoughts, inner monologue): their `voix` says so plainly. */
export function codesEnVoixOff(personnages: { nom?: string; voix?: string }[], codes: string[]): Set<string> {
  const voixOff = /voix\s*off|pens[ée]e|monologue|int[ée]rieur|inner|voice-?over/i;
  const noms = personnages.filter((p) => typeof p.nom === "string" && voixOff.test(p.voix ?? "")).map((p) => slugifyCode(p.nom!));
  return new Set(codes.filter((c) => noms.includes(slugifyCode(c.includes("_") ? c.slice(c.indexOf("_") + 1) : c))));
}

/** Asset types a proposal can create. A "keyframe" (composite pose: several elements mixed in one
 * image) has been part of it since 2026-10-06; the voice is no longer an asset (a character field). */
export const TYPES_MANQUANTS = new Set<string>(TYPES_ASSET);

/** "PROP_lettre" (prop type) → suffix "lettre": the prefix the model wrote is removed, the final code
 * is rebuilt from the type (registry convention). */
export function suffixeDeCode(code: string): string {
  const prefixes = Object.values(PREFIXE_PAR_TYPE).sort((a, b) => b.length - a.length);
  const p = prefixes.find((x) => code.toUpperCase().startsWith(x)) ?? /^[A-Z]{2,6}_/.exec(code)?.[0]; // known prefix, or in capitals (ACC_…)
  return slugifyCode(p ? code.slice(p.length) : code);
}


// --- prompt-asset, affiche variant (presentation poster of a project or an episode) ---------------

/** Same output as `SortiePromptAsset` (`remarques` as `{type, message}`); a remark as a plain string (old format) is still read. */
export type SortiePromptAffiche = {
  methode: "generation" | "edition";
  sources?: string[];
  promptGeneration: string;
  remarques: (string | { type: string; message: string })[];
};

/** A poster's prompt: a change to the poster asset. The title line follows the CURRENT poster setting (the
 * "écrire le titre dans l'image" checkbox may have changed since the request). The "édition" method (main character's image
 * as source 1) is kept only if that image existed at request time. */
export function depuisPromptAffiche(
  sortie: SortiePromptAffiche,
  asset: { id: number; promptGeneration: string | null; methodeGeneration: string | null },
  demande: { titre: string; imagePersonnageDisponible: boolean },
): ChangementBrut[] {
  const methode = sortie.methode === "edition" && demande.imagePersonnageDisponible ? "edition" : "generation";
  const apres: Record<string, unknown> = {
    promptGeneration: avecTitreDansImage(sortie.promptGeneration.trim(), demande.titre, titreDansPrompt(asset.promptGeneration ?? "")),
  };
  if (methode !== (asset.methodeGeneration ?? "generation")) apres.methodeGeneration = methode;
  const avertissements: Avertissement[] = [
    ...avertissementsRemarques((sortie.remarques ?? []).filter((r): r is { type: string; message: string } => typeof r !== "string")),
    ...(sortie.remarques ?? []).filter((r): r is string => typeof r === "string").map((texte) => ({ type: "info" as const, texte })),
  ];
  if (methode === "edition") avertissements.unshift({ type: "info", texte: "L'image du personnage principal est la source ; à la génération, un canevas vide 2:3 est ajouté en image 1 pour fixer le format de l'affiche : la fenêtre s'ouvre en mode « images »." });
  return [
    {
      groupe: "assets",
      cibleType: "asset",
      cibleRef: String(asset.id),
      libelle: `Affiche · ${demande.titre} · prompt de génération`,
      operation: "modifier",
      apres,
      avertissements,
    },
  ];
}
