import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../../db";
import { creationsProjet, projects, propositions } from "../../db/schema";
import { lancerImagesPretes } from "../images-auto";
import { estOccupe, estRienAFaire } from "./creation";
import * as service from "./service";
import type { PlanPourFiche } from "./types";

/** LES FICHES EN ARRIÈRE-PLAN (2026-10-26). Une fois la création finie, le projet est « prêt » sans fiches (24 s par plan, ~48 min
 * pour un film de 20 min : elles n'ont plus leur place dans la création). Ce pilote les écrit toutes seules, UNE SCÈNE à la
 * fois, dans l'ordre du film, et les applique sans revue (le plan est vide : rien n'est écrasé). Il tourne dans la boucle du
 * worker, comme l'installateur : sans état en mémoire, tout se relit en base (reprise sur redémarrage).
 *
 * Une scène à la fois, parce que la fiche d'un plan lit celle du plan précédent (raccord) : la scène suivante part quand la
 * précédente est appliquée. Les propositions du pilote portent `origine = "fond:<id de scène>"` : ce sont les SEULES qu'il
 * applique ou rejette ; une proposition de l'utilisateur, en attente de sa relecture, n'est jamais touchée.
 *
 * Règles pures (quelle scène, combien d'essais) ici ; lectures et écritures dans `avancerFond`. Interrupteur : `projects.fiches_auto`. */

export const ORIGINE_FOND = "fond:";
export const ORIGINE_FOND_ASSETS = "fond:assets";
/** Une scène dont l'écriture n'a pas abouti est reprise une fois, puis laissée : l'utilisateur la voit sans fiche et la relance à la main. */
export const ESSAIS_MAX_PAR_SCENE = 2;

export const origineDeScene = (sceneId: number | null): string => `${ORIGINE_FOND}${sceneId ?? 0}`;

export type SceneAEcrire = { episodeId: number; sceneId: number | null; planUuids: string[] };

/** La prochaine scène à écrire : la première, dans l'ordre du film, qui a des plans sans fiche (hors plans sans intention : l'agent
 * n'aurait que leur titre) et pas encore épuisé ses essais. `plans` arrive dans l'ordre de lecture ; une scène = des plans qui se
 * suivent dans le même épisode avec la même scène (les plans sans scène forment un bloc). `essais` : par origine de scène. */
export function prochaineScene(plans: PlanPourFiche[], essais: ReadonlyMap<string, number> = new Map()): SceneAEcrire | null {
  const blocs: PlanPourFiche[][] = [];
  for (const p of plans) {
    const dernier = blocs[blocs.length - 1];
    if (dernier && dernier[0]!.episodeId === p.episodeId && dernier[0]!.sceneId === p.sceneId) dernier.push(p);
    else blocs.push([p]);
  }
  for (const bloc of blocs) {
    const aEcrire = bloc.filter((p) => !p.aDesSections && !p.sansIntention);
    if (aEcrire.length === 0) continue;
    if ((essais.get(origineDeScene(bloc[0]!.sceneId)) ?? 0) >= ESSAIS_MAX_PAR_SCENE) continue;
    return { episodeId: bloc[0]!.episodeId, sceneId: bloc[0]!.sceneId, planUuids: aEcrire.map((p) => p.uuid) };
  }
  return null;
}

/** Les projets dont les essais bout en bout ou les rejeux sont pilotés par leur script (même règle que l'installateur). */
const estProjetDeScript = (nom: string) => nom.startsWith("TEST_AGENTS_E2E") || nom.startsWith("REJEU ");

/** Un tour : fait avancer chaque projet à fiches automatiques d'une transition. Ne rejette jamais. Renvoie le nombre de projets touchés. */
export async function piloterFichesFond(options: { essais?: boolean } = {}): Promise<number> {
  const lignes = await db.select({ id: projects.id, nom: projects.nom }).from(projects).where(eq(projects.fichesAuto, true));
  const enCreation = new Set((await db.select({ projectId: creationsProjet.projectId }).from(creationsProjet).where(eq(creationsProjet.statut, "en_cours"))).map((c) => c.projectId));
  let touches = 0;
  for (const l of lignes) {
    if (enCreation.has(l.id) || (!options.essais && estProjetDeScript(l.nom))) continue;
    try {
      if (await avancerFond(l.id)) touches += 1;
    } catch (err) {
      console.error(`[worker] Fiches en fond du projet ${l.id} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return touches;
}

/** Une transition pour un projet : appliquer ce qui est prêt, sinon écrire les prompts des assets créés, sinon lancer la scène suivante. */
export async function avancerFond(projectId: number): Promise<boolean> {
  // 1. Ce que le pilote a lancé : attendre si ça tourne, appliquer si c'est prêt.
  const enCours = await db
    .select({ uuid: propositions.uuid, statut: propositions.statut })
    .from(propositions)
    .where(and(eq(propositions.projectId, projectId), like(propositions.origine, `${ORIGINE_FOND}%`), inArray(propositions.statut, ["en_generation", "prete"])));
  if (enCours.some((p) => p.statut === "en_generation")) return false;
  const prete = enCours.find((p) => p.statut === "prete");
  if (prete) {
    const r = await service.appliquerSelection(prete.uuid, { confirmeEcrasement: false });
    if (!r.ok) {
      // Rien d'applicable (toutes les sous-tâches ont échoué…) : on la rejette, sinon elle reste « prête » et le pilote tourne en rond.
      console.error(`[worker] Fiches en fond du projet ${projectId} : application refusée (${r.erreur}).`);
      await service.rejeter(prete.uuid);
    }
    await lancerImagesPretes(projectId);
    return true;
  }

  // 2. Les assets que des fiches appliquées ont créés : leur prompt s'écrit (le projet est la seule portée qui les modifie).
  const appliquees = await db
    .select({ uuid: propositions.uuid })
    .from(propositions)
    .where(and(eq(propositions.projectId, projectId), eq(propositions.skill, "fiches"), like(propositions.origine, `${ORIGINE_FOND}%`), inArray(propositions.statut, ["appliquee", "partielle"])));
  for (const a of appliquees) {
    const r = await service.genererPromptsAssetsCrees(a.uuid);
    if (r.ok) {
      await db.update(propositions).set({ origine: ORIGINE_FOND_ASSETS }).where(eq(propositions.uuid, r.propositionUuid));
      return true;
    }
    // « rien à écrire » : cette proposition est soldée ; « occupé » : on réessaiera au tour suivant ; le reste est rare, on le dit.
    if (!estRienAFaire(r.erreur) && !estOccupe(r.erreur) && !/proposition en attente de revue|a déjà une tâche en cours/i.test(r.erreur)) {
      console.error(`[worker] Fiches en fond du projet ${projectId} : prompts des assets créés (${r.erreur}).`);
    }
  }

  // 3. La scène suivante.
  const dispo = await service.plansPourFiches(projectId, "projet", null);
  const essais = await essaisParScene(projectId);
  const scene = prochaineScene(dispo, essais);
  if (!scene) return false;

  const o = await service.ouvrirConversation(projectId, "episode", { id: scene.episodeId });
  if (!o.ok) return false;
  const conv = await service.conversationParUuid(o.conversationUuid);
  if (!conv) return false;
  // Une proposition de l'utilisateur en attente de relecture dans cette conversation : on ne la remplace pas.
  if (conv.propositionId != null) {
    const [courante] = await db.select({ statut: propositions.statut, origine: propositions.origine }).from(propositions).where(eq(propositions.id, conv.propositionId));
    if (courante && (courante.statut === "prete" || courante.statut === "en_generation") && !courante.origine) return false;
  }
  const r = await service.genererFiches(o.conversationUuid, { planUuids: scene.planUuids });
  if (!r.ok) return false; // occupé (l'utilisateur travaille dans cette conversation) ou refus : on réessaie au tour suivant
  await db.update(propositions).set({ origine: origineDeScene(scene.sceneId) }).where(eq(propositions.uuid, r.propositionUuid));
  return true;
}

async function essaisParScene(projectId: number): Promise<Map<string, number>> {
  const lignes = await db
    .select({ origine: propositions.origine })
    .from(propositions)
    .where(and(eq(propositions.projectId, projectId), eq(propositions.skill, "fiches"), like(propositions.origine, `${ORIGINE_FOND}%`)));
  const m = new Map<string, number>();
  for (const l of lignes) if (l.origine) m.set(l.origine, (m.get(l.origine) ?? 0) + 1);
  return m;
}
