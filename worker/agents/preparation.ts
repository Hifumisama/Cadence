import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dureesCoherentes } from "../../lib/agents/iteration-plan";
import { MEDIA_ROOT } from "../../lib/media";
import { contenuPlanche, ErreurPlanche, extrairePlanche, type Planche } from "../../lib/planche-vignettes";
import type { MessageLlm } from "../../lib/llm/types";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, jobs, plans, propositionChangements, propositions } from "../../db/schema";
import { motsDeReference } from "../../lib/agents/iteration-plan";
import { dernierShotDuBrouillon } from "../../lib/agents/contexte";
import { cleSousTachePlan, planUuidDeCle } from "../../lib/agents/fiches";

/** « Préparer l'entrée » d'une tâche LLM, AU MOMENT de l'exécution (worker/llm.ts), propre à chaque skill. Par
 * défaut l'entrée stockée (agent_runs.entree) part telle quelle. Pour `iteration-plan`, l'entrée stockée ne porte
 * qu'un DESCRIPTEUR du rendu (`planche` : job, chemin relatif à MEDIA_ROOT, plafond de vignettes) : jamais
 * d'images en base. Ici, on reconstruit la planche (ffprobe + ffmpeg), on mesure la durée réelle du fichier, et on
 * produit le `MessageLlm[]` (texte + vignettes). Un rendu disparu ou un ffmpeg absent : la tâche ÉCHOUE avec un
 * message clair, jamais une planche vide ni une planche promise puis absente. La planche n'est demandée que sur action
 * explicite (« Montrer au chef opérateur », « Analyser ») ; sans descripteur, l'entrée part sans rendu ni ffmpeg. */

type RunAgent = typeof agentRuns.$inferSelect;

/** Ce que la planche d'un rendu coûte à obtenir : injectable (essais sans ffmpeg, scripts/agents-e2e.ts). */
export type LecteurPlanche = (cheminAbsolu: string, maxVignettes: number) => Promise<Planche>;

export type DepsPreparation = { planche?: LecteurPlanche };

/** Ce qui sert à l'exécution : l'entrée du modèle, celle du contrôleur sémantique (texte seul) et ce que le
 * post-traitement doit savoir de l'exécution (durée mesurée…). */
export type EntreePreparee = {
  entree: string | object | MessageLlm[];
  controle: unknown;
  execution?: InfosExecution;
};

export type InfosExecution = { dureeReelleSecondes?: number; nbVignettes?: number };

export const lirePlancheParDefaut: LecteurPlanche = async (chemin, max) => {
  if (!existsSync(chemin)) {
    throw new Error(`Le rendu de ce plan est introuvable sur le stockage (${chemin}) : régénère ou réimporte la vidéo, regarde-la, puis relance la correction.`);
  }
  return extrairePlanche(chemin, { max });
};

type DescripteurPlanche = { jobId?: number; cheminSortie?: string; maxVignettes?: number };

const arrondi = (n: number) => Math.round(n * 100) / 100;

export async function preparerEntree(run: RunAgent, deps: DepsPreparation = {}): Promise<EntreePreparee> {
  if (run.skill === "iteration-plan") return preparerIteration(run, deps);
  if (run.skill === "plan-h3" && run.propositionId != null && run.cleSousTache) return preparerFiche(run);
  return { entree: run.entree as string | object, controle: run.entree };
}

/** Une fiche d'un LOT : l'entrée stockée a été construite quand le lot est parti, avant que les autres fiches proposent
 * leurs assets. À l'exécution, on ajoute ce que les AUTRES sous-tâches du lot proposent déjà de créer
 * (`assetsProposesParLeLot`) : la fiche sait que « la lampe » est déjà prévue sous un autre nom et ne la redéclare pas.
 * Ces assets n'existent pas encore : ils ne sont jamais des références (le contrôle garde l'entrée stockée). */
async function preparerFiche(run: RunAgent): Promise<EntreePreparee> {
  const lignes = await db
    .select({ apres: propositionChangements.apres, sousTache: propositionChangements.sousTache, refuse: propositionChangements.refuseRaison })
    .from(propositionChangements)
    .where(and(eq(propositionChangements.propositionId, run.propositionId!), eq(propositionChangements.cibleType, "asset"), eq(propositionChangements.operation, "creer")));
  const proposes = lignes
    .filter((l) => l.sousTache !== run.cleSousTache && !l.refuse)
    .map((l) => l.apres as { code?: unknown; type?: unknown; description?: unknown } | null)
    .filter((a): a is { code: string; type?: unknown; description?: unknown } => typeof a?.code === "string")
    .map((a) => ({ code: a.code, type: String(a.type ?? ""), description: String(a.description ?? "") }));
  const dernierShot = await dernierShotDuPrecedent(run);
  const stockee = run.entree as { plansVoisins?: { precedent?: object | null } } & Record<string, unknown>;
  const precedent = dernierShot && stockee.plansVoisins?.precedent ? { ...stockee.plansVoisins.precedent, dernierShot } : null;
  if (proposes.length === 0 && !precedent) return { entree: run.entree as string | object, controle: run.entree };
  const entree = {
    ...stockee,
    ...(precedent ? { plansVoisins: { ...stockee.plansVoisins, precedent } } : {}),
    ...(proposes.length ? { assetsProposesParLeLot: proposes } : {}),
  };
  return { entree, controle: run.entree };
}

/** Le dernier shot que le plan PRÉCÉDENT du lot vient d'écrire (sa sortie, pas encore en base) : le premier shot de ce plan reprend là
 * où il finit (qui est où, tourné vers quoi, état du feu). Null si le précédent n'est pas du lot, n'a pas fini, ou n'a pas de shot. */
async function dernierShotDuPrecedent(run: RunAgent): Promise<string | null> {
  const planUuid = planUuidDeCle(run.cleSousTache);
  if (!planUuid || run.propositionId == null) return null;
  const [ce] = await db.select({ episodeId: plans.episodeId, ordre: plans.ordre }).from(plans).where(eq(plans.uuid, planUuid));
  if (!ce) return null;
  const [prec] = await db.select({ uuid: plans.uuid }).from(plans).where(and(eq(plans.episodeId, ce.episodeId), lt(plans.ordre, ce.ordre))).orderBy(desc(plans.ordre)).limit(1);
  if (!prec) return null;
  const [fini] = await db
    .select({ resultat: agentRuns.resultat })
    .from(agentRuns)
    .where(and(eq(agentRuns.propositionId, run.propositionId), eq(agentRuns.cleSousTache, cleSousTachePlan(prec.uuid)), eq(agentRuns.statut, "termine")))
    .orderBy(desc(agentRuns.id))
    .limit(1);
  return dernierShotDuBrouillon((fini?.resultat as { shots?: unknown } | null)?.shots);
}

/** Les mots du prompt de RÉFÉRENCE du plan : celui de son premier essai (écrit en anglais à la création de la fiche, jamais retouché). Ce qui y est déjà
 * est de l'anglais : le contrôle de traduction ne s'en prend qu'aux mots des consignes françaises qui n'y étaient pas. Absent si le plan n'a pas d'essai. */
async function motsDeReferenceDuPlan(run: RunAgent): Promise<string[] | undefined> {
  if (run.propositionId == null) return undefined;
  const [prop] = await db.select({ cibleId: propositions.cibleId }).from(propositions).where(eq(propositions.id, run.propositionId));
  if (prop?.cibleId == null) return undefined;
  const [premier] = await db.select({ prompt: jobs.promptUtilise }).from(jobs).where(eq(jobs.planId, prop.cibleId)).orderBy(asc(jobs.id)).limit(1);
  return premier?.prompt ? motsDeReference(premier.prompt) : undefined;
}

async function preparerIteration(run: RunAgent, deps: DepsPreparation): Promise<EntreePreparee> {
  const stockee = (run.entree ?? {}) as Record<string, unknown> & { planche?: DescripteurPlanche; plan?: { dureeVoulueSecondes?: number } };
  // Le contrôle (jamais le modèle) reçoit en plus les mots de référence : de quoi vérifier que tout le prompt est traduit.
  const reference = await motsDeReferenceDuPlan(run);
  const pourLeControle = <T extends object>(e: T): T & { motsDeReference?: string[] } => (reference ? { ...e, motsDeReference: reference } : e);
  const d = stockee.planche;
  // Sans descripteur : la planche n'a pas été demandée (jamais automatique, 2026-10-12). L'agent travaille depuis la consigne et la fiche
  // actuelle : l'entrée stockée part telle quelle, sans `rendu` ni durée mesurée (les garde-fous de durée réelle sont alors sans objet).
  if (!d) return { entree: stockee, controle: pourLeControle(stockee) };
  if (!d.cheminSortie) throw new Error("Entrée d'iteration-plan : descripteur de planche sans chemin de rendu. Relance l'analyse depuis la page du plan.");
  const chemin = resolve(MEDIA_ROOT, d.cheminSortie);
  let planche: Planche;
  try {
    planche = await (deps.planche ?? lirePlancheParDefaut)(chemin, d.maxVignettes ?? 15);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(e instanceof ErreurPlanche ? `Planche de vignettes impossible : ${message}` : message);
  }
  if (planche.vignettes.length === 0) throw new Error(`Planche de vignettes vide pour ${d.cheminSortie} : pas de diagnostic sans images.`);

  const voulue = stockee.plan?.dureeVoulueSecondes ?? 0;
  const { planche: _descripteur, ...reste } = stockee;
  void _descripteur;
  const texte = {
    ...reste,
    rendu: {
      dureeVoulueSecondes: voulue,
      dureeReelleSecondes: arrondi(planche.dureeSecondes),
      ecartSecondes: arrondi(planche.dureeSecondes - voulue),
      dureesCoherentes: dureesCoherentes(voulue, planche.dureeSecondes),
      nbVignettes: planche.vignettes.length,
    },
  };
  const messages: MessageLlm[] = [
    {
      role: "user",
      content: [{ type: "text", text: JSON.stringify(texte, null, 2) }, ...contenuPlanche(planche)],
    },
  ];
  return { entree: messages, controle: pourLeControle(texte), execution: { dureeReelleSecondes: arrondi(planche.dureeSecondes), nbVignettes: planche.vignettes.length } };
}
