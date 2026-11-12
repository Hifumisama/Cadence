"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { jobs, montageEntrees, montageExports, plans } from "@/db/schema";
import { entreesEpisode, reecrireRangs } from "@/lib/montage/montage-db";
import { construireClips, recaler, segmentsExport, DUREE_MIN_CLIP } from "@/lib/montage/montage";
import { getMontage } from "@/lib/montage/queries-montage";

/** Actions of the Montage page (docs/PLAN_MONTAGE.md). They only touch the montage ENTRIES (`montage_entrees`): never a clip,
 * its order in the screenplay, nor its renders. The screenplay order, for its part, is changed with `deplacerPlan` (app/scenario/actions.ts). The
 * page applies each gesture right away (optimistic update) then calls the action; the revalidation realigns it on the database. */

type Resultat = { ok: true } | { ok: false; erreur: string };

const fini = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const arrondi = (n: number) => Math.round(n * 100) / 100;

async function entree(entreeId: number) {
  const [e] = await db.select().from(montageEntrees).where(eq(montageEntrees.id, entreeId));
  return e ?? null;
}

/** Drag-and-drop of a clip, and any reordering: the complete sequence of the episode's entries, in the new order. Refused if
 * it no longer matches the entries in the database (another window has changed the montage in the meantime). */
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

/** Non-destructive trim: start and end (seconds within the render); `fin` null = to the end. The file is never touched. */
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

/** The render this entry reads (and that the export will take). `null` = revert to the clip's default render. Only a finished render,
 * with its file, of the same clip, can be kept. */
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

/** Duplicate: one more entry on the same clip, right after, with the same render and the same trim (which is changed afterwards, separately).
 * No file is copied. */
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

/** Remove from the montage: the entry disappears, never the clip nor its renders (a clip without an entry goes to « Hors montage »). The montage
 * keeps at least one entry: an empty montage would be taken whole again at the next opening (see `assurerMontage`). */
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

/** Add a clip to the montage (dragged from « Hors montage ») at position `index`, with its default render, whole clip. */
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

/** « Recaler sur l'ordre des scènes »: the entries take back the screenplay order of their clip, with kept trims and selected renders kept. */
export async function recalerMontage(episodeId: number): Promise<Resultat> {
  await db.transaction(async (tx) => {
    const toutes = await entreesEpisode(tx, episodeId);
    const scenario = (await tx.select({ id: plans.id }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id)).map((p) => p.id);
    await reecrireRangs(tx, recaler(toutes, scenario));
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** « Exporter l'épisode »: the snapshot of what goes out (selected renders of the entries, in order, trim applied), queued for the
 * worker (worker/montage-export.ts), which joins them end to end with ffmpeg. Entries without a render or in failure are ignored. */
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
  // A pending request is replaced: only the latest state of the montage counts.
  await db.delete(montageExports).where(and(eq(montageExports.episodeId, episodeId), eq(montageExports.statut, "en_attente")));
  await db.insert(montageExports).values({ episodeId, segments, nbIgnores: ignores });
  revalidatePath("/", "layout");
  return { ok: true, nbSegments: segments.length, nbIgnores: ignores, dureeSecondes };
}
