import { avecTitreDansImage, titreDansPrompt } from "../affiches";
import { PREFIXE_PAR_TYPE, TYPES_ASSET, construireCode, slugifyCode } from "../assetCode";
import type { ChangementBrut } from "./changements";
import { cleNouvelAsset, type ApresFiche, type RefFiche } from "./fiches";
import { corrigerCodesInconnus } from "./codes-proches";
import { assemblerPlanH3, retirerImagesPourRaccord, type RetraitPourRaccord } from "./plan-h3-assemblage";
import { parolesDuPrompt, voixDuPrompt } from "./voix-du-prompt";
import { controlerSortiePlanH3, MAX_IMAGES_AVEC_RACCORD, type ProblemeH3, type SortiePlanH3 } from "./plan-h3-controles";
import { genreOuNull } from "../scene-genres";
import { estLiaison } from "../plan-liaison";
import { ajusterDureesScene, repartirDureesScenes } from "./traitement";
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
  /** Une méthode d'image n'a pas de sens pour un son. */
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
    /** Genre de la scène (lib/scene-genres.ts) et cadre visuel tenu sur toute la scène. */
    genre?: string;
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
    genre?: string;
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
        ...(genreOuNull(sc.genre) ? { genre: sc.genre } : {}),
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

// --- plan-h3 (étape 3 : la fiche d'un plan) ----------------------------------------

export type PlanPourFicheH3 = {
  uuid: string;
  titre: string;
  /** Codes des personnages qui ont une voix fixée (`assets.voix_master`) : celui qui parle dans le prompt (`<d>`) a alors son `<Audio N>`. */
  codesAvecMaster: string[];
  /** Le registre du projet (code, type), tel qu'il est maintenant. */
  registre: { code: string; type: string }[];
  /** La clause de style du projet : le code la pose en tête de l'ouverture (plan-h3-assemblage). */
  clauseStyle?: string;
  /** Codes des personnages dont le brief dit que la voix est une voix off (pensées) : leurs paroles sont écrites à la forme H3
   * (« says in an off-screen voiceover », bouche close). */
  codesVoixOff?: string[];
  /** Le plan enchaîne sur le précédent (liaison « suite », un plan avant lui) : l'application joint la dernière image de celui-ci comme `<Picture N>`.
   * Un emplacement d'image reste donc libre (5 au plus ; lib/plan-raccord.ts, FRICTIONS 2026-10-19). */
  reserveRaccord?: boolean;
};

/** Les codes des personnages dont le brief dit que la voix est une voix off (pensées, monologue intérieur) : leur `voix` le dit en clair. */
export function codesEnVoixOff(personnages: { nom?: string; voix?: string }[], codes: string[]): Set<string> {
  const voixOff = /voix\s*off|pens[ée]e|monologue|int[ée]rieur|inner|voice-?over/i;
  const noms = personnages.filter((p) => typeof p.nom === "string" && voixOff.test(p.voix ?? "")).map((p) => slugifyCode(p.nom!));
  return new Set(codes.filter((c) => noms.includes(slugifyCode(c.includes("_") ? c.slice(c.indexOf("_") + 1) : c))));
}

/** Met en voix off les balises `<d>` d'un shot : la phrase de parole devient « <locuteur> (Sx) says in an off-screen voiceover: <d>…</d> while the
 * character's lips remain completely closed » (forme exigée par H3 : sans elle le personnage à l'écran bouge les lèvres). Une balise déjà en
 * voix off est laissée telle quelle. Pur, testé. */
export function mettreEnVoixOff(texte: string, locuteur: { code: string | null; numero: string }): { texte: string; change: boolean } {
  const qui = locuteur.code ? `[[${locuteur.code}]]` : "The character";
  const SUITE = /^\s*while\b[^.<]{0,60}lips[^.<]*\.?/i; // « while her lips remain completely closed. »
  let change = false;
  let sortie = "";
  let reste = texte;
  for (;;) {
    const m = /<d>[\s\S]*?<\/d>/i.exec(reste);
    if (!m) break;
    const avant = reste.slice(0, m.index);
    reste = reste.slice(m.index + m[0].length);
    if (/off-screen voice-?over[^<]*$/i.test(avant)) {
      sortie += avant + m[0];
    } else {
      // La phrase de parole (« …, and murmurs to herself: ») est remplacée : la phrase d'avant est close, puis la forme H3.
      const verbe = /,?\s*(?:and\s+)?\b(?:murmurs?|whispers?|says?|speaks?|mutters?|thinks?|declares?|states?|asks?|replies)\b[^.<:]*[:,]?\s*$/i.exec(avant);
      let tete = (verbe ? avant.slice(0, verbe.index) : avant).trimEnd();
      if (tete && !/[.!?]$/.test(tete)) tete += ".";
      sortie += `${tete}${tete ? " " : ""}${qui} (${locuteur.numero}) says in an off-screen voiceover: ${m[0]}`;
      change = true;
    }
    const suite = SUITE.exec(reste);
    if (suite) {
      sortie += suite[0];
      reste = reste.slice(suite[0].length);
    } else {
      sortie += " while the character's lips remain completely closed.";
      reste = reste.replace(/^\s*[.!?]/, "");
      change = true;
    }
  }
  return { texte: sortie + reste, change };
}

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

const RAISON_RETRAIT: Record<RetraitPourRaccord["raison"], string> = {
  "non-citee": "citée nulle part",
  "hors-shots": "citée seulement hors des shots",
  faible: "matière faible, décrite en prose",
};
const echapperRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Types d'assets qu'une proposition peut créer. Un « keyframe » (pose composite : plusieurs éléments mêlés dans une même
 * image) en fait partie depuis le 2026-10-06 ; la voix n'est plus un asset (champ du personnage). */
export const TYPES_MANQUANTS = new Set<string>(TYPES_ASSET);

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
 *   « régénérer = tout régénérer ») et sa durée de génération. la voix d'un personnage qui parle (lue dans le prompt) devient une référence audio vers son master ;
 * - un changement « créer un asset » par asset manquant (avec son parent : `deriveDeCode` s'il existe,
 *   `deriveDeCle` s'il est créé par la même proposition). Un asset déclaré manquant qui existe déjà est
 *   ignoré (avertissement) ; la fiche CITE un asset d'image manquant comme n'importe quelle référence (`dependDeCles` : elle s'applique après
 *   sa création, son image viendra ensuite) ; un son manquant ou un asset déjà proposé par un autre plan du lot reste décrit en prose.
 * Une référence qui n'est pas au registre, ou de la mauvaise nature, est retirée et décrite en prose par son
 * nom (alerte). Les problèmes des contrôles remontent en avertissements ; un marqueur `[[CODE]]` que le code
 * ne sait pas résoudre bloque la fiche (à relancer). L'état du plan (vide, rempli, rendu) est lu par
 * l'applicateur `fiche` (écrasement). Pur, testé. */
export function depuisFichePlan(sortieBrute: SortiePlanH3, plan: PlanPourFicheH3, options: OptionsFichePlan = {}): ChangementBrut[] {
  // Un code mal recopié (mots de liaison) se corrige sans ambiguïté ; sinon il reste une erreur franche (voir codes-proches.ts).
  const { sortie: sortieCorrigee, corrections } = corrigerCodesInconnus(sortieBrute, plan.registre.map((a) => a.code));
  // Le prompt vidéo est la SEULE source des répliques (décision 2026-10-14) : rien n'est lié, rien n'est inséré. Un personnage qui parle
  // et dont le brief dit « voix off » : le code écrit la forme H3 (« says in an off-screen voiceover », bouche close).
  const codesVoixOff = new Set(plan.codesVoixOff ?? []);
  let shotsFinaux = (sortieCorrigee.shots ?? []).map((s) => ({ debutSecondes: s.debutSecondes, texte: s.texte ?? "" }));
  let voixOffEcrite = false;
  if (codesVoixOff.size) {
    shotsFinaux = shotsFinaux.map((s) => {
      const paroles = parolesDuPrompt([s]).filter((p) => p.code);
      if (paroles.length === 0 || !paroles.every((p) => p.code && codesVoixOff.has(p.code))) return s;
      const p = paroles[0]!;
      const r = mettreEnVoixOff(s.texte, { code: p.code, numero: p.numero ?? "S1" });
      voixOffEcrite ||= r.change;
      return { ...s, texte: r.texte };
    });
  }
  const sortie: SortiePlanH3 = { ...sortieCorrigee, shots: shotsFinaux };
  const typeDe = new Map(plan.registre.map((a) => [a.code, a.type]));
  // Un asset d'IMAGE qui manque et qu'on crée avec ce plan (son code est celui du modèle, déjà conforme) se cite comme une référence : la
  // fiche le référence, son image viendra après (le contrôle de la page dit « pas encore d'image »). Un son manquant, un code reconstruit ou
  // un asset déjà proposé par un autre plan du lot restent décrits en prose.
  const aCreer = new Map<string, string>();
  for (const m of sortie.assetsManquants ?? []) {
    const suffixe = TYPES_MANQUANTS.has(m.type) ? suffixeDeCode(m.code) : "";
    if (!suffixe || m.type === "sfx" || construireCode(m.type, suffixe) !== m.code) continue;
    if (typeDe.has(m.code) || options.codesDejaProposes?.has(m.code)) continue;
    aCreer.set(m.code, m.type);
  }
  const avertissements: Avertissement[] = [];
  const ajouter = (a: Avertissement | null) => {
    if (a && !avertissements.some((x) => x.type === a.type && x.texte === a.texte)) avertissements.push(a);
  };

  for (const c of corrections) ajouter({ type: "info", texte: `Code « ${c.de} » corrigé en « ${c.vers} » : même asset, mal recopié par le modèle.` });
  // (la mise en voix off est annoncée plus bas, une fois `voixOffEcrite` connue)

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
    const type = typeDe.get(r.asset) ?? aCreer.get(r.asset);
    let raison: string | null = null;
    if (type == null) raison = `${r.asset} n'est pas au registre`;
    else if (r.nature === "son" && type !== "sfx") raison = `${r.asset} (${type}) n'est pas un bruitage`;
    else if (r.nature === "image" && type === "sfx") raison = `${r.asset} est un bruitage, sans image`;
    if (raison) {
      ajouter({ type: "alerte_controle", texte: `${raison} : la référence est retirée et décrite en prose (« ${r.nom} »).` });
      enProse(r.asset, r.nom);
    } else if (type === "vfx" && r.nature === "image" && (r.retention == null || r.retention === "fully_preserved")) {
      // Un effet est un matériau, pas un sujet : « conservé tel quel », H3 le montre comme un plan à part (guide H3,
      // retention_analysis). Le code pose le niveau léger ; le modèle peut choisir attribute_transfer.
      gardees.push({
        ...r,
        retention: "weak_reference",
        retentionNote: r.retentionNote?.trim() || `only the colour, texture and motion of ${r.nom} are kept; it never appears as a standalone image, it plays on the subjects of the shots`,
      });
    } else gardees.push(r);
  }
  // Raccord : un plan « suite » garde un emplacement d'image libre. Les images déclarées mais non citées dans un shot partent d'abord (retirées du
  // prompt sans trace : le modèle les avait déclarées pour rien) ; l'assemblage renumérote tout depuis la liste restante.
  let referencesFinales = gardees;
  if (plan.reserveRaccord) {
    const r = retirerImagesPourRaccord(gardees, { shots: textes.shots.map((s) => s.texte), autres: [textes.summary, textes.ouverture, textes.overall_soundscape, textes.non_diegetic_music] }, typeDe);
    for (const x of r.retirees) {
      enProse(x.asset, x.nom);
      ajouter({ type: "info", texte: `Raccord : ${x.asset} retiré des références (${RAISON_RETRAIT[x.raison]}) pour garder un emplacement à l'image du plan précédent.` });
    }
    if (r.restantes > MAX_IMAGES_AVEC_RACCORD) {
      ajouter({ type: "alerte_controle", texte: `Raccord impossible : ${r.restantes} images de référence citées dans les shots, pour ${MAX_IMAGES_AVEC_RACCORD} emplacements possibles (le sixième est pris par la dernière image du plan précédent). À la génération, ce plan partira SANS raccord : retire une référence (la décrire en prose) avant de lancer.` });
    }
    referencesFinales = r.references;
  }
  const nettoyee: SortiePlanH3 = { ...sortie, ...textes, references: referencesFinales };

  // 2. assemblage (labels, timecodes, sections) avec les slots des voix
  // Les voix se lisent dans le prompt : un `<Audio N>` par personnage qui parle et a une voix fixée, posé AVANT les bruitages.
  const voix = voixDuPrompt(sortie.shots ?? [], new Set(plan.codesAvecMaster));
  const assemble = assemblerPlanH3(nettoyee, { slotsAudioPris: voix.map((v) => v.slot), voix, clauseStyle: plan.clauseStyle });
  const refs: RefFiche[] = [
    ...assemble.refs
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
      }),
    // La voix d'un personnage : une référence audio dont l'asset est le PERSONNAGE (le worker lit son master).
    ...voix.map((v) => ({ type: "audio" as const, slot: v.slot, asset: v.locuteurCode, role: "Voix du personnage", retention: "reference" })),
  ];

  // 3. contrôles (sur la sortie du modèle) et problèmes de l'assemblage
  const problemes = [
    ...controlerSortiePlanH3(sortie, {
      registre: plan.registre,
      slotsAudioPris: voix.map((v) => v.slot),
      corpusExemples: options.corpusExemples,
    }),
    ...assemble.problemes,
  ];
  for (const p of problemes) ajouter(versAvertissement(p));
  if (voixOffEcrite) ajouter({ type: "info", texte: "Voix off : le brief dit que ce personnage parle en voix off ; ses répliques sont écrites « says in an off-screen voiceover… lips remain completely closed » par le code (aucun mouvement de lèvres)." });
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
    const apres: Record<string, unknown> = { type: m.type, suffixe: suffixeDeCode(m.code), description: (m.description ?? "").trim() };
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
    const cites = refs.filter((r) => aCreer.has(r.asset)).length;
    ajouter({
      type: "info",
      texte:
        `${n > 1 ? `${n} assets manquants proposés à la création` : "1 asset manquant proposé à la création"} : ` +
        (cites > 0
          ? `${cites > 1 ? "ceux que la fiche cite sont référencés" : "celui que la fiche cite est référencé"} dès maintenant (ils n'ont pas encore d'image : à générer avant le rendu) ; `
          : "décrits en prose dans ce prompt ; ") +
        `${n > 1 ? "leurs prompts d'image s'écriront" : "son prompt d'image s'écrira"} ensuite.`,
    });
  }
  // Un dérivé dont le parent est créé ici vient après lui (l'application ordonne aussi par dépendance).
  creations.sort((a, b) => Number(!!(a.apres as Record<string, unknown>).deriveDeCle) - Number(!!(b.apres as Record<string, unknown>).deriveDeCle));

  const fiche: ApresFiche = { sections: { ...assemble.sections }, refs, dureeGenerationSecondes: sortie.dureeSecondes, voixDuPrompt: true };
  const citesACreer = [...new Set(refs.map((r) => r.asset).filter((c) => aCreer.has(c)))];
  if (citesACreer.length) fiche.dependDeCles = citesACreer.map(cleNouvelAsset);
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
