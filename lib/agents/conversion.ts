import { avecTitreDansImage, titreDansPrompt } from "../affiches";
import { PREFIXE_PAR_TYPE, TYPES_ASSET, construireCode, slugifyCode } from "../assetCode";
import type { ChangementBrut } from "./changements";
import { cleNouvelAsset, type ApresFiche, type RefFiche } from "./fiches";
import { corrigerCodesInconnus } from "./codes-proches";
import { assemblerPlanH3 } from "./plan-h3-assemblage";
import { controlerSortiePlanH3, type ProblemeH3, type SortiePlanH3 } from "./plan-h3-controles";
import { genreOuNull } from "../scene-genres";
import type { Avertissement, Position } from "./types";

/** Des sorties validées des skills aux changements d'une proposition — EN CODE, sans second
 * appel au modèle. Pur, testé. L'enrichissement (état courant, écrasement, portée) vient
 * ensuite, des applicateurs. */

// --- prompt-asset -----------------------------------------------------------

export type SortiePromptAsset = {
  methode: "generation" | "edition";
  raisonMethode: string;
  sources?: string[];
  promptGeneration: string;
  dureeSecondes?: number;
  remarques: { type: string; message: string }[];
};

export type AssetCourant = {
  id: number;
  code: string;
  type: string;
  methodeGeneration: string | null;
  /** Une méthode d'image n'a pas de sens pour une voix ou un son. */
  methodeApplicable: boolean;
};

const TYPES_REMARQUE_SOUCIS = new Set(["voix-ou-musique", "description-vague", "incoherence-famille", "dependance-parent", "absence-ou-point-de-vue"]);

export function avertissementsRemarques(remarques: { type: string; message: string }[]): Avertissement[] {
  return remarques.map((r) => ({ type: "info" as const, texte: TYPES_REMARQUE_SOUCIS.has(r.type) ? `${r.type} : ${r.message}` : r.message }));
}

/** Un asset à modifier : son prompt (et, si l'agent la recommande autrement, sa méthode ; pour
 * un son, sa durée). La description canonique n'est jamais réécrite par ce skill. */
export function depuisPromptAsset(sortie: SortiePromptAsset, asset: AssetCourant): ChangementBrut[] {
  const apres: Record<string, unknown> = { promptGeneration: sortie.promptGeneration };
  if (asset.methodeApplicable && sortie.methode !== (asset.methodeGeneration ?? "generation")) apres.methodeGeneration = sortie.methode;
  if (asset.type === "sfx" && typeof sortie.dureeSecondes === "number") apres.dureeSecondes = sortie.dureeSecondes;
  const avertissements = avertissementsRemarques(sortie.remarques ?? []);
  if (asset.methodeApplicable && apres.methodeGeneration) {
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

/** Un asset du registre (étape 2) : à CRÉER (n'existe pas) ou à compléter (son prompt manque ou est
 * réécrit). `description` est la description canonique issue du brief : elle crée l'asset, ou complète
 * un asset existant dont la description est vide ; elle ne remplace jamais une description écrite. */
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
        critique: false,
      },
      avertissements: avertissementsRemarques(sortie.remarques ?? []),
    },
  ];
}

// --- prompt-voix (casting des voix) ------------------------------------------

export type SortiePromptVoix = {
  instruction: string;
  refText?: string;
  remarques: { type: string; message: string }[];
};

/** Une voix du casting (étape « casting des voix ») : toujours une CRÉATION. `personnageId` rattache la
 * voix à son personnage (null : voix off). `description` est celle du personnage, reprise comme description
 * canonique du timbre tant que l'utilisateur n'en a pas écrit une. */
export type VoixDuCasting = { codeVoix: string; suffixe: string; personnageId: number | null; personnageCode: string | null; description: string };

export function depuisCastingVoix(sortie: SortiePromptVoix, v: VoixDuCasting): ChangementBrut[] {
  return [
    {
      groupe: "voix",
      cibleType: "voix",
      cibleRef: null,
      libelle: `${v.codeVoix} · nouvelle voix${v.personnageCode ? ` de ${v.personnageCode}` : ""}`,
      operation: "creer",
      apres: {
        suffixe: v.suffixe,
        personnageId: v.personnageId,
        description: v.description.trim(),
        instruction: sortie.instruction.trim(),
        ...(sortie.refText?.trim() ? { refText: sortie.refText.trim() } : {}),
      },
      avertissements: avertissementsRemarques(sortie.remarques ?? []),
    },
  ];
}

// --- scenario-episode -------------------------------------------------------

export type SortieScenarioEpisode = {
  episode: { titre: string; resume: string };
  scenes: {
    titre: string;
    fonction: string;
    /** Genre de la scène (lib/scene-genres.ts) et cadre visuel tenu sur toute la scène. */
    genre?: string;
    ambiance?: string;
    plans: {
      titre: string;
      description: string;
      dureeSecondes: number;
      repliques: { locuteur: string; texte: string }[];
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

/** Au plus trois répliques par plan : chacune occupe un emplacement <Audio N>, et MiniMax H3
 * en accepte trois (lib/plan-checks.ts, MAX_REFS.audio). La suivante est refusée d'office, avec
 * la raison, plutôt que perdue en silence. */
export const MAX_REPLIQUES_PAR_PLAN = 3;

/** Écart toléré entre la durée totale du scénario et la durée visée du brief avant d'en avertir. */
export const ECART_DUREE_TOLERE = 0.2;

/** Avertissement « durée totale » : le scénario d'un épisode entier s'écarte de la durée visée du brief. Pur. */
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
  /** Durée visée d'un épisode (brief) : le scénario d'un épisode ENTIER est comparé à elle (avertissement d'écart). */
  dureeCibleSecondes?: number | null;
  /** Préfixe des clés symboliques : un lot met plusieurs épisodes dans UNE proposition, leurs clés
   * (« scene-1 »…) ne doivent pas se rencontrer. */
  prefixeCle?: string;
  /** Groupe d'affichage imposé à tous les changements (lot : `ep-<id>`, un groupe par épisode). */
  groupe?: string;
  /** Lot : un épisode qui a DÉJÀ du contenu voit ses modifications signalées comme écrasement
   * (section spéciale de la revue, décochées). Un squelette vide n'écrase rien. */
  signalerEcrasement?: boolean;
};

type Repliques = { locuteur: string; texte: string }[];

function extrait(texte: string, max = 60): string {
  const t = texte.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Les répliques d'un plan, en changements « créer une réplique » rattachés à ce plan (par sa clé
 * s'il est créé par la même proposition, par son uuid sinon). Aucun asset n'est créé : le
 * locuteur est rapproché du registre par l'applicateur. */
function changementsRepliques(
  repliques: Repliques | undefined,
  cible: { episodeId: number; planCle?: string; planUuid?: string; sceneCle?: string; sceneId?: number | null },
  prefixe: string,
  groupe: string,
  sousGroupe: string | null,
  cles: [number, number],
): ChangementBrut[] {
  return (repliques ?? []).map((r, k) => {
    const hors = k >= MAX_REPLIQUES_PAR_PLAN;
    return {
      groupe,
      cle: `${prefixe}rep-${cles[0]}-${cles[1]}-${k + 1}`,
      cibleType: "replique" as const,
      cibleRef: null,
      libelle: `Réplique · ${r.locuteur.trim() || "?"} : « ${extrait(r.texte)} »`,
      operation: "creer" as const,
      sousGroupe,
      apres: {
        texte: r.texte,
        locuteur: r.locuteur,
        episodeId: cible.episodeId,
        ...(cible.planCle ? { planCle: cible.planCle } : { planUuid: cible.planUuid }),
        ...(cible.sceneCle ? { sceneCle: cible.sceneCle } : cible.sceneId != null ? { sceneId: cible.sceneId } : {}),
      },
      ...(hors
        ? { refuseRaison: `Ce plan a déjà ${MAX_REPLIQUES_PAR_PLAN} répliques : c'est le maximum de références audio (MiniMax H3). Coupe le plan à une frontière de sens pour répartir le dialogue.` }
        : {}),
    };
  });
}

/** Épisode entier (« compléter / préparer l'épisode ») : l'épisode, ses scènes, ses plans ET leurs
 * répliques. Ce qui existe déjà (même titre) est MODIFIÉ, le reste est créé : jamais deux fois. Les
 * plans neufs sont ajoutés en fin d'épisode, dans l'ordre de la sortie ; les répliques se lient à
 * leur plan. Rien n'est supprimé (un nouveau scénario qui change les titres AJOUTE ses plans à ceux
 * qui existent : la revue le dit). */
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
          ...(genreOuNull(sc.genre) ? { genre: sc.genre } : {}),
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
          apres: { description: p.description, dureeGenerationSecondes: p.dureeSecondes },
          avertissements: avert,
          ...ecrase(`La description et la durée actuelles de « ${p.titre} » seront remplacées.`),
        });
        changements.push(...changementsRepliques(p.repliques, { episodeId: ep.id, planUuid: dejaLa.uuid, ...(existante ? { sceneId: existante.id } : { sceneCle: cleScene ?? undefined }) }, pref, g("repliques"), sc.titre, [i + 1, j + 1]));
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
            episodeId: ep.id,
            ...(existante ? { sceneId: existante.id } : { sceneCle: cleScene }),
          },
          avertissements: avert,
        });
        changements.push(...changementsRepliques(p.repliques, { episodeId: ep.id, planCle: clePlan, ...(existante ? { sceneId: existante.id } : { sceneCle: cleScene ?? undefined }) }, pref, g("repliques"), sc.titre, [i + 1, j + 1]));
      }
    }
  }

  // Les inventions et les notes se posent sur le premier changement (la revue les remonte).
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

/** Un seul plan à insérer à une position (« un plan de coupe après le plan X ») : le premier
 * plan de la première scène de la sortie, avec ses répliques. La scène est celle du plan de repère. */
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
        episodeId: cible.episodeId,
        ...(cible.sceneId != null ? { sceneId: cible.sceneId } : {}),
      },
      avertissements: info,
    },
    ...changementsRepliques(p.repliques, { episodeId: cible.episodeId, planCle: "plan-insere", sceneId: cible.sceneId }, "", "repliques", null, [1, 1]),
  ];
}

/** Un seul plan à corriger (portée `plan`) : sa description et sa durée, depuis la sortie du
 * skill `scenario-episode` restreinte à ce plan. */
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
      apres: { description: p.description, dureeGenerationSecondes: p.dureeSecondes },
      avertissements: [
        ...(sortie.inventions ?? []).map((t) => ({ type: "invention" as const, texte: t })),
        ...(p.repliques?.length ? [{ type: "info" as const, texte: "Les répliques du plan ne sont pas modifiées par une correction de plan : elles se changent dans la fiche de plan." }] : []),
      ],
    },
  ];
}

// --- plan-h3 (étape 3 : la fiche d'un plan) ----------------------------------------

export type PlanPourFicheH3 = {
  uuid: string;
  titre: string;
  /** Slots `<Audio N>` déjà pris par les répliques liées (plan_dialogues) : l'entrée de l'assemblage. */
  slotsAudioPris: number[];
  /** Répliques liées au plan : uuid public et texte exact (verbatim). */
  repliques: { uuid: string; texte: string }[];
  /** Le registre du projet (code, type), tel qu'il est maintenant. */
  registre: { code: string; type: string }[];
};

export type OptionsFichePlan = {
  /** Lot : `ep-<id>` (un groupe par épisode) ; sinon « fiches » pour la fiche, « assets » pour les créations. */
  groupe?: string;
  /** Lot : la scène du plan, sous laquelle la revue range sa fiche et ses assets. */
  sousGroupe?: string | null;
  /** Codes dont la CRÉATION est déjà proposée par une autre sous-tâche du lot : pas de doublon. */
  codesDejaProposes?: Set<string>;
  /** Textes des exemples du skill (alerte de recopie). */
  corpusExemples?: string[];
};

const echapperRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Types d'assets qu'une proposition peut créer. Un « keyframe » (pose composite : plusieurs éléments mêlés dans une même
 * image) en fait partie depuis le 2026-10-06 ; seule la voix se fabrique ailleurs (casting vocal). */
export const TYPES_MANQUANTS = new Set<string>(TYPES_ASSET.filter((t) => t !== "voix"));

/** Remplace un marqueur `[[CODE]]` (ou `[CODE]`) par du texte : une référence qu'on ne peut pas poser est
 * décrite en prose, par le nom que le modèle lui a donné. */
function marqueurEnProse(texte: string, code: string, nom: string): string {
  const c = echapperRe(code);
  return texte.replace(new RegExp(`\\[\\[\\s*${c}\\s*\\]\\]|(?<!\\[)\\[${c}\\](?!\\])`, "g"), nom);
}

/** « PROP_lettre » (type prop) → suffixe « lettre » : le préfixe que le modèle a écrit est retiré, le code
 * final est reconstruit depuis le type (convention du registre). */
export function suffixeDeCode(code: string): string {
  const prefixes = Object.values(PREFIXE_PAR_TYPE).sort((a, b) => b.length - a.length);
  const p = prefixes.find((x) => code.toUpperCase().startsWith(x)) ?? /^[A-Z]{2,6}_/.exec(code)?.[0]; // préfixe connu, ou en capitales (ACC_…)
  return slugifyCode(p ? code.slice(p.length) : code);
}

function versAvertissement(p: ProblemeH3): Avertissement | null {
  if (p.regle === "asset-manquant" || p.regle === "manquant-existant") return null; // traités par les créations d'assets
  if (p.niveau === "info") return { type: "info", texte: p.message };
  return { type: "alerte_controle", texte: p.niveau === "erreur" ? `Contrat non tenu (après renvoi au modèle) : ${p.message}` : p.message };
}

/** La sortie de `plan-h3` (un BROUILLON) → les changements d'une proposition, EN CODE :
 * - la fiche du plan (cible `fiche`) : les six sections ASSEMBLÉES (lib/agents/plan-h3-assemblage.ts) avec
 *   les slots audio des voix du plan en entrée, ses références picture/audio (qui REMPLACENT celles du plan :
 *   « régénérer = tout régénérer ») et sa durée de génération. Les voix ne deviennent jamais des références ;
 * - un changement « créer un asset » par asset manquant (avec son parent : `deriveDeCode` s'il existe,
 *   `deriveDeCle` s'il est créé par la même proposition). Un asset déclaré manquant qui existe déjà est
 *   ignoré (avertissement) ; une référence ne vise jamais un asset manquant (il reste décrit en prose).
 * Une référence qui n'est pas au registre, ou de la mauvaise nature, est retirée et décrite en prose par son
 * nom (alerte). Les problèmes des contrôles remontent en avertissements ; un marqueur `[[CODE]]` que le code
 * ne sait pas résoudre bloque la fiche (à relancer). L'état du plan (vide, rempli, rendu) est lu par
 * l'applicateur `fiche` (écrasement). Pur, testé. */
export function depuisFichePlan(sortieBrute: SortiePlanH3, plan: PlanPourFicheH3, options: OptionsFichePlan = {}): ChangementBrut[] {
  // Un code mal recopié (mots de liaison) se corrige sans ambiguïté ; sinon il reste une erreur franche (voir codes-proches.ts).
  const { sortie, corrections } = corrigerCodesInconnus(sortieBrute, plan.registre.map((a) => a.code));
  const typeDe = new Map(plan.registre.map((a) => [a.code, a.type]));
  const avertissements: Avertissement[] = [];
  const ajouter = (a: Avertissement | null) => {
    if (a && !avertissements.some((x) => x.type === a.type && x.texte === a.texte)) avertissements.push(a);
  };

  for (const c of corrections) ajouter({ type: "info", texte: `Code « ${c.de} » corrigé en « ${c.vers} » : même asset, mal recopié par le modèle.` });

  // 1. références : seules celles du registre, de la bonne nature, une fois chacune
  let textes = {
    summary: sortie.summary ?? "",
    ouverture: sortie.ouverture ?? "",
    shots: (sortie.shots ?? []).map((s) => ({ ...s, texte: s.texte ?? "" })),
    overall_soundscape: sortie.overall_soundscape ?? "",
    non_diegetic_music: sortie.non_diegetic_music ?? "",
  };
  const enProse = (code: string, nom: string) => {
    textes = {
      summary: marqueurEnProse(textes.summary, code, nom),
      ouverture: marqueurEnProse(textes.ouverture, code, nom),
      shots: textes.shots.map((s) => ({ ...s, texte: marqueurEnProse(s.texte, code, nom) })),
      overall_soundscape: marqueurEnProse(textes.overall_soundscape, code, nom),
      non_diegetic_music: marqueurEnProse(textes.non_diegetic_music, code, nom),
    };
  };
  const gardees: SortiePlanH3["references"] = [];
  for (const r of sortie.references ?? []) {
    if (gardees.some((g) => g.asset === r.asset)) continue; // doublon : la première fait foi
    const type = typeDe.get(r.asset);
    let raison: string | null = null;
    if (type == null) raison = `${r.asset} n'est pas au registre`;
    else if (type === "voix") raison = `${r.asset} est une voix (les voix ne sont jamais des références)`;
    else if (r.nature === "son" && type !== "sfx") raison = `${r.asset} (${type}) n'est pas un bruitage`;
    else if (r.nature === "image" && type === "sfx") raison = `${r.asset} est un bruitage, sans image`;
    if (raison) {
      ajouter({ type: "alerte_controle", texte: `${raison} : la référence est retirée et décrite en prose (« ${r.nom} »).` });
      enProse(r.asset, r.nom);
    } else gardees.push(r);
  }
  const nettoyee: SortiePlanH3 = { ...sortie, ...textes, references: gardees };

  // 2. assemblage (labels, timecodes, sections) avec les slots des voix
  const assemble = assemblerPlanH3(nettoyee, { slotsAudioPris: plan.slotsAudioPris });
  const refs: RefFiche[] = assemble.refs
    .filter((r) => r.slot != null)
    .map((r) => {
      const ref = gardees.find((g) => g.asset === r.asset);
      return {
        type: r.nature === "image" ? ("picture" as const) : ("audio" as const),
        slot: r.slot!,
        asset: r.asset,
        role: ref?.role ?? null,
        retention: r.nature === "son" ? r.retention : null,
      };
    });

  // 3. contrôles (sur la sortie du modèle) et problèmes de l'assemblage
  const problemes = [
    ...controlerSortiePlanH3(sortie, {
      registre: plan.registre,
      repliques: plan.repliques.map((r) => ({ texte: r.texte })),
      slotsAudioPris: plan.slotsAudioPris,
      corpusExemples: options.corpusExemples,
    }),
    ...assemble.problemes,
  ];
  for (const p of problemes) ajouter(versAvertissement(p));
  const liees = new Set(plan.repliques.map((r) => r.uuid));
  for (const r of sortie.repliques ?? []) {
    if (!liees.has(r.repliqueId)) ajouter({ type: "alerte_controle", texte: `La sortie cite une réplique qui n'est pas liée au plan (${r.repliqueId}) : ignorée, les liens restent ceux du plan.` });
  }
  const residuel = /\[\[\s*([^\]]+?)\s*\]\]/.exec(assemble.texte);
  if (residuel) {
    ajouter({
      type: "bloque_controle",
      texte: `Le prompt garde un marqueur [[${residuel[1]}]] que le code ne sait pas résoudre (asset manquant ou absent des références) : relance la fiche avec ce retour.`,
    });
  }

  // 4. assets manquants : créés dans la même proposition (leurs prompts s'écrivent ensuite)
  const creations: ChangementBrut[] = [];
  const declares = (sortie.assetsManquants ?? []).map((m) => ({ m, code: TYPES_MANQUANTS.has(m.type) && suffixeDeCode(m.code) ? construireCode(m.type, suffixeDeCode(m.code)) : null }));
  const codesDeclares = new Map<string, string>(); // code écrit par le modèle (ou final) → code final
  for (const { m, code } of declares) if (code) codesDeclares.set(m.code, code).set(code, code);
  const vus = new Set<string>();
  for (const { m, code } of declares) {
    if (!code) {
      ajouter({ type: "alerte_controle", texte: `Asset manquant « ${m.code} » (${m.type}) : type ou nom inutilisable, non créé.` });
      continue;
    }
    if (typeDe.has(code)) {
      ajouter({ type: "alerte_controle", texte: `${code} est déclaré manquant mais existe déjà au registre : rien n'est créé.` });
      continue;
    }
    if (vus.has(code)) continue;
    vus.add(code);
    if (options.codesDejaProposes?.has(code)) {
      ajouter({ type: "info", texte: `${code} manque aussi à ce plan : sa création est déjà proposée par un autre plan du lot.` });
      continue;
    }
    const apres: Record<string, unknown> = { type: m.type, suffixe: suffixeDeCode(m.code), description: (m.description ?? "").trim(), critique: false };
    const avertAsset: Avertissement[] = [{ type: "info", texte: `Manque au plan « ${plan.titre} » : ${(m.raison ?? "").trim() || "raison non dite"}` }];
    if (code !== m.code) avertAsset.push({ type: "info", texte: `Code proposé « ${m.code} », construit selon la convention du registre : ${code}.` });
    const parent = m.parent?.trim();
    if (parent) {
      const parentNouveau = codesDeclares.get(parent);
      if (typeDe.has(parent)) apres.deriveDeCode = parent;
      else if (parentNouveau && parentNouveau !== code && !typeDe.has(parentNouveau)) apres.deriveDeCle = cleNouvelAsset(parentNouveau);
      else if (parentNouveau && typeDe.has(parentNouveau)) apres.deriveDeCode = parentNouveau;
      else if (options.codesDejaProposes?.has(parent)) apres.deriveDeCle = cleNouvelAsset(parent);
      else avertAsset.push({ type: "alerte_controle", texte: `Parent « ${parent} » introuvable (ni au registre, ni créé par cette proposition) : l'asset est créé sans parent.` });
    }
    creations.push({
      groupe: options.groupe ?? "assets",
      cle: cleNouvelAsset(code),
      cibleType: "asset",
      cibleRef: null,
      libelle: `${code} · nouvel asset (manque au plan « ${plan.titre} »)`,
      operation: "creer",
      sousGroupe: options.sousGroupe ?? null,
      apres,
      avertissements: avertAsset,
    });
  }
  if (creations.length) {
    const n = creations.length;
    ajouter({
      type: "info",
      texte:
        n > 1
          ? `${n} assets manquants proposés à la création : ils restent décrits en prose dans ce prompt ; leurs prompts d'image s'écriront ensuite.`
          : "1 asset manquant proposé à la création : il reste décrit en prose dans ce prompt ; son prompt d'image s'écrira ensuite.",
    });
  }
  // Un dérivé dont le parent est créé ici vient après lui (l'application ordonne aussi par dépendance).
  creations.sort((a, b) => Number(!!(a.apres as Record<string, unknown>).deriveDeCle) - Number(!!(b.apres as Record<string, unknown>).deriveDeCle));

  const fiche: ApresFiche = { sections: { ...assemble.sections }, refs, dureeGenerationSecondes: sortie.dureeSecondes };
  return [
    {
      groupe: options.groupe ?? "fiches",
      cibleType: "fiche",
      cibleRef: plan.uuid,
      libelle: `Fiche de plan · ${plan.titre}`,
      operation: "modifier",
      sousGroupe: options.sousGroupe ?? null,
      apres: fiche,
      avertissements,
    },
    ...creations,
  ];
}

// --- prompt-affiche (affiche de présentation d'un projet, d'une saison ou d'un épisode) ---------------

export type SortiePromptAffiche = {
  methode: "generation" | "edition";
  sources?: string[];
  promptGeneration: string;
  remarques: string[];
};

/** Le prompt d'une affiche : une modification de l'asset d'affiche. La ligne de titre suit le réglage ACTUEL de l'affiche (la
 * case « écrire le titre dans l'image » a pu changer depuis la demande). La méthode « édition » (image du personnage principal
 * en source 1) n'est retenue que si cette image existait au moment de la demande. */
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
  const avertissements: Avertissement[] = (sortie.remarques ?? []).map((texte) => ({ type: "info" as const, texte }));
  if (methode === "edition") avertissements.unshift({ type: "info", texte: "L'image du personnage principal est la première source : la fenêtre de génération s'ouvre en mode « images »." });
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
