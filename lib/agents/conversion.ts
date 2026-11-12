import { avecTitreDansImage, titreDansPrompt } from "../posters/affiches";
import { PREFIXE_PAR_TYPE, TYPES_ASSET, slugifyCode } from "../assetCode";
import type { ChangementBrut } from "./changements";
import { estLiaison } from "../plan-liaison";
import { ajusterDureesScene, repartirDureesScenes } from "./traitement";
import type { Avertissement, PlaceScene, Position } from "./types";

/** Des sorties validées des skills aux changements d'une proposition — EN CODE, sans second
 * appel au modèle. Pur, testé. L'enrichissement (état courant, écrasement, portée) vient
 * ensuite, des applicateurs. */

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

/** Un asset à modifier : son prompt (et, si l'agent la recommande autrement, sa méthode).
 * La description canonique n'est jamais réécrite par ce skill. */
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
      },
      avertissements: avertissementsRemarques(sortie.remarques ?? []),
    },
  ];
}

/** `{ liaison }` à écrire avec un plan du scénario, ou rien si la sortie n'en donne pas (ou une valeur inconnue). */
const liaisonDe = (p: { liaison?: string }): { liaison?: string } => (estLiaison(p.liaison) ? { liaison: p.liaison } : {});

// --- scenario-episode -------------------------------------------------------

export type SortieScenarioEpisode = {
  episode: { titre: string; resume: string };
  scenes: {
    titre: string;
    fonction: string;
    /** Cadre visuel tenu sur toute la scène. (Le genre de scène est retiré le 2026-11-09 : une ancienne sortie qui en
     * porte encore un est lue, son genre ignoré.) */
    ambiance?: string;
    plans: {
      titre: string;
      description: string;
      /** Liaison avec le plan précédent (lib/plan-liaison.ts) : absente d'un scénario d'avant, alors la liaison du plan ne change pas. */
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

/** Épisode entier (« compléter / préparer l'épisode ») : l'épisode, ses scènes, ses plans et leurs
 * descriptions (le dialogue s'y écrit). Ce qui existe déjà (même titre) est MODIFIÉ, le reste est créé : jamais deux fois. Les
 * plans neufs sont ajoutés en fin d'épisode, dans l'ordre de la sortie. Rien n'est supprimé (un nouveau scénario qui change les titres AJOUTE ses plans à ceux
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

// --- traitement-episode et scenario-scene (étape E : le scénario d'un long film, scène par scène) ---------------------

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

/** Le traitement d'un épisode devient des SCÈNES (créations, avec leur traitement) : les durées en secondes sont calculées ICI depuis les poids, pour que
 * leur somme tombe exactement sur la durée visée. Une scène dont le titre existe déjà est laissée ; deux scènes de même titre sont distinguées (le scénario
 * de chaque scène retrouve la sienne par son titre). Pur, testé. */
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

/** Les plans d'UNE scène (créée par le traitement) : mêmes changements qu'un scénario d'épisode restreint à cette scène, dont les durées sont ramenées à la
 * durée visée de la scène (`ajusterDureesScene`). Les plans se comparent aux seuls plans de la scène : un titre repris ailleurs dans le film ne fait pas
 * « modifier » un plan d'une autre scène. Pur, testé. */
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
        ...liaisonDe(p),
        episodeId: cible.episodeId,
        ...(cible.sceneId != null ? { sceneId: cible.sceneId } : {}),
      },
      avertissements: info,
    },
  ];
}

/** Une seule SCÈNE à insérer (« Nouvelle scène » entre deux scènes) : la première scène de la sortie, avec ses plans. La scène porte sa place
 * (`apresSceneId` ou `debut`) ; ses plans la rejoignent par leur clé et se rangent dans son bloc (l'ordre de l'épisode est regroupé par scène). Une
 * scène neuve n'a pas de traitement : elle s'écrit ici d'un seul tenant, avec ses plans. Pur, testé. */
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
          // Le premier plan d'une scène neuve est une coupe : aucun état de fin à reprendre.
          ...liaisonDe(j === 0 ? { ...p, liaison: "coupe" } : p),
          episodeId: cible.episodeId,
          sceneCle: "scene-inseree",
        },
      }),
    ),
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
      apres: { description: p.description, dureeGenerationSecondes: p.dureeSecondes, ...liaisonDe(p) },
      avertissements: [
        ...(sortie.inventions ?? []).map((t) => ({ type: "invention" as const, texte: t })),
      ],
    },
  ];
}

/** Les codes des personnages dont le brief dit que la voix est une voix off (pensées, monologue intérieur) : leur `voix` le dit en clair. */
export function codesEnVoixOff(personnages: { nom?: string; voix?: string }[], codes: string[]): Set<string> {
  const voixOff = /voix\s*off|pens[ée]e|monologue|int[ée]rieur|inner|voice-?over/i;
  const noms = personnages.filter((p) => typeof p.nom === "string" && voixOff.test(p.voix ?? "")).map((p) => slugifyCode(p.nom!));
  return new Set(codes.filter((c) => noms.includes(slugifyCode(c.includes("_") ? c.slice(c.indexOf("_") + 1) : c))));
}

/** Types d'assets qu'une proposition peut créer. Un « keyframe » (pose composite : plusieurs éléments mêlés dans une même
 * image) en fait partie depuis le 2026-10-06 ; la voix n'est plus un asset (champ du personnage). */
export const TYPES_MANQUANTS = new Set<string>(TYPES_ASSET);

/** « PROP_lettre » (type prop) → suffixe « lettre » : le préfixe que le modèle a écrit est retiré, le code
 * final est reconstruit depuis le type (convention du registre). */
export function suffixeDeCode(code: string): string {
  const prefixes = Object.values(PREFIXE_PAR_TYPE).sort((a, b) => b.length - a.length);
  const p = prefixes.find((x) => code.toUpperCase().startsWith(x)) ?? /^[A-Z]{2,6}_/.exec(code)?.[0]; // préfixe connu, ou en capitales (ACC_…)
  return slugifyCode(p ? code.slice(p.length) : code);
}


// --- prompt-asset, variante affiche (affiche de présentation d'un projet ou d'un épisode) ---------------

/** Même sortie que `SortiePromptAsset` (`remarques` en `{type, message}`) ; une remarque en simple chaîne (ancien format) reste lue. */
export type SortiePromptAffiche = {
  methode: "generation" | "edition";
  sources?: string[];
  promptGeneration: string;
  remarques: (string | { type: string; message: string })[];
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
