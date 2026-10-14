import { db } from "../db";
import { assets, episodes, planDialogues, planPromptSections, plans, repliques, seasons } from "../db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { controlerDialogues, type ControleDialogues, type RefLabel } from "./plan-checks";
import { nomLocuteur, type LigneExportReplique } from "./repliques";

/** Requêtes des répliques autonomes (docs/FRICTIONS.md F02, révision
 * 2026-09-30). Une réplique est rattachée à l'épisode ; la fiche de plan n'en
 * est que la table d'assemblage (plan_dialogues). Une réplique n'est qu'un texte
 * (chantier voix/master, 2026-10-14) : sa voix est celle de son locuteur, le
 * master du personnage (`assets.voix_master`) quand il en a un. */

export type LocuteurVue = {
  kind: "personnage" | "texte";
  /** Id de l'asset personnage, null pour un locuteur libre. */
  assetId: number | null;
  label: string;
};

export type UsageRepliqueVue = {
  liaisonId: number;
  planId: number;
  planUuid: string;
  planTitre: string;
  episodeId: number;
  episodeNumero: number;
  /** Position du plan dans son épisode (rang selon `ordre`, jamais un numéro). */
  position: number;
  slot: number;
  debutSecondes: number | null;
  /** Le prompt du plan cite-t-il cette réplique au mot près ? */
  verbatim: "ok" | "absente" | "differente";
};

export type RepliqueVue = {
  id: number;
  uuid: string;
  episodeId: number;
  episodeNumero: number;
  sceneId: number | null;
  ordre: number;
  texte: string;
  dureeSecondes: number | null;
  /** Le locuteur a un master (voix fixée) : il sert de référence audio `<Audio N>` du plan. Sinon le modèle vidéo invente la voix. */
  voixMaster: boolean;
  locuteur: LocuteurVue;
  usages: UsageRepliqueVue[];
};

type ContexteProjet = {
  vues: RepliqueVue[];
  controles: Map<number, ControleDialogues>;
};

async function chargerContexte(projectId: number): Promise<ContexteProjet> {
  const [lignes, lesAssets, lesPlans] = await Promise.all([
    db
      .select({ r: repliques, episodeNumero: episodes.numero })
      .from(repliques)
      .innerJoin(episodes, eq(repliques.episodeId, episodes.id))
      .where(eq(repliques.projectId, projectId)),
    db
      .select({ id: assets.id, code: assets.code, voixMaster: assets.voixMaster })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage"))),
    db
      .select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, episodeId: plans.episodeId, episodeNumero: episodes.numero })
      .from(plans)
      .innerJoin(episodes, eq(plans.episodeId, episodes.id))
      .where(eq(plans.projectId, projectId))
      .orderBy(plans.ordre, plans.id),
  ]);

  const rangParEpisode = new Map<number, number>();
  const planParId = new Map<number, (typeof lesPlans)[number] & { position: number }>();
  for (const p of lesPlans) {
    const rang = (rangParEpisode.get(p.episodeId) ?? 0) + 1;
    rangParEpisode.set(p.episodeId, rang);
    planParId.set(p.id, { ...p, position: rang });
  }

  const codeParId = new Map(lesAssets.map((a) => [a.id, a.code]));
  const personnagesAvecMaster = new Set(lesAssets.filter((a) => a.voixMaster).map((a) => a.id));
  /** Le locuteur a-t-il un master ? Celui de son personnage (chantier voix/master, 2026-10-14). */
  const aUnMaster = (r: { locuteurId: number | null }): boolean => r.locuteurId != null && personnagesAvecMaster.has(r.locuteurId);

  const ids = lignes.map((l) => l.r.id);
  const liaisons = ids.length && planParId.size
    ? await db.select().from(planDialogues).where(inArray(planDialogues.repliqueId, ids))
    : [];
  const planIds = [...new Set(liaisons.map((l) => l.planId))];
  const sections = planIds.length
    ? await db
        .select({ planId: planPromptSections.planId, section: planPromptSections.section, contenu: planPromptSections.contenu })
        .from(planPromptSections)
        .where(inArray(planPromptSections.planId, planIds))
    : [];

  const repliqueParId = new Map(lignes.map((l) => [l.r.id, l.r]));

  // Contrôle verbatim de chaque plan qui cite au moins une réplique.
  const controles = new Map<number, ControleDialogues>();
  for (const planId of planIds) {
    const liees = liaisons
      .filter((l) => l.planId === planId)
      .sort((a, b) => a.slot - b.slot)
      .map((l) => repliqueParId.get(l.repliqueId))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => ({ id: r.id, texte: r.texte }));
    // Un plan sans réplique liée : son dialogue vit dans le prompt (2026-10-14), aucune balise n'est « orpheline ».
    controles.set(
      planId,
      liees.length === 0
        ? controlerDialogues([], [])
        : controlerDialogues(
            sections.filter((s) => s.planId === planId).map((s) => ({ section: s.section, contenu: s.contenu })),
            liees,
          ),
    );
  }

  const vues: RepliqueVue[] = lignes.map(({ r, episodeNumero }) => {
    let locuteur: LocuteurVue;
    if (r.locuteurId != null) {
      locuteur = { kind: "personnage", assetId: r.locuteurId, label: nomLocuteur(codeParId.get(r.locuteurId) ?? "?") };
    } else {
      locuteur = { kind: "texte", assetId: null, label: r.locuteurTexte || "—" };
    }

    const usages = liaisons
      .filter((l) => l.repliqueId === r.id)
      .flatMap((l) => {
        const p = planParId.get(l.planId);
        if (!p) return [];
        return [
          {
            liaisonId: l.id,
            planId: l.planId,
            planUuid: p.uuid,
            planTitre: p.titre,
            episodeId: p.episodeId,
            episodeNumero: p.episodeNumero,
            position: p.position,
            slot: l.slot,
            debutSecondes: l.debutSecondes,
            verbatim: controles.get(l.planId)?.parReplique[r.id] ?? "absente",
          } satisfies UsageRepliqueVue,
        ];
      })
      .sort((a, b) => a.episodeNumero - b.episodeNumero || a.position - b.position || a.slot - b.slot);

    return {
      id: r.id,
      uuid: r.uuid,
      episodeId: r.episodeId,
      episodeNumero,
      sceneId: r.sceneId,
      ordre: r.ordre,
      texte: r.texte,
      dureeSecondes: r.dureeSecondes,
      voixMaster: aUnMaster(r),
      locuteur,
      usages,
    };
  });

  vues.sort((a, b) => a.episodeNumero - b.episodeNumero || a.ordre - b.ordre || a.id - b.id);
  return { vues, controles };
}

/** Toutes les répliques du projet, dans l'ordre épisode puis
 * `ordre`. */
export async function getRepliquesProjet(projectId: number): Promise<RepliqueVue[]> {
  return (await chargerContexte(projectId)).vues;
}

export type LiaisonPlanVue = RepliqueVue & { liaisonId: number; slot: number; debutSecondes: number | null };

/** Tout ce qu'il faut à la fiche de plan pour ses dialogues : les répliques
 * liées (dans l'ordre des slots), celles de l'épisode encore disponibles, le
 * contrôle verbatim, et les refs `<Audio N>` qu'elles déclarent. */
export async function getDialoguesPlan(projectId: number, planId: number, episodeId: number) {
  const { vues, controles } = await chargerContexte(projectId);
  const liaisons: LiaisonPlanVue[] = vues
    .flatMap((v) => {
      const u = v.usages.find((x) => x.planId === planId);
      return u ? [{ ...v, liaisonId: u.liaisonId, slot: u.slot, debutSecondes: u.debutSecondes }] : [];
    })
    .sort((a, b) => a.slot - b.slot);
  const liees = new Set(liaisons.map((l) => l.id));
  const disponibles = vues.filter((v) => v.episodeId === episodeId && !liees.has(v.id));
  const controle: ControleDialogues =
    controles.get(planId) ?? controlerDialogues([], []);
  // L'audio de la réplique EST la ref <Audio N> du plan (pas recopiée dans
  // plan_refs) : seules celles dont le locuteur a un master déclarent un label.
  const audioRefs: RefLabel[] = liaisons.filter((l) => l.voixMaster).map((l) => ({ type: "audio", slot: l.slot }));
  return { liaisons, disponibles, controle, audioRefs };
}

export type OptionsLocuteur = {
  personnages: { id: number; code: string; label: string; aMaster: boolean }[];
};

/** Ce que le sélecteur de locuteur propose : les personnages (la voix off en est un), avec ou sans voix fixée. */
export async function getOptionsLocuteur(projectId: number): Promise<OptionsLocuteur> {
  const lignes = await db
    .select({ id: assets.id, code: assets.code, voixMaster: assets.voixMaster })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage")))
    .orderBy(asc(assets.code));
  return { personnages: lignes.map((a) => ({ id: a.id, code: a.code, label: nomLocuteur(a.code), aMaster: a.voixMaster != null })) };
}

/** Pour le registre d'assets : le nombre de répliques que porte chaque personnage, et leurs ids (les plans où il parle se déduisent des
 * répliques liées — jamais un lien stocké sur le plan). */
export async function getRepliquesParPersonnage(projectId: number) {
  const lignes = await db
    .select({ id: repliques.id, locuteurId: repliques.locuteurId })
    .from(repliques)
    .where(eq(repliques.projectId, projectId));
  const repliquesParPersonnage = new Map<number, number[]>();
  for (const l of lignes) {
    if (l.locuteurId != null) repliquesParPersonnage.set(l.locuteurId, [...(repliquesParPersonnage.get(l.locuteurId) ?? []), l.id]);
  }
  return { repliquesParPersonnage };
}

/** Plans (ids) qui citent au moins une des répliques données. */
export async function getPlanIdsDesRepliques(ids: number[]): Promise<Map<number, number[]>> {
  const parReplique = new Map<number, number[]>();
  if (ids.length === 0) return parReplique;
  const liaisons = await db
    .select({ repliqueId: planDialogues.repliqueId, planId: planDialogues.planId })
    .from(planDialogues)
    .where(inArray(planDialogues.repliqueId, ids));
  for (const l of liaisons) parReplique.set(l.repliqueId, [...(parReplique.get(l.repliqueId) ?? []), l.planId]);
  return parReplique;
}

/** Export des répliques — une ligne par réplique, dans l'ordre du montage :
 * plan d'apparition (position, donc `ordre` des plans) puis slot ; les
 * répliques pas encore placées suivent, dans l'ordre de l'épisode. */
export async function getExportRepliques(projectId: number, episodeId?: number): Promise<LigneExportReplique[]> {
  const toutes = (await getRepliquesProjet(projectId)).filter((r) => episodeId == null || r.episodeId === episodeId);
  const cle = (r: RepliqueVue) => {
    const premier = r.usages[0];
    return premier ? [0, premier.position, premier.slot] : [1, r.ordre, 0];
  };
  const triees = [...toutes].sort((a, b) => {
    if (a.episodeNumero !== b.episodeNumero) return a.episodeNumero - b.episodeNumero;
    const ka = cle(a);
    const kb = cle(b);
    return ka[0]! - kb[0]! || ka[1]! - kb[1]! || ka[2]! - kb[2]! || a.id - b.id;
  });
  // Le rang repart de 1 à chaque épisode (un montage = un épisode).
  const rangParEpisode = new Map<number, number>();
  return triees.map((r) => ({
    uuid: r.uuid,
    rang: rangParEpisode.set(r.episodeId, (rangParEpisode.get(r.episodeId) ?? 0) + 1).get(r.episodeId)!,
    episodeNumero: r.episodeNumero,
    locuteur: r.locuteur.label,
    texte: r.texte,
    dureeSecondes: r.dureeSecondes,
    plans: r.usages.map((u) => ({ planUuid: u.planUuid, position: u.position, slot: u.slot })),
  }));
}

/** Épisodes du projet (« E01 · Titre »), dans l'ordre saison puis numéro —
 * alimente le choix d'épisode quand une réplique se crée depuis le casting. */
export async function getEpisodesProjet(projectId: number): Promise<{ id: number; label: string }[]> {
  const lignes = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre, saison: seasons.numero })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.projectId, projectId))
    .orderBy(seasons.numero, episodes.numero);
  return lignes.map((e) => ({ id: e.id, label: `E${String(e.numero).padStart(2, "0")} · ${e.titre}` }));
}
