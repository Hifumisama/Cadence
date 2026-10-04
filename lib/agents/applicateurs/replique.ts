import { and, desc, eq } from "drizzle-orm";
import { assets, episodes, planDialogues, planRefs, plans, repliques, seasons } from "../../../db/schema";
import { MAX_REFS, prochainSlotAudioLibre } from "../../plan-checks";
import { rapprocherLocuteur, texteComparable, type AssetLocuteur, type LocuteurResolu } from "../locuteurs";
import { apres, parentDe, texte, type Applicateur, type Db } from "./commun";

/** Cible `replique` : CRÉER une réplique et la lier à son plan (modèle F02 : la réplique est une
 * entité autonome, `plan_dialogues` l'assemble au plan, un emplacement <Audio N> par réplique).
 * `apres` = { texte, locuteur, episodeId, planCle | planUuid, sceneCle | sceneId? }.
 * Le locuteur est rapproché du registre (personnage du projet ou voix off) ; un locuteur inconnu
 * devient un locuteur LIBRE, signalé comme invention : JAMAIS d'asset créé par ce chemin.
 * Modifier ou supprimer une réplique : pas prises en charge (elles se changent dans la fiche). */

const REFUS_AUTRE_QUE_CREATION = "Seule la création d'une réplique est prise en charge ici : modifie ou supprime une réplique à la main.";

async function registreLocuteurs(db: Db, projectId: number): Promise<AssetLocuteur[]> {
  const lignes = await db
    .select({ id: assets.id, code: assets.code, type: assets.type })
    .from(assets)
    .where(eq(assets.projectId, projectId));
  return lignes.filter((a) => a.type === "personnage" || a.type === "voix").map((a) => ({ id: a.id, code: a.code, type: a.type as "personnage" | "voix" }));
}

async function episodeDuProjet(db: Db, projectId: number, episodeId: number) {
  const [e] = await db
    .select({ id: episodes.id, seasonId: episodes.seasonId })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(and(eq(episodes.id, episodeId), eq(seasons.projectId, projectId)));
  return e ?? null;
}

function texteDe(ch: { apres?: unknown }): string {
  return (texte(apres(ch).texte) ?? "").replace(/\r\n/g, "\n").trim();
}

export const applicateurReplique: Applicateur = {
  cibleType: "replique",

  async cible(db, ctx, ch) {
    if (ch.operation !== "creer") return REFUS_AUTRE_QUE_CREATION;
    const a = apres(ch);
    const id = typeof a.episodeId === "number" ? a.episodeId : null;
    if (id == null) return "Épisode de la réplique inconnu.";
    const e = await episodeDuProjet(db, ctx.projectId, id);
    return e ? { type: "replique", operation: "creer", episodeId: e.id, saisonId: e.seasonId } : "Épisode introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation !== "creer") return { ...ch, refuseRaison: REFUS_AUTRE_QUE_CREATION };
    const a = apres(ch);
    const t = texteDe(ch);
    if (!t) return { ...ch, refuseRaison: "Le texte de la réplique est vide." };
    if (typeof a.episodeId !== "number") return { ...ch, refuseRaison: "Épisode de la réplique inconnu." };

    const avertissements = [...(ch.avertissements ?? [])];
    const loc = rapprocherLocuteur(texte(a.locuteur) ?? "", await registreLocuteurs(db, ctx.projectId));
    if (!loc.connu) {
      avertissements.push({
        type: "invention",
        texte: `Locuteur « ${loc.locuteurTexte} » absent du registre : la réplique est créée avec un locuteur libre (aucun asset n'est créé).`,
      });
    }

    // Une réplique identique existe déjà dans l'épisode (relance, épisode déjà écrit) : pas de doublon.
    const existantes = await db.select({ texte: repliques.texte }).from(repliques).where(eq(repliques.episodeId, a.episodeId));
    const cle = texteComparable(t);
    if (existantes.some((r) => texteComparable(r.texte) === cle)) {
      return { ...ch, avertissements, refuseRaison: "Cette réplique existe déjà dans l'épisode." };
    }
    return { ...ch, avertissements };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation !== "creer") return REFUS_AUTRE_QUE_CREATION;
    const a = apres(ch);
    if (!texteDe(ch)) return "Le texte de la réplique est vide.";
    const episodeId = typeof a.episodeId === "number" ? a.episodeId : null;
    if (episodeId == null || !(await episodeDuProjet(tx, ctx.projectId, episodeId))) return "Épisode introuvable dans ce projet.";

    const planId = await planCible(tx, ctx.cles, a, episodeId);
    if (planId == null) return "Le plan de la réplique n'existe pas (ou n'est pas retenu avec elle).";
    const liaisons = await tx.select({ slot: planDialogues.slot }).from(planDialogues).where(eq(planDialogues.planId, planId));
    if (liaisons.length >= MAX_REFS.audio) return `Ce plan a déjà ${MAX_REFS.audio} répliques : c'est le maximum de références audio (MiniMax H3).`;
    return null;
  },

  async appliquer(tx, ctx, ch) {
    const a = apres(ch);
    const episodeId = a.episodeId as number;
    const planId = (await planCible(tx, ctx.cles, a, episodeId))!;
    const [plan] = await tx.select({ sceneId: plans.sceneId }).from(plans).where(eq(plans.id, planId));

    const sceneCle = texte(a.sceneCle);
    const sceneId = sceneCle ? (ctx.cles.get(sceneCle) ?? null) : typeof a.sceneId === "number" ? a.sceneId : (plan?.sceneId ?? null);
    const loc: LocuteurResolu = rapprocherLocuteur(texte(a.locuteur) ?? "", await registreLocuteurs(tx, ctx.projectId));

    const [dernier] = await tx.select({ ordre: repliques.ordre }).from(repliques).where(eq(repliques.episodeId, episodeId)).orderBy(desc(repliques.ordre)).limit(1);
    const [cree] = await tx
      .insert(repliques)
      .values({
        projectId: ctx.projectId,
        episodeId,
        sceneId,
        ordre: (dernier?.ordre ?? -1) + 1,
        locuteurId: loc.locuteurId,
        voixId: loc.voixId,
        locuteurTexte: loc.locuteurTexte,
        texte: texteDe(ch),
      })
      .returning({ id: repliques.id });

    // L'emplacement <Audio N> : le premier libre parmi les répliques déjà liées et les audios du plan.
    const [liaisons, refsAudio] = await Promise.all([
      tx.select({ slot: planDialogues.slot }).from(planDialogues).where(eq(planDialogues.planId, planId)),
      tx.select({ slot: planRefs.slot }).from(planRefs).where(and(eq(planRefs.planId, planId), eq(planRefs.type, "audio"))),
    ]);
    const slot = prochainSlotAudioLibre([...liaisons.map((l) => l.slot), ...refsAudio.map((r) => r.slot)]);
    if (slot == null) throw new Error("Plus d'emplacement audio libre sur ce plan.");
    await tx.insert(planDialogues).values({ planId, repliqueId: cree!.id, slot });
    if (ch.cle) ctx.cles.set(ch.cle, cree!.id);
  },
};

/** Le plan auquel rattacher la réplique : créé par la même proposition (clé) ou existant (uuid),
 * dans le bon épisode. */
async function planCible(db: Db, cles: Map<string, number>, a: Record<string, unknown>, episodeId: number): Promise<number | null> {
  const p = parentDe(a, "planCle", "planId", cles);
  if (p.nouveau) return p.id;
  const uuid = texte(a.planUuid);
  if (!uuid) return null;
  const [plan] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.uuid, uuid), eq(plans.episodeId, episodeId)));
  return plan?.id ?? null;
}

