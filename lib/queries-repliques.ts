import { db } from "../db";
import { assetGenerations, assets, episodes, planDialogues, planPromptSections, plans, repliques, seasons, voixFiches } from "../db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { cheminRepliqueMedia, repliqueMediaSrc } from "./media";
import { controlerDialogues, type ControleDialogues, type RefLabel } from "./plan-checks";
import { nomLocuteur, priseObsolete, type LigneExportReplique } from "./repliques";

/** Requêtes des répliques autonomes (docs/FRICTIONS.md F02, révision
 * 2026-09-30). Une réplique est rattachée à l'épisode ; la fiche de plan n'en
 * est que la table d'assemblage (plan_dialogues). La voix d'une réplique se
 * déduit de son locuteur : `voixId` direct (voix off) sinon la voix du
 * personnage (voix_fiches.personnageId). Côté serveur uniquement (accès disque
 * pour résoudre les URL média). */

export type LocuteurVue = {
  kind: "personnage" | "voix" | "texte";
  /** Id de l'asset (personnage ou voix), null pour un locuteur libre. */
  assetId: number | null;
  label: string;
};

export type VoixVue = { id: number; code: string };

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
  statut: string;
  fichier: string | null;
  audioSrc: string | null;
  dureeSecondes: number | null;
  priseObsolete: boolean;
  locuteur: LocuteurVue;
  voix: VoixVue | null;
  usages: UsageRepliqueVue[];
};

type ContexteProjet = {
  vues: RepliqueVue[];
  controles: Map<number, ControleDialogues>;
};

async function chargerContexte(projectId: number): Promise<ContexteProjet> {
  const [lignes, lesAssets, fiches, lesPlans] = await Promise.all([
    db
      .select({ r: repliques, episodeNumero: episodes.numero })
      .from(repliques)
      .innerJoin(episodes, eq(repliques.episodeId, episodes.id))
      .where(eq(repliques.projectId, projectId)),
    db
      .select({ id: assets.id, code: assets.code, type: assets.type })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), inArray(assets.type, ["personnage", "voix"]))),
    db.select({ assetId: voixFiches.assetId, personnageId: voixFiches.personnageId }).from(voixFiches),
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
  const voixParPersonnage = new Map<number, VoixVue>();
  for (const f of fiches) {
    const code = codeParId.get(f.assetId);
    if (f.personnageId != null && code) voixParPersonnage.set(f.personnageId, { id: f.assetId, code });
  }

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
      .map((r) => ({ id: r.id, texte: r.texte, audioPresent: r.fichier != null, priseObsolete: priseObsolete(r) }));
    controles.set(
      planId,
      controlerDialogues(
        sections.filter((s) => s.planId === planId).map((s) => ({ section: s.section, contenu: s.contenu })),
        liees,
      ),
    );
  }

  const vues: RepliqueVue[] = lignes.map(({ r, episodeNumero }) => {
    let locuteur: LocuteurVue;
    if (r.locuteurId != null) {
      locuteur = { kind: "personnage", assetId: r.locuteurId, label: nomLocuteur(codeParId.get(r.locuteurId) ?? "?") };
    } else if (r.voixId != null) {
      locuteur = { kind: "voix", assetId: r.voixId, label: r.locuteurTexte || nomLocuteur(codeParId.get(r.voixId) ?? "?") };
    } else {
      locuteur = { kind: "texte", assetId: null, label: r.locuteurTexte || "—" };
    }
    const voixDirecte = r.voixId != null && codeParId.has(r.voixId) ? { id: r.voixId, code: codeParId.get(r.voixId)! } : null;
    const voix = voixDirecte ?? (r.locuteurId != null ? (voixParPersonnage.get(r.locuteurId) ?? null) : null);

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
      statut: r.statut,
      fichier: r.fichier,
      audioSrc: repliqueMediaSrc(r.id, r.fichier),
      dureeSecondes: r.dureeSecondes,
      priseObsolete: priseObsolete(r),
      locuteur,
      voix,
      usages,
    };
  });

  vues.sort((a, b) => a.episodeNumero - b.episodeNumero || a.ordre - b.ordre || a.id - b.id);
  return { vues, controles };
}

/** Toutes les répliques du projet (casting, export), dans l'ordre épisode puis
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
  // plan_refs) : seules celles qui ont une prise déclarent un label.
  const audioRefs: RefLabel[] = liaisons.filter((l) => l.fichier != null).map((l) => ({ type: "audio", slot: l.slot }));
  return { liaisons, disponibles, controle, audioRefs };
}

/** Une prise générée pour une réplique, telle que le panneau la montre. */
export type EtatPrise = { uuid: string; statut: string; erreur: string | null };

/** Les générations de prises des répliques données : la dernière de chacune (en file, en cours, échouée ou terminée), et la liste
 * complète de leurs états (le panneau se recharge quand l'un d'eux change). */
export async function getPrisesGenerees(repliqueIds: number[]): Promise<{ derniere: Record<number, EtatPrise>; suivi: { uuid: string; statut: string }[] }> {
  if (repliqueIds.length === 0) return { derniere: {}, suivi: [] };
  const lignes = await db
    .select({ uuid: assetGenerations.uuid, statut: assetGenerations.statut, erreur: assetGenerations.erreur, repliqueId: assetGenerations.repliqueId })
    .from(assetGenerations)
    .where(inArray(assetGenerations.repliqueId, repliqueIds))
    .orderBy(desc(assetGenerations.createdAt), desc(assetGenerations.id));
  const derniere: Record<number, EtatPrise> = {};
  for (const l of lignes) {
    if (l.repliqueId != null && derniere[l.repliqueId] === undefined) derniere[l.repliqueId] = { uuid: l.uuid, statut: l.statut, erreur: l.erreur };
  }
  return { derniere, suivi: lignes.map((l) => ({ uuid: l.uuid, statut: l.statut })) };
}

export type OptionsLocuteur = {
  personnages: { id: number; code: string; label: string; voixCode: string | null }[];
  /** Voix du catalogue sans personnage : voix off, conspirateurs… */
  voixSeules: { id: number; code: string }[];
};

/** Ce que le sélecteur de locuteur propose : les personnages (avec leur voix,
 * ou « sans voix ») et les voix qui n'ont pas de personnage. */
export async function getOptionsLocuteur(projectId: number): Promise<OptionsLocuteur> {
  const [lesAssets, fiches] = await Promise.all([
    db
      .select({ id: assets.id, code: assets.code, type: assets.type })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), inArray(assets.type, ["personnage", "voix"])))
      .orderBy(asc(assets.code)),
    db.select({ assetId: voixFiches.assetId, personnageId: voixFiches.personnageId }).from(voixFiches),
  ]);
  const voixIds = new Set(lesAssets.filter((a) => a.type === "voix").map((a) => a.id));
  const codeParId = new Map(lesAssets.map((a) => [a.id, a.code]));
  const voixParPersonnage = new Map<number, string>();
  const voixAvecPersonnage = new Set<number>();
  for (const f of fiches) {
    if (!voixIds.has(f.assetId)) continue;
    if (f.personnageId != null) {
      voixParPersonnage.set(f.personnageId, codeParId.get(f.assetId) ?? "?");
      voixAvecPersonnage.add(f.assetId);
    }
  }
  return {
    personnages: lesAssets
      .filter((a) => a.type === "personnage")
      .map((a) => ({ id: a.id, code: a.code, label: nomLocuteur(a.code), voixCode: voixParPersonnage.get(a.id) ?? null })),
    voixSeules: lesAssets.filter((a) => a.type === "voix" && !voixAvecPersonnage.has(a.id)).map((a) => ({ id: a.id, code: a.code })),
  };
}

/** Pour le registre d'assets : la voix de chaque personnage, le nombre de
 * répliques qu'il porte, et les plans où chaque voix parle (déduits des
 * répliques liées — jamais un lien stocké sur le plan). */
export async function getLiensVoix(projectId: number) {
  const [lesAssets, fiches, lignes] = await Promise.all([
    db
      .select({ id: assets.id, code: assets.code, type: assets.type })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), inArray(assets.type, ["personnage", "voix"]))),
    db.select({ assetId: voixFiches.assetId, personnageId: voixFiches.personnageId }).from(voixFiches),
    db
      .select({ id: repliques.id, locuteurId: repliques.locuteurId, voixId: repliques.voixId })
      .from(repliques)
      .where(eq(repliques.projectId, projectId)),
  ]);
  const idsVoix = new Set(lesAssets.filter((a) => a.type === "voix").map((a) => a.id));
  const codeParId = new Map(lesAssets.map((a) => [a.id, a.code]));

  const voixParPersonnage = new Map<number, { id: number; code: string }>();
  const personnageParVoix = new Map<number, number>();
  for (const f of fiches) {
    if (!idsVoix.has(f.assetId) || f.personnageId == null) continue;
    voixParPersonnage.set(f.personnageId, { id: f.assetId, code: codeParId.get(f.assetId) ?? "?" });
    personnageParVoix.set(f.assetId, f.personnageId);
  }

  const nbRepliquesParPersonnage = new Map<number, number>();
  const repliquesParVoix = new Map<number, number[]>(); // voix -> ids de répliques
  for (const l of lignes) {
    if (l.locuteurId != null) nbRepliquesParPersonnage.set(l.locuteurId, (nbRepliquesParPersonnage.get(l.locuteurId) ?? 0) + 1);
    const voixId = l.voixId ?? (l.locuteurId != null ? voixParPersonnage.get(l.locuteurId)?.id : undefined);
    if (voixId != null) repliquesParVoix.set(voixId, [...(repliquesParVoix.get(voixId) ?? []), l.id]);
  }

  return { voixParPersonnage, personnageParVoix, nbRepliquesParPersonnage, repliquesParVoix };
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

/** Export des audios seuls — une ligne par réplique, dans l'ordre du montage :
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
    voix: r.voix?.code ?? null,
    texte: r.texte,
    dureeSecondes: r.dureeSecondes,
    statut: r.statut,
    fichier: r.fichier ? cheminRepliqueMedia(r.id, r.fichier) : null,
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
