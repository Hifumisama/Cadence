import { and, desc, eq } from "drizzle-orm";
import { assets, episodes, planDialogues, planPromptSections, planRefs, plans, repliques, seasons } from "../../../db/schema";
import { MAX_REFS, prochainSlotAudioLibre, remplacerDialogue } from "../../plan-checks";
import { changerTexteReplique } from "../../repliques-ecriture";
import type { ChangementBrut } from "../changements";
import { rapprocherLocuteur, texteComparable, type AssetLocuteur, type LocuteurResolu } from "../locuteurs";
import { apres, parentDe, texte, type Applicateur, type CtxPrevisu, type Db } from "./commun";

/** Cible `replique` : CRÉER une réplique et la lier à son plan (modèle F02 : la réplique est une
 * entité autonome, `plan_dialogues` l'assemble au plan, un emplacement <Audio N> par réplique).
 * `apres` = { texte, locuteur, episodeId, planCle | planUuid, sceneCle | sceneId? }.
 * Le locuteur est rapproché du registre (personnage du projet, la voix off en est un) ; un locuteur inconnu
 * devient un locuteur LIBRE, signalé comme invention : JAMAIS d'asset créé par ce chemin.
 *
 * MODIFIER (2026-10) : `cibleRef` = uuid de la réplique ; `apres` = { texte?, locuteur? }. Le texte suit la même
 * règle que l'action manuelle (`changerTexteReplique`, lib/repliques-ecriture.ts) : les plans qui la citent sont à
 * resynchroniser (contrôle verbatim).
 * SUPPRIMER : `cibleRef` = uuid ; les liaisons aux plans partent par cascade. Une réplique citée par un plan demande
 * confirmation (`ecrase`). Une réplique n'est qu'un texte (chantier voix/master, 2026-10-14) : aucun fichier à nettoyer. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une réplique existante du projet, par son uuid, avec la saison de son épisode (verrou de portée). */
async function repliqueParUuid(db: Db, projectId: number, uuid: string | null) {
  if (!uuid || !UUID.test(uuid)) return null;
  const [r] = await db
    .select({
      id: repliques.id,
      episodeId: repliques.episodeId,
      texte: repliques.texte,
      locuteurId: repliques.locuteurId,
      locuteurTexte: repliques.locuteurTexte,
      seasonId: episodes.seasonId,
    })
    .from(repliques)
    .innerJoin(episodes, eq(episodes.id, repliques.episodeId))
    .where(and(eq(repliques.uuid, uuid), eq(repliques.projectId, projectId)));
  return r ?? null;
}

async function plansQuiCitent(db: Db, repliqueId: number): Promise<number> {
  const liaisons = await db.select({ id: planDialogues.id }).from(planDialogues).where(eq(planDialogues.repliqueId, repliqueId));
  return liaisons.length;
}

/** Les sections des plans qui citent la réplique, avec ce qu'un remplacement exact de l'ancien texte y changerait. */
async function dialoguesAResynchroniser(db: Db, repliqueId: number, ancien: string, nouveau: string) {
  const liaisons = await db.select({ planId: planDialogues.planId }).from(planDialogues).where(eq(planDialogues.repliqueId, repliqueId));
  const parPlan = new Map<number, { sectionId: number; contenu: string } | null>();
  for (const { planId } of liaisons) {
    const sections = await db.select({ id: planPromptSections.id, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, planId));
    let trouve: { sectionId: number; contenu: string } | null = null;
    for (const s of sections) {
      const c = remplacerDialogue(s.contenu, ancien, nouveau);
      if (c != null) {
        trouve = { sectionId: s.id, contenu: c };
        break;
      }
    }
    parPlan.set(planId, trouve);
  }
  return parPlan;
}

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

async function registreLocuteurs(db: Db, projectId: number): Promise<AssetLocuteur[]> {
  const lignes = await db
    .select({ id: assets.id, code: assets.code, type: assets.type })
    .from(assets)
    .where(eq(assets.projectId, projectId));
  return lignes.filter((a) => a.type === "personnage").map((a) => ({ id: a.id, code: a.code, type: "personnage" as const }));
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
    if (ch.operation !== "creer") {
      const r = await repliqueParUuid(db, ctx.projectId, ch.cibleRef);
      return r ? { type: "replique", operation: ch.operation, episodeId: r.episodeId, saisonId: r.seasonId } : "Réplique introuvable dans ce projet.";
    }
    const a = apres(ch);
    const id = typeof a.episodeId === "number" ? a.episodeId : null;
    if (id == null) return "Épisode de la réplique inconnu.";
    const e = await episodeDuProjet(db, ctx.projectId, id);
    return e ? { type: "replique", operation: "creer", episodeId: e.id, saisonId: e.seasonId } : "Épisode introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "modifier") return previsualiserModification(db, ctx, ch);
    if (ch.operation === "supprimer") return previsualiserSuppression(db, ctx, ch);
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
    if (ch.operation !== "creer") {
      const r = await repliqueParUuid(tx, ctx.projectId, ch.cibleRef);
      if (!r) return "Réplique introuvable dans ce projet.";
      if (ch.operation === "modifier" && texte(apres(ch).texte) !== undefined) {
        const modif = changerTexteReplique(r, texte(apres(ch).texte)!);
        if (!modif.ok) return modif.erreur;
      }
      return null;
    }
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
    if (ch.operation === "supprimer") {
      const r = (await repliqueParUuid(tx, ctx.projectId, ch.cibleRef))!;
      await tx.delete(repliques).where(eq(repliques.id, r.id)); // liaisons aux plans : cascade
      return;
    }
    if (ch.operation === "modifier") {
      const r = (await repliqueParUuid(tx, ctx.projectId, ch.cibleRef))!;
      const set: Partial<typeof repliques.$inferInsert> = { updatedAt: new Date() };
      if (texte(a.texte) !== undefined) {
        const modif = changerTexteReplique(r, texte(a.texte)!);
        if (modif.ok) Object.assign(set, modif.set);
        // La fiche cite la réplique mot pour mot (verbatim) : on la met à jour, sans modèle. Le prompt change, donc le rendu devient périmé.
        if (modif.ok && modif.texteChange) {
          const aFaire = await dialoguesAResynchroniser(tx, r.id, r.texte, texte(a.texte)!);
          for (const m of aFaire.values()) if (m) await tx.update(planPromptSections).set({ contenu: m.contenu }).where(eq(planPromptSections.id, m.sectionId));
        }
      }
      if (texte(a.locuteur) !== undefined) {
        const loc = rapprocherLocuteur(texte(a.locuteur)!, await registreLocuteurs(tx, ctx.projectId));
        set.locuteurId = loc.locuteurId;
        set.locuteurTexte = loc.locuteurTexte;
      }
      await tx.update(repliques).set(set).where(eq(repliques.id, r.id));
      return;
    }
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


function nomLocuteur(r: { locuteurId: number | null; locuteurTexte: string }, registre: AssetLocuteur[]): string {
  const id = r.locuteurId;
  return (id != null ? registre.find((a) => a.id === id)?.code : undefined) ?? r.locuteurTexte;
}

/** Aperçu d'une modification (texte et/ou locuteur) : l'avant/après, les fiches de plan à resynchroniser. */
async function previsualiserModification(db: Db, ctx: CtxPrevisu, ch: ChangementBrut): Promise<ChangementBrut> {
  const r = await repliqueParUuid(db, ctx.projectId, ch.cibleRef);
  if (!r) return { ...ch, refuseRaison: "Réplique introuvable dans ce projet." };
  const a = apres(ch);
  const avertissements = [...(ch.avertissements ?? [])];
  const avant: Record<string, unknown> = {};
  const garde: Record<string, unknown> = {};
  let ecrase: string | null = null;

  if (texte(a.texte) !== undefined) {
    const modif = changerTexteReplique(r, texte(a.texte)!);
    if (!modif.ok) return { ...ch, refuseRaison: modif.erreur };
    if (modif.texteChange) {
      avant.texte = r.texte;
      garde.texte = modif.set.texte;
      const n = await plansQuiCitent(db, r.id);
      if (n > 0) {
        const parPlan = await dialoguesAResynchroniser(db, r.id, r.texte, modif.set.texte ?? r.texte);
        const misAJour = [...parPlan.values()].filter(Boolean).length;
        const reste = n - misAJour;
        if (misAJour > 0) avertissements.push({ type: "info", texte: `${misAJour} fiche${misAJour > 1 ? "s" : ""} de plan cite${misAJour > 1 ? "nt" : ""} cette réplique mot pour mot : son dialogue sera mis à jour (le rendu, s'il y en a un, deviendra périmé).` });
        if (reste > 0) avertissements.push({ type: "info", texte: `${reste} fiche${reste > 1 ? "s" : ""} de plan ne cite${reste > 1 ? "nt" : ""} pas cette réplique mot pour mot : à resynchroniser à la main (le contrôle verbatim le signalera).` });
      }
    }
  }

  if (texte(a.locuteur) !== undefined) {
    const registre = await registreLocuteurs(db, ctx.projectId);
    const loc = rapprocherLocuteur(texte(a.locuteur)!, registre);
    const change = loc.locuteurId !== r.locuteurId || loc.locuteurTexte !== r.locuteurTexte;
    if (change) {
      avant.locuteur = nomLocuteur(r, registre);
      garde.locuteur = nomLocuteur(loc, registre);
      if (!loc.connu) {
        avertissements.push({ type: "invention", texte: `Locuteur « ${loc.locuteurTexte} » absent du registre : la réplique prend un locuteur libre (aucun asset n'est créé).` });
      }
    }
  }

  if (Object.keys(garde).length === 0) return { ...ch, refuseRaison: "Rien ne change pour cette réplique." };
  return { ...ch, avant, apres: garde, ecrase, avertissements };
}

/** Aperçu d'une suppression : ce qui est retiré des plans. */
async function previsualiserSuppression(db: Db, ctx: CtxPrevisu, ch: ChangementBrut): Promise<ChangementBrut> {
  const r = await repliqueParUuid(db, ctx.projectId, ch.cibleRef);
  if (!r) return { ...ch, refuseRaison: "Réplique introuvable dans ce projet." };
  const avertissements = [...(ch.avertissements ?? [])];
  const n = await plansQuiCitent(db, r.id);
  const raisons: string[] = [];
  if (n > 0) raisons.push(`elle est citée par ${n} plan${pluriel(n, "", "s")} (retirée de leur fiche)`);
  let ecrase: string | null = null;
  if (raisons.length > 0) {
    ecrase = `« ${r.texte.slice(0, 40)}${r.texte.length > 40 ? "…" : ""} » : ${raisons.join(" ; ")}.`;
    avertissements.push({ type: "ecrase_valide", texte: "Supprime une réplique utilisée dans une fiche de plan." });
  }
  const registre = await registreLocuteurs(db, ctx.projectId);
  return { ...ch, avant: { texte: r.texte, locuteur: nomLocuteur(r, registre) }, apres: null, ecrase, avertissements };
}
