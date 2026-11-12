import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, demandes, episodes, plans, scenes } from "../../db/schema";
import { etatDemandesFiches } from "../demandes-db";
import { libelleEtatSousTache, libelleTache } from "../agents-affichage";
import { lireConversation, lireProposition } from "../queries-agents";
import { ETAPES_CREATION, dernieresDemandesParPlan, libelleSuiviFiche, normaliserEtapes, progression, statutEffectif, type EtapeCreation, type EtatDemandeFiche, type StatutCreation } from "./creation";
import { lireCreation } from "./creation-db";
import type { VueSousTache } from "./types";

/** L'état de la création d'un projet, tel que la page de l'installateur le lit (et le sondage de l'API). Pour chaque étape
 * qui a travaillé : le détail de ce qui se fait au fil de l'eau (un lot = ses sous-tâches une à une, avec leur état ; un appel
 * seul = son état et son compteur de jetons) : ce sont les mêmes tâches que celles de la file du header. */
type SousTacheVue = { libelle: string; statut: VueSousTache["statut"]; detail: string };
export type VueCreation = {
  statut: StatutCreation;
  erreur: string | null;
  faites: number;
  total: number;
  /** Les plans du projet qui n'ont pas encore de fiche (statut brouillon) : ce que « Écrire les fiches » écrirait (des demandes par plan, hors
   * création). Décidé par les plans eux-mêmes, pas par la création (une création ancienne a pu tout écrire, ou rien). */
  plansSansFiche: number;
  etapes: {
    cle: string;
    libelle: string;
    detail: string;
    statut: EtapeCreation["statut"];
    resultat: string | null;
    erreur: string | null;
    /** Ce que fait l'appel en cours (étape sans sous-tâches) : « En cours · 312 jetons », « En file · n°2 »… */
    activite: string | null;
    sousTaches: SousTacheVue[];
  }[];
  misAJour: string;
};

export async function lireVueCreation(projectId: number): Promise<VueCreation | null> {
  const c = await lireCreation(projectId);
  if (!c) return null;
  const etapes = normaliserEtapes(c.etapes);
  const p = progression(etapes);
  const [conv] = await db.select({ uuid: agentConversations.uuid }).from(agentConversations).where(eq(agentConversations.projectId, projectId));

  const detailees = await Promise.all(
    // Une création ancienne n'a pas les étapes ajoutées depuis (ex. « traitement ») : on ne les lui montre pas ; celles retirées depuis (les fiches
    // de l'ancienne phase 2) sont ignorées par `normaliserEtapes`.
    ETAPES_CREATION.filter((def) => etapes.length === 0 || etapes.some((x) => x.cle === def.cle)).map(async (def) => {
      const e = etapes.find((x) => x.cle === def.cle);
      let activite: string | null = null;
      let sousTaches: SousTacheVue[] = [];
      if (e && (e.statut === "en_cours" || e.statut === "fait") && e.propositionUuid) {
        const prop = await lireProposition(e.propositionUuid);
        if (prop?.lot) {
          sousTaches = prop.lot.sousTaches.map((s) => ({ libelle: s.libelle, statut: s.statut, detail: libelleEtatSousTache(s) }));
        } else if (e.statut === "en_cours") {
          activite = libelleTache(prop?.tache ?? null);
        }
      } else if (e?.statut === "en_cours" && def.cle === "brief" && conv) {
        activite = libelleTache((await lireConversation(conv.uuid))?.tache ?? null);
      }
      return {
        cle: def.cle,
        libelle: def.libelle,
        detail: def.detail,
        statut: e?.statut ?? ("a_venir" as const),
        resultat: e?.detail ?? null,
        erreur: e?.erreur ?? null,
        activite,
        sousTaches,
      };
    }),
  );

  const [sansFiche] = await db.select({ n: count() }).from(plans).where(and(eq(plans.projectId, projectId), eq(plans.statut, "brouillon")));
  return {
    statut: statutEffectif(etapes, c.statut as StatutCreation),
    erreur: statutEffectif(etapes, c.statut as StatutCreation) === "termine" ? null : c.erreur,
    faites: p.faites,
    total: p.total,
    plansSansFiche: Number(sansFiche?.n ?? 0),
    etapes: detailees,
    misAJour: c.updatedAt.toISOString(),
  };
}

/** Combien de plans attendent leur fiche APRÈS une création finie (0 sans création, ou tant qu'elle tourne) : la page Brief en fait un lien vers
 * l'écran des intents. Léger : deux requêtes. */
export async function plansSansFicheApresCreation(projectId: number): Promise<number> {
  const c = await lireCreation(projectId);
  if (!c || statutEffectif(normaliserEtapes(c.etapes), c.statut as StatutCreation) !== "termine") return 0;
  const [n] = await db.select({ n: count() }).from(plans).where(and(eq(plans.projectId, projectId), eq(plans.statut, "brouillon")));
  return Number(n?.n ?? 0);
}

/** Un plan tel que l'écran de fin de la préparation le montre : son intent (la description), à relire avant d'écrire sa fiche. */
export type PlanIntent = { uuid: string; position: number; titre: string; scene: string | null; description: string; aUneFiche: boolean; atelierHref: string };

/** Les plans du film dans l'ordre du scénario (scène, puis `ordre` : la position affichée en découle, jamais un identifiant). */
export async function lirePlansIntents(projectId: number): Promise<PlanIntent[]> {
  const lignes = await db
    .select({ uuid: plans.uuid, titre: plans.titre, description: plans.description, statut: plans.statut, episodeId: plans.episodeId, scene: scenes.titre })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .leftJoin(scenes, eq(scenes.id, plans.sceneId))
    .where(eq(plans.projectId, projectId))
    .orderBy(asc(episodes.numero), asc(plans.ordre), asc(plans.id));
  const rangs = new Map<number, number>();
  return lignes.map((l) => {
    const position = (rangs.get(l.episodeId) ?? 0) + 1;
    rangs.set(l.episodeId, position);
    return {
      uuid: l.uuid,
      position,
      titre: l.titre,
      scene: l.scene ?? null,
      description: l.description ?? "",
      aUneFiche: l.statut !== "brouillon",
      atelierHref: `/p/${projectId}/e/${l.episodeId}/montage/${l.uuid}`,
    };
  });
}

/** Le suivi d'un plan après « Écrire les fiches » : sa dernière demande de fiche, et la phrase qui la dit (`libelleSuiviFiche`). */
export type SuiviFichePlan = EtatDemandeFiche & { libelle: string };

/** Les dernières demandes de fiche des plans du projet, lues par `etatDemandesFiches` (une par plan : la plus récente). Relu par l'écran des intents
 * (app/api/creation/[projectId]/fiches) : il survit à un rechargement de la page, sans garder les ids côté client. */
export async function lireSuiviFiches(projectId: number): Promise<SuiviFichePlan[]> {
  const lignes = await db.select({ id: demandes.id, planId: demandes.cibleId }).from(demandes).where(and(eq(demandes.projectId, projectId), eq(demandes.type, "fiche-plan")));
  const ids = dernieresDemandesParPlan(lignes).map((d) => d.id);
  return (await etatDemandesFiches(ids)).map((e) => ({ ...e, libelle: libelleSuiviFiche(e) }));
}
