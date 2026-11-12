import { and, eq, inArray, sql } from "drizzle-orm";
import { agentRuns, assetGenerations } from "../../db/schema";
import { STATUT_TRADUCTION, methodeDEssai } from "../assets/asset-generation";
import { TYPE_AFFICHE } from "../posters/posters";
import { assets } from "../../db/schema";
import { entreePromptAffiche } from "./poster";
import { entreePromptAsset, type EntreeSkill } from "./context";
import type { Db } from "./appliers/common";

/** An attempt launched from an asset's sheet (2026-10-15): the user writes an INSTRUCTION in French; the `prompt-asset` skill translates it
 * into a prompt for the model (Krea 2 without a base image, Qwen Image Edit with one); the attempt then enters the image queue. Like the clap
 * poster (lib/agents/poster-clap.ts), this is an LLM task whose result starts the generation, without going through a proposal to review. */

export const BUT_ESSAI = "essai";

type OptionsEssai = { generationId: number };

/** The skill input for an attempt: that of an ordinary asset, with the method FORCED (the code decided it from whether a base
 * image is present) and, as the "current" prompt, that of the base image (the prompt of the attempt we start from, otherwise that of the asset). */
export async function entreeEssaiAsset(
  db: Db,
  projectId: number,
  assetId: number,
  p: {
    consigne: string;
    aUneBase: boolean;
    promptBase: string;
    /** The attempt's images, in order (image 1 carries the changes): the base first if there is one, then the attached ones. */
    images: { rang: number; role: "base" | "jointe"; libelle: string }[];
    /** A sound: the duration the user set (the prompt must fit it). */
    dureeSecondes?: number;
  },
): Promise<EntreeSkill | null> {
  const methode = methodeDEssai(p.images.length > 0);
  // A presentation poster: the `prompt-asset` skill in its `affiche` variant (title, summary, tone, main character), with the forced method.
  const [asset] = await db.select({ type: assets.type }).from(assets).where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
  if (asset?.type === TYPE_AFFICHE) {
    const affiche = await entreePromptAffiche(db, projectId, assetId, p.consigne);
    if (!affiche) return null;
    return {
      ...affiche,
      entree: {
        ...affiche.entree,
        promptActuel: p.promptBase,
        methodeImposee: methode,
        ...(p.images.length > 0 ? { imagesDeLEssai: p.images } : {}),
      },
    };
  }
  const base = await entreePromptAsset(db, projectId, assetId, p.consigne);
  if (!base) return null;
  const e = base.entree as { asset: Record<string, unknown>; parent: unknown };
  return {
    ...base,
    variante: methode,
    entree: {
      ...base.entree,
      asset: { ...e.asset, methodeGeneration: methode, promptActuel: p.promptBase },
      parent: null,
      methodeImposee: methode,
      ...(p.images.length > 0 ? { imagesDeLEssai: p.images } : {}),
    },
  };
}

/** Skill return (called by the worker, inside its transaction): the prompt is written to the attempt, which enters the image queue. An attempt
 * deleted or cancelled in the meantime is not revived. */
export async function ecrireEssaiTraduit(db: Db, options: unknown, sortie: { promptGeneration?: unknown }): Promise<void> {
  const generationId = (options as Partial<OptionsEssai> | null)?.generationId;
  if (typeof generationId !== "number") throw new Error("Essai sans identifiant de génération.");
  const prompt = typeof sortie.promptGeneration === "string" ? sortie.promptGeneration.trim() : "";
  if (!prompt) throw new Error("Le prompt traduit est vide.");
  await db
    .update(assetGenerations)
    .set({ prompt, statut: "en_attente" })
    .where(and(eq(assetGenerations.id, generationId), eq(assetGenerations.statut, STATUT_TRADUCTION)));
}

/** The translation failed or was cancelled: the attempt says so (nothing goes into the image queue). */
export async function terminerEssaiSansPrompt(db: Db, options: unknown, statut: "echoue" | "annulee", message: string | null): Promise<void> {
  const generationId = (options as Partial<OptionsEssai> | null)?.generationId;
  if (typeof generationId !== "number") return;
  await db
    .update(assetGenerations)
    .set({ statut, erreur: message ? `Traduction de la consigne impossible : ${message.slice(0, 500)}` : null, finishedAt: new Date() })
    .where(and(eq(assetGenerations.id, generationId), eq(assetGenerations.statut, STATUT_TRADUCTION)));
}

/** Cancels an attempt's translation (deletion or cancellation from the sheet): the pending LLM task is cancelled; a running one will finish into the void. */
export async function annulerTraductionEssai(db: Db, generationId: number): Promise<void> {
  await db
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: new Date(), erreur: null })
    .where(
      and(
        eq(agentRuns.but, BUT_ESSAI),
        inArray(agentRuns.statut, ["en_attente"]),
        sql`(${agentRuns.options}->>'generationId')::int = ${generationId}`,
      ),
    );
}

/** Safety net: an attempt "in translation" with no LLM task left pending or running (cancelled, deleted, lost) is marked
 * cancelled. Called after each LLM call cancellation, so the sheet never shows an attempt waiting for nothing. */
export async function balayerEssaisSansTache(db: Db): Promise<void> {
  await db.execute(sql`
    UPDATE asset_generations
       SET statut = 'annulee', finished_at = now()
     WHERE statut = ${STATUT_TRADUCTION}
       AND NOT EXISTS (
         SELECT 1 FROM agent_runs r
          WHERE r.but = ${BUT_ESSAI}
            AND r.statut IN ('en_attente', 'en_cours')
            AND (r.options->>'generationId')::int = asset_generations.id
       )`);
}
