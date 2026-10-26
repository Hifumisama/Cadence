import { and, eq } from "drizzle-orm";
import { episodes, scenes } from "../../../db/schema";
import type { ChangementBrut } from "../changements";
import { genreOuNull } from "../../scene-genres";
import { traitementDeScene } from "../traitement";
import { apres, entierRef, parentDe, REFUS_SUPPRESSION, texte, type Applicateur } from "./commun";

/** Applicateurs de la structure : projet (clause de style), épisode, scène. */

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

// --- épisode ----------------------------------------------------------------

export const applicateurEpisode: Applicateur = {
  cibleType: "episode",

  async cible(db, ctx, ch) {
    if (ch.operation === "creer") return { type: "episode", operation: "creer" };
    const id = entierRef(ch.cibleRef);
    if (id == null) return "Épisode introuvable.";
    const [e] = await db.select({ id: episodes.id }).from(episodes).where(and(eq(episodes.id, id), eq(episodes.projectId, ctx.projectId)));
    return e ? { type: "episode", operation: ch.operation, episodeId: e.id } : "Épisode introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation === "creer") return ch;
    const id = entierRef(ch.cibleRef);
    const [e] = id == null ? [] : await db.select({ titre: episodes.titre, resume: episodes.resume }).from(episodes).where(and(eq(episodes.id, id), eq(episodes.projectId, ctx.projectId)));
    if (!e) return { ...ch, refuseRaison: "Épisode introuvable dans ce projet." };
    return { ...ch, avant: { titre: e.titre, resume: e.resume } };
  },

  async verifier(tx, _ctx, ch) {
    if (ch.operation === "supprimer") return REFUS_SUPPRESSION;
    const a = apres(ch);
    if (ch.operation === "creer") return texte(a.titre)?.trim() ? null : "Titre d'épisode manquant.";
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
    const existants = await tx.select({ numero: episodes.numero }).from(episodes).where(eq(episodes.projectId, ctx.projectId));
    const numero = existants.reduce((m, e) => Math.max(m, e.numero), 0) + 1;
    const [cree] = await tx
      .insert(episodes)
      .values({ projectId: ctx.projectId, numero, titre: texte(a.titre)!.trim(), resume: texte(a.resume) ?? "" })
      .returning({ id: episodes.id });
    if (ch.cle) ctx.cles.set(ch.cle, cree!.id);
  },
};

// --- scène ------------------------------------------------------------------

export const applicateurScene: Applicateur = {
  cibleType: "scene",

  async cible(db, ctx, ch) {
    if (ch.operation === "creer") {
      const p = parentDe(apres(ch), "episodeCle", "episodeId", "cles" in ctx ? ctx.cles : ctx.clesNouvelles);
      if (p.nouveau) return { type: "scene", operation: "creer", episodeId: p.id, parentNouveau: true };
      if (p.id == null) return "Épisode de la scène inconnu.";
      const [e] = await db.select({ id: episodes.id }).from(episodes).where(and(eq(episodes.id, p.id), eq(episodes.projectId, ctx.projectId)));
      return e ? { type: "scene", operation: "creer", episodeId: e.id } : "Épisode introuvable dans ce projet.";
    }
    const id = entierRef(ch.cibleRef);
    if (id == null) return "Scène introuvable.";
    const [s] = await db
      .select({ id: scenes.id, episodeId: scenes.episodeId })
      .from(scenes)
      .innerJoin(episodes, eq(episodes.id, scenes.episodeId))
      .where(and(eq(scenes.id, id), eq(episodes.projectId, ctx.projectId)));
    return s ? { type: "scene", operation: ch.operation, episodeId: s.episodeId } : "Scène introuvable dans ce projet.";
  },

  async previsualiser(db, ctx, ch) {
    if (ch.operation === "supprimer") return { ...ch, refuseRaison: REFUS_SUPPRESSION };
    if (ch.operation === "creer") return ch;
    const id = entierRef(ch.cibleRef);
    const [s] = id == null ? [] : await db.select().from(scenes).where(eq(scenes.id, id));
    if (!s) return { ...ch, refuseRaison: "Scène introuvable." };
    return { ...ch, avant: { titre: s.titre, fonction: s.fonction, genre: s.genre, ambiance: s.ambiance } };
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
    // Genre et ambiance : posés seulement quand la proposition les porte (une modification qui ne les cite pas les laisse).
    const genre = "genre" in a ? genreOuNull(a.genre) : undefined;
    const ambiance = "ambiance" in a ? texte(a.ambiance)?.trim() || null : undefined;
    if (ch.operation === "modifier") {
      await tx.update(scenes).set({ titre, fonction, ...(genre !== undefined ? { genre } : {}), ...(ambiance !== undefined ? { ambiance } : {}) }).where(eq(scenes.id, entierRef(ch.cibleRef)!));
      return;
    }
    const episodeId = parentDe(a, "episodeCle", "episodeId", _ctx.cles).id!;
    const existantes = await tx.select({ ordre: scenes.ordre }).from(scenes).where(eq(scenes.episodeId, episodeId));
    const ordre = existantes.reduce((m, s) => Math.max(m, s.ordre), -1) + 1;
    const traitement = traitementDeScene(a.traitement);
    const [cree] = await tx.insert(scenes).values({ episodeId, ordre, titre, fonction, genre: genre ?? null, ambiance: ambiance ?? null, ...(traitement ? { traitement } : {}) }).returning({ id: scenes.id });
    if (ch.cle) _ctx.cles.set(ch.cle, cree!.id);
  },
};
