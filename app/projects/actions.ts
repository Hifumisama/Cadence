"use server";

import { db } from "@/db";
import { episodes, plans, projects, seasons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminPosterMedia, type PosterCible } from "@/lib/media";

/** Un OneShot obtient 1 saison + 1 épisode créés dans la foulée, jamais
 * montrés dans la nav (décision du 2026-09-28) — une Série ne les crée que
 * si `avecPremierEpisode` (coché par défaut côté UI, voir la maquette). */
export async function creerProjet(valeurs: {
  nom: string;
  type: "oneshot" | "serie";
  avecPremierEpisode: boolean;
}) {
  const [projet] = await db
    .insert(projects)
    .values({ nom: valeurs.nom, type: valeurs.type })
    .returning();
  if (!projet) throw new Error("Échec de création du projet.");

  if (valeurs.type === "oneshot" || valeurs.avecPremierEpisode) {
    const [saison] = await db
      .insert(seasons)
      .values({ projectId: projet.id, numero: 1, titre: valeurs.type === "oneshot" ? "" : "Sans titre" })
      .returning();
    if (!saison) throw new Error("Échec de création de la saison.");
    await db.insert(episodes).values({ seasonId: saison.id, numero: 1, titre: valeurs.type === "oneshot" ? "" : "Sans titre" });
  }

  revalidatePath("/", "layout");
  redirect(`/p/${projet.id}`);
}

async function enregistrerPoster(cible: PosterCible, id: number, fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX_UPLOAD_ASSET) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).`,
    );
  }
  const ext = extname(fichier.name) || "";
  const nomFichier = `poster${ext}`;
  const cheminComplet = join(MEDIA_ROOT, cheminPosterMedia(cible, id, nomFichier));
  await mkdir(dirname(cheminComplet), { recursive: true });
  const octets = Buffer.from(await fichier.arrayBuffer());
  await writeFile(cheminComplet, octets);
  return nomFichier;
}

export async function uploaderPosterProjet(projectId: number, formData: FormData) {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  const nomFichier = await enregistrerPoster("projects", projectId, fichier);
  await db.update(projects).set({ posterFichier: nomFichier }).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
}

export async function uploaderPosterSaison(saisonId: number, formData: FormData) {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  const nomFichier = await enregistrerPoster("seasons", saisonId, fichier);
  await db.update(seasons).set({ posterFichier: nomFichier }).where(eq(seasons.id, saisonId));
  revalidatePath("/", "layout");
}

export async function uploaderPosterEpisode(episodeId: number, formData: FormData) {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  const nomFichier = await enregistrerPoster("episodes", episodeId, fichier);
  await db.update(episodes).set({ posterFichier: nomFichier }).where(eq(episodes.id, episodeId));
  revalidatePath("/", "layout");
}

/** Jamais bloquée (retour utilisateur 2026-09-28) : le projet est la racine
 * de la hiérarchie, sa suppression entraîne tout avec elle — saisons,
 * épisodes, scènes, plans (et leurs sections/refs/dialogues/jobs), ET
 * ses assets (db/schema.ts, cascade) — le seul cas où un asset disparaît.
 * Attention opérationnelle : tant qu'il n'existe qu'un projet, le supprimer
 * casse `getDefaultProjectId()` (lib/queries.ts) jusqu'à la création d'un
 * nouveau projet — pas de garde-fou ajouté ici, ce n'était pas demandé. */
export async function supprimerProjet(projectId: number) {
  await db.delete(projects).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
  redirect("/");
}

export async function modifierNomProjet(projectId: number, nom: string) {
  await db.update(projects).set({ nom }).where(eq(projects.id, projectId));
  revalidatePath("/", "layout");
}

/** Bloquée tant que la saison a des épisodes (retour utilisateur
 * 2026-09-28). `force` cascade ses épisodes (et tout ce qu'ils
 * contiennent) — jamais les assets, qui restent dans le registre du
 * projet (db/schema.ts : rien ne cascade de plan_refs/plan_dialogues vers
 * assets). */
export async function supprimerSaison(
  saisonId: number,
  force = false,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!force) {
    const [episode] = await db.select().from(episodes).where(eq(episodes.seasonId, saisonId)).limit(1);
    if (episode) {
      return { ok: false, erreur: "Cette saison a encore des épisodes — supprime-les d'abord, ou force la suppression." };
    }
  }
  await db.delete(seasons).where(eq(seasons.id, saisonId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Bloquée tant que l'épisode a des plans (retour utilisateur 2026-09-28).
 * Les scènes ne bloquent pas : ils se détachent/cascadent
 * déjà silencieusement (décision antérieure, inchangée). `force` cascade
 * les plans (et leurs sections/refs/dialogues/jobs) — jamais les assets. */
export async function supprimerEpisode(
  episodeId: number,
  force = false,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!force) {
    const [plan] = await db.select().from(plans).where(eq(plans.episodeId, episodeId)).limit(1);
    if (plan) {
      return { ok: false, erreur: "Cet épisode a encore des plans — supprime-les d'abord, ou force la suppression." };
    }
  }
  await db.delete(episodes).where(eq(episodes.id, episodeId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Réattache un épisode à une autre saison — jamais bloquée (retour
 * utilisateur 2026-09-28), mais seulement entre saisons d'un MÊME projet :
 * `plans.projectId` est dénormalisé (voir db/schema.ts) et ne serait plus
 * synchronisé avec la vraie chaîne episode -> saison -> projet si l'épisode
 * changeait de projet. Un déplacement inter-projets n'a de toute façon pas
 * de sens narratif (retour utilisateur 2026-09-28). */
export async function rattacherEpisode(
  episodeId: number,
  nouvelleSaisonId: number,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [episode] = await db
    .select({ id: episodes.id, seasonId: episodes.seasonId })
    .from(episodes)
    .where(eq(episodes.id, episodeId));
  if (!episode) return { ok: false, erreur: "Épisode introuvable." };

  const [saisonActuelle] = await db.select({ projectId: seasons.projectId }).from(seasons).where(eq(seasons.id, episode.seasonId));
  const [nouvelleSaison] = await db.select({ projectId: seasons.projectId }).from(seasons).where(eq(seasons.id, nouvelleSaisonId));
  if (!nouvelleSaison) return { ok: false, erreur: "Saison de destination introuvable." };
  if (!saisonActuelle || saisonActuelle.projectId !== nouvelleSaison.projectId) {
    return { ok: false, erreur: "Un épisode ne peut être réattaché qu'à une saison du même projet." };
  }

  await db.update(episodes).set({ seasonId: nouvelleSaisonId }).where(eq(episodes.id, episodeId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function modifierTitreSaison(saisonId: number, titre: string) {
  await db.update(seasons).set({ titre }).where(eq(seasons.id, saisonId));
  revalidatePath("/", "layout");
}

/** Nouvelle saison — numéro = max existant + 1 dans le projet (comme
 * l'ordre des scènes, lib/queries.ts). Retourne l'id créé pour que
 * l'appelant puisse enchaîner un upload de poster (qui a besoin de l'id). */
export async function creerSaison(projectId: number, titre: string): Promise<{ id: number }> {
  const existantes = await db.select({ numero: seasons.numero }).from(seasons).where(eq(seasons.projectId, projectId));
  const numero = existantes.reduce((acc, s) => Math.max(acc, s.numero), 0) + 1;
  const [saison] = await db
    .insert(seasons)
    .values({ projectId, numero, titre: titre.trim() || "Sans titre" })
    .returning();
  if (!saison) throw new Error("Échec de création de la saison.");
  revalidatePath("/", "layout");
  return { id: saison.id };
}

/** Nouvel épisode dans une saison — numéro = max existant + 1 dans la
 * saison (F03 : la continuité des plans repart à 010 pour cet épisode,
 * indépendamment de ce numéro d'épisode). */
export async function creerEpisode(saisonId: number) {
  const existants = await db.select({ numero: episodes.numero }).from(episodes).where(eq(episodes.seasonId, saisonId));
  const numero = existants.reduce((acc, e) => Math.max(acc, e.numero), 0) + 1;
  await db.insert(episodes).values({ seasonId: saisonId, numero, titre: "Sans titre" });
  revalidatePath("/", "layout");
}

/** `titre` est omis pour un OneShot (2026-09-28) : son "titre" affiché est
 * celui du projet, pas de l'épisode technique caché — voir
 * modifierNomProjet et EpisodeInfoPanel. */
export async function modifierEpisode(episodeId: number, valeurs: { titre?: string; resume: string }) {
  await db
    .update(episodes)
    .set({ ...(valeurs.titre !== undefined ? { titre: valeurs.titre } : {}), resume: valeurs.resume })
    .where(eq(episodes.id, episodeId));
  revalidatePath("/", "layout");
}
