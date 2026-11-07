"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { jobs, montageEntrees, montageExports, plans } from "@/db/schema";
import { entreesEpisode, reecrireRangs } from "@/lib/montage-db";
import { construireClips, recaler, segmentsExport, DUREE_MIN_CLIP } from "@/lib/montage";
import { getMontage } from "@/lib/queries-montage";

/** Actions de la page Montage (docs/PLAN_MONTAGE.md). Elles ne touchent qu'aux ENTRÉES du montage (`montage_entrees`) : jamais à un plan,
 * à son ordre dans le scénario ni à ses rendus. L'ordre du scénario, lui, se change avec `deplacerPlan` (app/scenario/actions.ts). La
 * page applique chaque geste tout de suite (mise à jour optimiste) puis appelle l'action ; la revalidation la recale sur la base. */

type Resultat = { ok: true } | { ok: false; erreur: string };

const fini = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const arrondi = (n: number) => Math.round(n * 100) / 100;

async function entree(entreeId: number) {
  const [e] = await db.select().from(montageEntrees).where(eq(montageEntrees.id, entreeId));
  return e ?? null;
}

/** Glisser-déposer d'un clip, et tout réordonnancement : la séquence complète des entrées de l'épisode, dans le nouvel ordre. Refusé si
 * elle ne correspond plus aux entrées en base (une autre fenêtre a changé le montage entre-temps). */
export async function reordonnerMontage(episodeId: number, ids: number[]): Promise<Resultat> {
  const r = await db.transaction(async (tx) => {
    const actuelles = await entreesEpisode(tx, episodeId);
    const parId = new Map(actuelles.map((e) => [e.id, e]));
    if (ids.length !== actuelles.length || new Set(ids).size !== ids.length || ids.some((id) => !parId.has(id))) {
      return { ok: false as const, erreur: "Le montage a changé entre-temps : la page a été rechargée." };
    }
    await reecrireRangs(tx, ids.map((id) => parId.get(id)!));
    return { ok: true as const };
  });
  revalidatePath("/", "layout");
  return r;
}

/** Rognage non destructif : début et fin (secondes dans le rendu) ; `fin` null = jusqu'au bout. Le fichier n'est jamais touché. */
export async function rognerEntree(entreeId: number, debut: number, fin: number | null): Promise<Resultat> {
  if (!fini(debut) || debut < 0 || (fin != null && (!fini(fin) || fin < debut + DUREE_MIN_CLIP - 1e-6))) {
    return { ok: false, erreur: "Rognage invalide : la fin doit suivre le début d'au moins une demi-seconde." };
  }
  const e = await entree(entreeId);
  if (!e) return { ok: false, erreur: "Ce plan n'est plus dans le montage." };
  await db.update(montageEntrees).set({ debutSecondes: arrondi(debut), finSecondes: fin == null ? null : arrondi(fin) }).where(eq(montageEntrees.id, entreeId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Le rendu que lit cette entrée (et que l'export prendra). `null` = revenir au rendu par défaut du plan. Seul un rendu terminé, avec son
 * fichier, du même plan, peut être retenu. */
export async function choisirRenduEntree(entreeId: number, renduId: number | null): Promise<Resultat> {
  const e = await entree(entreeId);
  if (!e) return { ok: false, erreur: "Ce plan n'est plus dans le montage." };
  if (renduId != null) {
    const [j] = await db.select({ statut: jobs.statut, chemin: jobs.cheminSortie }).from(jobs).where(and(eq(jobs.id, renduId), eq(jobs.planId, e.planId)));
    if (!j) return { ok: false, erreur: "Ce rendu n'appartient pas à ce plan." };
    if (j.statut !== "termine" || !j.chemin) return { ok: false, erreur: "Ce rendu n'est pas lisible (pas terminé, ou sans fichier)." };
  }
  await db.update(montageEntrees).set({ renduRetenuId: renduId }).where(eq(montageEntrees.id, entreeId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Dupliquer : une entrée de plus sur le même plan, juste après, avec le même rendu et le même rognage (qu'on change ensuite à part).
 * Aucun fichier n'est copié. */
export async function dupliquerEntree(entreeId: number): Promise<{ ok: true; id: number } | { ok: false; erreur: string }> {
  const r = await db.transaction(async (tx) => {
    const [e] = await tx.select().from(montageEntrees).where(eq(montageEntrees.id, entreeId));
    if (!e) return { ok: false as const, erreur: "Ce plan n'est plus dans le montage." };
    const toutes = await entreesEpisode(tx, e.episodeId);
    const [copie] = await tx
      .insert(montageEntrees)
      .values({ episodeId: e.episodeId, planId: e.planId, renduRetenuId: e.renduRetenuId, debutSecondes: e.debutSecondes, finSecondes: e.finSecondes, rang: e.rang + 1 })
      .returning({ id: montageEntrees.id, rang: montageEntrees.rang });
    const sequence: { id: number; rang: number }[] = [...toutes];
    sequence.splice(toutes.findIndex((x) => x.id === e.id) + 1, 0, copie!);
    await reecrireRangs(tx, sequence);
    return { ok: true as const, id: copie!.id };
  });
  revalidatePath("/", "layout");
  return r;
}

/** Retirer du montage : l'entrée disparaît, jamais le plan ni ses rendus (le plan sans entrée passe dans « Hors montage »). Le montage
 * garde au moins une entrée : un montage vide serait repris tout entier à la prochaine ouverture (voir `assurerMontage`). */
export async function retirerEntree(entreeId: number): Promise<Resultat> {
  const r = await db.transaction(async (tx) => {
    const [e] = await tx.select().from(montageEntrees).where(eq(montageEntrees.id, entreeId));
    if (!e) return { ok: false as const, erreur: "Ce plan n'est plus dans le montage." };
    const toutes = await entreesEpisode(tx, e.episodeId);
    if (toutes.length <= 1) return { ok: false as const, erreur: "Gardez au moins un plan dans le montage." };
    await tx.delete(montageEntrees).where(eq(montageEntrees.id, entreeId));
    await reecrireRangs(tx, toutes.filter((x) => x.id !== entreeId));
    return { ok: true as const };
  });
  revalidatePath("/", "layout");
  return r;
}

/** Ajouter un plan au montage (glissé depuis « Hors montage ») à la position `index`, avec son rendu par défaut, plan entier. */
export async function ajouterAuMontage(episodeId: number, planId: number, index: number): Promise<{ ok: true; id: number } | { ok: false; erreur: string }> {
  const r = await db.transaction(async (tx) => {
    const [p] = await tx.select({ id: plans.id }).from(plans).where(and(eq(plans.id, planId), eq(plans.episodeId, episodeId)));
    if (!p) return { ok: false as const, erreur: "Ce plan n'appartient pas à cet épisode." };
    const toutes = await entreesEpisode(tx, episodeId);
    const rang = Math.max(0, Math.min(toutes.length, Math.floor(index)));
    const [cree] = await tx.insert(montageEntrees).values({ episodeId, planId, rang }).returning({ id: montageEntrees.id, rang: montageEntrees.rang });
    const sequence: { id: number; rang: number }[] = [...toutes];
    sequence.splice(rang, 0, cree!);
    await reecrireRangs(tx, sequence);
    return { ok: true as const, id: cree!.id };
  });
  revalidatePath("/", "layout");
  return r;
}

/** « Recaler sur l'ordre des scènes » : les entrées reprennent l'ordre du scénario de leur plan, rognages et rendus retenus gardés. */
export async function recalerMontage(episodeId: number): Promise<Resultat> {
  await db.transaction(async (tx) => {
    const toutes = await entreesEpisode(tx, episodeId);
    const scenario = (await tx.select({ id: plans.id }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id)).map((p) => p.id);
    await reecrireRangs(tx, recaler(toutes, scenario));
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** « Exporter l'épisode » : l'instantané de ce qui part (rendus retenus des entrées, dans l'ordre, rognage appliqué), posé en file pour le
 * worker (worker/montage-export.ts), qui le met bout à bout avec ffmpeg. Les entrées sans rendu ou en échec sont ignorées. */
export async function exporterEpisode(episodeId: number): Promise<{ ok: true; nbSegments: number; nbIgnores: number; dureeSecondes: number } | { ok: false; erreur: string }> {
  const [enCours] = await db
    .select({ id: montageExports.id })
    .from(montageExports)
    .where(and(eq(montageExports.episodeId, episodeId), eq(montageExports.statut, "en_cours")))
    .limit(1);
  if (enCours) return { ok: false, erreur: "Un export de cet épisode est déjà en cours." };
  const m = await getMontage(episodeId);
  const { segments, ignores, dureeSecondes } = segmentsExport(construireClips(m.entrees, m.plans));
  if (segments.length === 0) return { ok: false, erreur: "Aucun plan du montage n'a de rendu : rien à exporter." };
  // Une demande encore en attente est remplacée : seul le dernier état du montage compte.
  await db.delete(montageExports).where(and(eq(montageExports.episodeId, episodeId), eq(montageExports.statut, "en_attente")));
  await db.insert(montageExports).values({ episodeId, segments, nbIgnores: ignores });
  revalidatePath("/", "layout");
  return { ok: true, nbSegments: segments.length, nbIgnores: ignores, dureeSecondes };
}
