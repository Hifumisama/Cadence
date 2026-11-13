"use server";

import { revalidatePath } from "next/cache";
import { annulerDemande, lireDemandeVue, type VueDemande } from "@/lib/tasks/requests-pilot";
import { lancerDemandeAjoutPlan, lancerDemandeAjoutScene } from "@/lib/tasks/requests-additions";
import { lancerDemandeFichePlan, lancerDemandesFiches } from "@/lib/tasks/requests-sheets";
import { lancerDemandeIteration, deplacerIterationEnAttente, modifierConsigneIteration } from "@/lib/tasks/requests-iteration";
import type { ContexteAjoutPlan, ContexteAjoutScene, ContexteIteration } from "@/lib/tasks/requests";

import { z } from "zod";
import { exiger, idSchema, texteSchema, uuidSchema, verifier } from "@/lib/validation/args";

// The REQUESTS (lib/tasks/requests.ts) on the interface side: « Itérer » submits one, the worker chains it through to the render (lib/tasks/requests-*.ts), the page
// only follows it. Leaving the page cancels nothing.

/** « Itérer » a clip: submits the request (instruction → agent → rewrite if needed → render). Refused if the clip already has one in progress. */
export async function demanderIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<{ ok: true; demandeId: number; enAttente: boolean } | { ok: false; erreur: string }> {
  const valide = verifier(
    z.tuple([
      uuidSchema,
      z.object({
        retour: texteSchema(4000),
        renduId: idSchema.nullish(),
        planche: z.boolean().optional(),
        depuisNumero: z.number().int().nullable(),
        reglages: z.object({ dureeGenerationSecondes: z.number().optional(), fps: z.number().optional(), seed: z.string().max(40).optional() }).optional(),
      }),
    ]),
    [conversationUuid, options],
  );
  if (!valide.ok) return valide;
  const r = await lancerDemandeIteration(conversationUuid, options);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, demandeId: r.demandeId, enAttente: r.enAttente } : r;
}

/** Corrects the instruction of an iteration waiting its turn (tasks panel). Refused once the iteration has started. */
export async function corrigerConsigneIteration(demandeId: number, texte: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const valide = verifier(z.tuple([idSchema, texteSchema(4000)]), [demandeId, texte]);
  if (!valide.ok) return valide;
  const r = await modifierConsigneIteration(demandeId, texte);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true } : r;
}

/** Moves a waiting iteration up or down in the queue (tasks panel). */
export async function deplacerIteration(demandeId: number, sens: -1 | 1): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const valide = verifier(z.tuple([idSchema, z.union([z.literal(-1), z.literal(1)])]), [demandeId, sens]);
  if (!valide.ok) return valide;
  const r = await deplacerIterationEnAttente(demandeId, sens);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true } : r;
}

/** « Ajouter un plan » (Screenplay page): submits the request (the agent writes the clip, it is added to the scene without review). Only one at a time per film. */
export async function demanderAjoutPlan(
  projectId: number,
  episodeId: number,
  options: { consigne: string; position: ContexteAjoutPlan["position"]; sceneId: number | null; scene: string },
): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const valide = verifier(
    z.tuple([
      idSchema,
      idSchema,
      z.object({
        consigne: texteSchema(4000),
        position: z.union([z.object({ apresPlanUuid: uuidSchema }), z.object({ debut: z.literal(true) })]),
        sceneId: idSchema.nullable(),
        scene: texteSchema(500),
      }),
    ]),
    [projectId, episodeId, options],
  );
  if (!valide.ok) return valide;
  const r = await lancerDemandeAjoutPlan(projectId, episodeId, options);
  revalidatePath("/", "layout");
  return r;
}

/** « Nouvelle scène » (Screenplay page): submits the request (the agent writes the scene and its clips, added to the film without review). Only one at a time per film,
 * clip or scene. An empty instruction lets the agent propose what comes next. */
export async function demanderAjoutScene(
  projectId: number,
  episodeId: number,
  options: { consigne: string; place: ContexteAjoutScene["place"]; apres: string },
): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const valide = verifier(
    z.tuple([
      idSchema,
      idSchema,
      z.object({
        consigne: texteSchema(4000),
        place: z.union([z.object({ apresSceneId: idSchema }), z.object({ debut: z.literal(true) })]),
        apres: texteSchema(500),
      }),
    ]),
    [projectId, episodeId, options],
  );
  if (!valide.ok) return valide;
  const r = await lancerDemandeAjoutScene(projectId, episodeId, options);
  revalidatePath("/", "layout");
  return r;
}

/** « Générer la fiche » of a clip: submits the request (the clip is prepared if needed: references, missing assets, prompts, images; then Open H3 IR compiles
 * the clip sheet, saved without review). Only one at a time per clip. Open H3 IR only (lib/h3ir/preparation.ts). */
export async function demanderFichePlan(projectId: number, planUuid: string): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const valide = verifier(z.tuple([idSchema, uuidSchema]), [projectId, planUuid]);
  if (!valide.ok) return valide;
  const r = await lancerDemandeFichePlan(projectId, planUuid);
  revalidatePath("/", "layout");
  return r;
}

/** « Écrire les fiches » (Screenplay page): one « Générer la fiche » request per chosen clip, submitted in screenplay order (lib/tasks/requests-*.ts,
 * `lancerDemandesFiches`). A clip refused (request in progress) does not stop the others: its reasons are returned along with the number of clip sheets launched. */
export async function demanderFichesPlans(projectId: number, planUuids: string[]): Promise<{ lancees: number; erreurs: string[] }> {
  const valide = verifier(z.tuple([idSchema, z.array(uuidSchema).max(1000)]), [projectId, planUuids]);
  if (!valide.ok) return { lancees: 0, erreurs: [valide.erreur] };
  const r = await lancerDemandesFiches(projectId, planUuids);
  revalidatePath("/", "layout");
  return { lancees: r.lancees, erreurs: r.erreurs };
}

/** Where a request stands (polling of the clip's page). */
export async function lireDemande(demandeId: number): Promise<VueDemande | null> {
  exiger(idSchema, demandeId);
  return lireDemandeVue(demandeId);
}

/** Cancels an ongoing request (the ✕ on the page; the panel goes through `annulerTache`). */
export async function annulerLaDemande(demandeId: number): Promise<{ ok: true }> {
  exiger(idSchema, demandeId);
  await annulerDemande(demandeId);
  revalidatePath("/", "layout");
  return { ok: true };
}
