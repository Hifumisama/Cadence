import { and, eq } from "drizzle-orm";
import { episodes, projects, scenes, seasons } from "../../../db/schema";
import type { ChangementBrut } from "../changements";
import { apres, entierRef, parentDe, REFUS_SUPPRESSION, texte, type Applicateur } from "./commun";

/** Applicateurs de la structure : projet (clause de style), saison, épisode, scène. */

// --- projet -----------------------------------------------------------------

/** Cible `projet` : RETIRÉE (2026-10-02). La clause de style et les notes du projet sont des
 * sections du BRIEF (cible `brief`) ; `projects.clause_style` n'en est qu'une copie (brief-db.ts).
 * Les anciennes propositions qui portent encore ce type sont refusées avec un message clair. */
export const applicateurProjet: Applicateur = {
  cibleType: "projet",

  async cible(_db, _ctx, ch) {
    return { type: "projet", operation: ch.operation };
  },

  async previsualiser(_db, _ctx, ch) {
    return { ...ch, refuseRaison: "La clause de style et les notes se modifient dans le brief du projet." };
  },

  async verifier() {
    return "La clause de style et les notes se modifient dans le brief du projet.";
  },

  async appliquer() {
    throw new Error("La clause de style et les notes se modifient dans le brief du projet.");
  },
};

// --- saison -----------------------------------------------------------------

export const applicateurSaison: Applicateur = {
  cibleType: "saison",

  async cible(db, ctx, ch) {
    if (ch.operation === "creer") return { type: "saison", operation: "creer" };
    const id = entierRef(ch.cibleRef);
    if (id == null) return "Saison introuvable.";
    const [s] = await db.select({ id: seasons.id }).from(seasons).where(and(eq(seasons.id, id), eq(seasons.projectId, ctx.projectId)));
    return s ? { type: "saison", operation: ch.operation, saisonId: s.id } : "Saison introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation === "creer") return ch;
    const id = entierRef(ch.cibleRef);
    const [s] = id == null ? [] : await db.select().from(seasons).where(and(eq(seasons.id, id), eq(seasons.projectId, ctx.projectId)));
    if (!s) return { ...ch, refuseRaison: "Saison introuvable dans ce projet." };
    return { ...ch, avant: { titre: s.titre } };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation === "supprimer") return REFUS_SUPPRESSION;
    if (!texte(apres(ch).titre)?.trim()) return "Titre de saison manquant.";
    if (ch.operation === "modifier") {
      const id = entierRef(ch.cibleRef);
      const [s] = id == null ? [] : await tx.select({ id: seasons.id }).from(seasons).where(and(eq(seasons.id, id), eq(seasons.projectId, ctx.projectId)));
      return s ? null : "Saison introuvable dans ce projet.";
    }
    return null;
  },

  async appliquer(tx, ctx, ch) {
    const titre = texte(apres(ch).titre)!.trim();
    if (ch.operation === "modifier") {
      await tx.update(seasons).set({ titre }).where(eq(seasons.id, entierRef(ch.cibleRef)!));
      return;
    }
    const existantes = await tx.select({ numero: seasons.numero }).from(seasons).where(eq(seasons.projectId, ctx.projectId));
    const numero = existantes.reduce((m, s) => Math.max(m, s.numero), 0) + 1;
    const [cree] = await tx.insert(seasons).values({ projectId: ctx.projectId, numero, titre }).returning({ id: seasons.id });
    if (ch.cle) ctx.cles.set(ch.cle, cree!.id);
  },
};

// --- épisode ----------------------------------------------------------------

export const applicateurEpisode: Applicateur = {
  cibleType: "episode",

  async cible(db, ctx, ch) {
    if (ch.operation === "creer") {
      const p = parentDe(apres(ch), "saisonCle", "saisonId", "cles" in ctx ? ctx.cles : ctx.clesNouvelles);
      if (p.nouveau) return { type: "episode", operation: "creer", saisonId: p.id, parentNouveau: true };
      if (p.id == null) return "Saison de l'épisode inconnue.";
      const [s] = await db.select({ id: seasons.id }).from(seasons).where(and(eq(seasons.id, p.id), eq(seasons.projectId, ctx.projectId)));
      return s ? { type: "episode", operation: "creer", saisonId: s.id } : "Saison introuvable dans ce projet.";
    }
    const id = entierRef(ch.cibleRef);
    if (id == null) return "Épisode introuvable.";
    const [e] = await db
      .select({ id: episodes.id, seasonId: episodes.seasonId })
      .from(episodes)
      .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
      .where(and(eq(episodes.id, id), eq(seasons.projectId, ctx.projectId)));
    return e ? { type: "episode", operation: ch.operation, saisonId: e.seasonId, episodeId: e.id } : "Épisode introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation === "creer") return ch;
    const id = entierRef(ch.cibleRef);
    const [e] =
      id == null
        ? []
        : await db
            .select({ titre: episodes.titre, resume: episodes.resume })
            .from(episodes)
            .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
            .where(and(eq(episodes.id, id), eq(seasons.projectId, ctx.projectId)));
    if (!e) return { ...ch, refuseRaison: "Épisode introuvable dans ce projet." };
    return { ...ch, avant: { titre: e.titre, resume: e.resume } };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation === "supprimer") return REFUS_SUPPRESSION;
    const a = apres(ch);
    if (ch.operation === "creer") {
      if (!texte(a.titre)?.trim()) return "Titre d'épisode manquant.";
      const p = parentDe(a, "saisonCle", "saisonId", ctxCles(ctx));
      return p.id == null ? "Saison de l'épisode inconnue." : null;
    }
    const id = entierRef(ch.cibleRef);
    const [e] = id == null ? [] : await tx.select({ id: episodes.id }).from(episodes).where(eq(episodes.id, id));
    return e ? null : "Épisode introuvable.";
  },

  async appliquer(tx, ctx, ch) {
    const a = apres(ch);
    if (ch.operation === "modifier") {
      const valeurs: { titre?: string; resume?: string } = {};
      if (texte(a.titre) !== undefined) valeurs.titre = texte(a.titre)!.trim();
      if (texte(a.resume) !== undefined) valeurs.resume = texte(a.resume)!;
      if (Object.keys(valeurs).length) await tx.update(episodes).set(valeurs).where(eq(episodes.id, entierRef(ch.cibleRef)!));
      return;
    }
    const saisonId = parentDe(a, "saisonCle", "saisonId", ctx.cles).id!;
    const existants = await tx.select({ numero: episodes.numero }).from(episodes).where(eq(episodes.seasonId, saisonId));
    const numero = existants.reduce((m, e) => Math.max(m, e.numero), 0) + 1;
    const [cree] = await tx
      .insert(episodes)
      .values({ seasonId: saisonId, numero, titre: texte(a.titre)!.trim(), resume: texte(a.resume) ?? "" })
      .returning({ id: episodes.id });
    if (ch.cle) ctx.cles.set(ch.cle, cree!.id);
  },
};

function ctxCles(ctx: { cles: Map<string, number> }) {
  return ctx.cles;
}

// --- scène ------------------------------------------------------------------

export const applicateurScene: Applicateur = {
  cibleType: "scene",

  async cible(db, ctx, ch) {
    if (ch.operation === "creer") {
      const p = parentDe(apres(ch), "episodeCle", "episodeId", "cles" in ctx ? ctx.cles : ctx.clesNouvelles);
      if (p.nouveau) return { type: "scene", operation: "creer", episodeId: p.id, parentNouveau: true };
      if (p.id == null) return "Épisode de la scène inconnu.";
      const [e] = await db
        .select({ id: episodes.id, seasonId: episodes.seasonId })
        .from(episodes)
        .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
        .where(and(eq(episodes.id, p.id), eq(seasons.projectId, ctx.projectId)));
      return e ? { type: "scene", operation: "creer", episodeId: e.id, saisonId: e.seasonId } : "Épisode introuvable dans ce projet.";
    }
    const id = entierRef(ch.cibleRef);
    if (id == null) return "Scène introuvable.";
    const [s] = await db
      .select({ id: scenes.id, episodeId: scenes.episodeId, seasonId: episodes.seasonId })
      .from(scenes)
      .innerJoin(episodes, eq(episodes.id, scenes.episodeId))
      .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
      .where(and(eq(scenes.id, id), eq(seasons.projectId, ctx.projectId)));
    return s ? { type: "scene", operation: ch.operation, episodeId: s.episodeId, saisonId: s.seasonId } : "Scène introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation === "creer") return ch;
    const id = entierRef(ch.cibleRef);
    const [s] = id == null ? [] : await db.select().from(scenes).where(eq(scenes.id, id));
    if (!s) return { ...ch, refuseRaison: "Scène introuvable." };
    return { ...ch, avant: { titre: s.titre, fonction: s.fonction } };
  },

  async verifier(tx, _ctx, ch) {
    if (ch.operation === "supprimer") return REFUS_SUPPRESSION;
    const a = apres(ch);
    if (!texte(a.titre)?.trim()) return "Titre de scène manquant.";
    if (ch.operation === "creer") {
      return parentDe(a, "episodeCle", "episodeId", _ctx.cles).id == null ? "Épisode de la scène inconnu." : null;
    }
    const id = entierRef(ch.cibleRef);
    const [s] = id == null ? [] : await tx.select({ id: scenes.id }).from(scenes).where(eq(scenes.id, id));
    return s ? null : "Scène introuvable.";
  },

  async appliquer(tx, _ctx, ch) {
    const a = apres(ch);
    const titre = texte(a.titre)!.trim();
    const fonction = texte(a.fonction)?.trim() || null;
    if (ch.operation === "modifier") {
      await tx.update(scenes).set({ titre, fonction }).where(eq(scenes.id, entierRef(ch.cibleRef)!));
      return;
    }
    const episodeId = parentDe(a, "episodeCle", "episodeId", _ctx.cles).id!;
    const existantes = await tx.select({ ordre: scenes.ordre }).from(scenes).where(eq(scenes.episodeId, episodeId));
    const ordre = existantes.reduce((m, s) => Math.max(m, s.ordre), -1) + 1;
    const [cree] = await tx.insert(scenes).values({ episodeId, ordre, titre, fonction }).returning({ id: scenes.id });
    if (ch.cle) _ctx.cles.set(ch.cle, cree!.id);
  },
};
