import { and, eq, inArray, sql } from "drizzle-orm";
import { agentRuns, assetGenerations } from "../../db/schema";
import { STATUT_TRADUCTION, methodeDEssai } from "../asset-generation";
import { TYPE_AFFICHE } from "../affiches";
import { assets } from "../../db/schema";
import { entreePromptAffiche } from "./affiche";
import { entreePromptAsset, type EntreeSkill } from "./contexte";
import type { Db } from "./applicateurs/commun";

/** Un essai lancé depuis la fiche d'un asset (2026-10-15) : l'utilisateur écrit une CONSIGNE en français ; le skill `prompt-asset` la traduit
 * en prompt pour le modèle (Krea 2 sans image de base, Qwen Image Edit avec) ; l'essai entre alors dans la file d'images. Comme l'affiche du clap
 * (lib/agents/affiche-clap.ts), c'est une tâche LLM dont le résultat lance la génération, sans passer par une proposition à relire. */

export const BUT_ESSAI = "essai";

export type OptionsEssai = { generationId: number };

/** L'entrée du skill pour un essai : celle d'un asset ordinaire, avec la méthode IMPOSÉE (le code l'a décidée d'après la présence d'une image de
 * base) et, comme prompt « actuel », celui de l'image de base (le prompt de l'essai d'où l'on repart, sinon celui de l'asset). */
export async function entreeEssaiAsset(
  db: Db,
  projectId: number,
  assetId: number,
  p: {
    consigne: string;
    aUneBase: boolean;
    promptBase: string;
    /** Les images de l'essai, dans l'ordre (l'image 1 est celle qui porte les modifications) : la base d'abord s'il y en a une, puis les jointes. */
    images: { rang: number; role: "base" | "jointe"; libelle: string }[];
  },
): Promise<EntreeSkill | null> {
  const methode = methodeDEssai(p.images.length > 0);
  // Une affiche de présentation : le skill `prompt-asset` en variante `affiche` (titre, résumé, ton, personnage principal), avec la méthode imposée.
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

/** Retour du skill (appelé par le worker, dans sa transaction) : le prompt est écrit sur l'essai, qui entre dans la file d'images. Un essai supprimé
 * ou annulé entre-temps n'est pas ressuscité. */
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

/** La traduction a échoué ou a été annulée : l'essai le dit (rien ne part dans la file d'images). */
export async function terminerEssaiSansPrompt(db: Db, options: unknown, statut: "echoue" | "annulee", message: string | null): Promise<void> {
  const generationId = (options as Partial<OptionsEssai> | null)?.generationId;
  if (typeof generationId !== "number") return;
  await db
    .update(assetGenerations)
    .set({ statut, erreur: message ? `Traduction de la consigne impossible : ${message.slice(0, 500)}` : null, finishedAt: new Date() })
    .where(and(eq(assetGenerations.id, generationId), eq(assetGenerations.statut, STATUT_TRADUCTION)));
}

/** Annule la traduction d'un essai (suppression ou annulation depuis la fiche) : la tâche LLM en attente est annulée, celle qui tourne finira dans le vide. */
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

/** Filet de sécurité : un essai « en traduction » dont plus aucune tâche LLM n'est en attente ni en cours (annulée, supprimée, perdue) est marqué
 * annulé. Appelé après chaque annulation d'appel LLM, pour que la fiche ne montre jamais un essai qui attend pour rien. */
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
