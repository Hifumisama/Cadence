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

/** Épisode entier (« compléter / préparer l'épisode ») : l'épisode, ses scènes et ses plans.
 * Ce qui existe déjà (même titre) est MODIFIÉ, le reste est créé : jamais deux fois. Les plans
 * neufs sont ajoutés en fin d'épisode, dans l'ordre de la sortie. */
export function depuisScenarioEpisode(sortie: SortieScenarioEpisode, ep: EpisodeCourant): ChangementBrut[] {
  const changements: ChangementBrut[] = [];
  const inventions: Avertissement[] = (sortie.inventions ?? []).map((t) => ({ type: "invention", texte: t }));

  if (norme(sortie.episode.titre) !== norme(ep.titre) || sortie.episode.resume.trim() !== ep.resume.trim()) {
    changements.push({
      groupe: "episodes",
      cibleType: "episode",
      cibleRef: String(ep.id),
      libelle: `Épisode · ${sortie.episode.titre}`,
      operation: "modifier",
      apres: { titre: sortie.episode.titre, resume: sortie.episode.resume },
    });
  }

  for (const [i, sc] of sortie.scenes.entries()) {
    const existante = ep.scenes.find((s) => norme(s.titre) === norme(sc.titre));
    const cleScene = existante ? null : `scene-${i + 1}`;
    if (!existante) {
      changements.push({
        groupe: "scenes",
        cle: cleScene,
        cibleType: "scene",
        cibleRef: null,
        libelle: `Scène · ${sc.titre}`,
        operation: "creer",
        apres: { titre: sc.titre, fonction: sc.fonction, episodeId: ep.id },
      });
    }
    for (const [j, p] of sc.plans.entries()) {
      const dejaLa = ep.plans.find((x) => norme(x.titre) === norme(p.titre));
      const info: Avertissement[] =
        p.repliques?.length > 0
          ? [{ type: "non_pris_en_charge", texte: `${p.repliques.length} réplique${p.repliques.length > 1 ? "s" : ""} proposée${p.repliques.length > 1 ? "s" : ""}, non reprise${p.repliques.length > 1 ? "s" : ""} : les répliques ne s'écrivent pas encore par une proposition.` }]
          : [];
      if (dejaLa) {
        changements.push({
          groupe: "plans",
          cibleType: "plan",
          cibleRef: dejaLa.uuid,
          libelle: `Plan · ${p.titre}`,
          operation: "modifier",
          apres: { description: p.description, dureeGenerationSecondes: p.dureeSecondes },
          avertissements: info,
        });
      } else {
        changements.push({
          groupe: "plans",
          cle: `plan-${i + 1}-${j + 1}`,
          cibleType: "plan",
          cibleRef: null,
          libelle: `Plan · ${p.titre}`,
          operation: "creer",
          position: { fin: true },
          apres: {
            titre: p.titre,
            description: p.description,
            dureeGenerationSecondes: p.dureeSecondes,
            episodeId: ep.id,
            ...(existante ? { sceneId: existante.id } : { sceneCle: cleScene }),
          },
          avertissements: info,
        });
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
 * plan de la première scène de la sortie. La scène est celle du plan de repère. */
export function depuisPlanAInserer(
  sortie: SortieScenarioEpisode,
  cible: { episodeId: number; position: Position; sceneId: number | null },
): ChangementBrut[] {
  const p = sortie.scenes[0]?.plans[0];
  if (!p) return [];
  const info: Avertissement[] = [
    ...(p.repliques?.length
      ? [{ type: "non_pris_en_charge" as const, texte: `${p.repliques.length} réplique(s) proposée(s), non reprise(s) : pas encore prises en charge.` }]
      : []),
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
      avertissements: (sortie.inventions ?? []).map((t) => ({ type: "invention" as const, texte: t })),
    },
  ];
}
