import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, demandes, episodes, plans, scenes } from "../../db/schema";
import { etatDemandesFiches } from "../tasks/requests-db";
import { libelleEtatSousTache, libelleTache } from "./agents-display";
import { lireConversation, lireProposition } from "./queries-agents";
import { ETAPES_CREATION, dernieresDemandesParPlan, libelleSuiviFiche, normaliserEtapes, progression, statutEffectif, type EtapeCreation, type EtatDemandeFiche, type StatutCreation } from "./creation";
import { lireCreation } from "./creation-db";
import type { VueSousTache } from "./types";

/** The state of a project's creation, as the installer's page reads it (and the API poll). For each step
 * that has worked: the detail of what is happening as it goes (a batch = its subtasks one by one, with their state; a single call
 * = its state and its token counter): these are the same tasks as the header's queue. */
type SousTacheVue = { libelle: string; statut: VueSousTache["statut"]; detail: string };
export type VueCreation = {
  statut: StatutCreation;
  erreur: string | null;
  faites: number;
  total: number;
  /** The project's plans that do not have a sheet yet (draft status): what "Écrire les fiches" would write (requests per clip, outside the
   * creation). Decided by the clips themselves, not by the creation (an old creation may have written everything, or nothing). */
  plansSansFiche: number;
  etapes: {
    cle: string;
    libelle: string;
    detail: string;
    statut: EtapeCreation["statut"];
    resultat: string | null;
    erreur: string | null;
    /** What the current call is doing (step without subtasks): "En cours · 312 jetons", "En file · n°2"… */
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
    // An old creation does not have the steps added since (e.g. "traitement"): they are not shown to it; those removed since (the sheets
    // of the old phase 2) are ignored by `normaliserEtapes`.
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

/** How many clips wait for their sheet AFTER a finished creation (0 without a creation, or while it runs): the Brief page makes it a link to
 * the intents screen. Light: two queries. */
export async function plansSansFicheApresCreation(projectId: number): Promise<number> {
  const c = await lireCreation(projectId);
  if (!c || statutEffectif(normaliserEtapes(c.etapes), c.statut as StatutCreation) !== "termine") return 0;
  const [n] = await db.select({ n: count() }).from(plans).where(and(eq(plans.projectId, projectId), eq(plans.statut, "brouillon")));
  return Number(n?.n ?? 0);
}

/** A clip as the preparation's end screen shows it: its intent (the description), to review before writing its sheet. */
export type PlanIntent = { uuid: string; position: number; titre: string; scene: string | null; description: string; aUneFiche: boolean; atelierHref: string };

/** The film's clips in screenplay order (scene, then `ordre`: the displayed position follows from it, never an identifier). */
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

/** A clip's tracking after "Écrire les fiches": its last sheet request, and the sentence that states it (`libelleSuiviFiche`). */
export type SuiviFichePlan = EtatDemandeFiche & { libelle: string };

/** The latest sheet requests of the project's clips, read by `etatDemandesFiches` (one per clip: the most recent). Re-read by the intents screen
 * (app/api/creation/[projectId]/fiches): it survives a page reload, without keeping the ids on the client side. */
export async function lireSuiviFiches(projectId: number): Promise<SuiviFichePlan[]> {
  const lignes = await db.select({ id: demandes.id, planId: demandes.cibleId }).from(demandes).where(and(eq(demandes.projectId, projectId), eq(demandes.type, "fiche-plan")));
  const ids = dernieresDemandesParPlan(lignes).map((d) => d.id);
  return (await etatDemandesFiches(ids)).map((e) => ({ ...e, libelle: libelleSuiviFiche(e) }));
}
