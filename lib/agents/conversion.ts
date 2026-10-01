import type { ChangementBrut } from "./changements";
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

function avertissementsRemarques(remarques: { type: string; message: string }[]): Avertissement[] {
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

// --- scenario-episode -------------------------------------------------------

export type SortieScenarioEpisode = {
  episode: { titre: string; resume: string };
  scenes: {
    titre: string;
    fonction: string;
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

export type OptionsScenario = {
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
        apres: { titre: sc.titre, fonction: sc.fonction, episodeId: ep.id },
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
    changements[0]!.avertissements = [
      ...(changements[0]!.avertissements ?? []),
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
