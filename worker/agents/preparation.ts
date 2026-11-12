import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dureesCoherentes } from "../../lib/agents/iteration-plan";
import { MEDIA_ROOT } from "../../lib/media";
import { contenuPlanche, ErreurPlanche, extrairePlanche, type Planche } from "../../lib/planche-vignettes";
import type { MessageLlm } from "../../lib/llm/types";


import { agentRuns } from "../../db/schema";



/** « Préparer l'entrée » d'une tâche LLM, AU MOMENT de l'exécution (worker/llm.ts), propre à chaque skill. Par
 * défaut l'entrée stockée (agent_runs.entree) part telle quelle. Pour `iteration-plan`, l'entrée stockée ne porte
 * qu'un DESCRIPTEUR du rendu (`planche` : job, chemin relatif à MEDIA_ROOT, plafond de vignettes) : jamais
 * d'images en base. Ici, on reconstruit la planche (ffprobe + ffmpeg), on mesure la durée réelle du fichier, et on
 * produit le `MessageLlm[]` (texte + vignettes). Un rendu disparu ou un ffmpeg absent : la tâche ÉCHOUE avec un
 * message clair, jamais une planche vide ni une planche promise puis absente. La planche n'est demandée que sur action
 * explicite (« Montrer au chef opérateur », « Analyser ») ; sans descripteur, l'entrée part sans rendu ni ffmpeg. */

type RunAgent = typeof agentRuns.$inferSelect;

/** Ce que la planche d'un rendu coûte à obtenir : injectable (essais sans ffmpeg). */
type LecteurPlanche = (cheminAbsolu: string, maxVignettes: number) => Promise<Planche>;

export type DepsPreparation = { planche?: LecteurPlanche };

/** Ce qui sert à l'exécution : l'entrée du modèle, celle du contrôleur sémantique (texte seul) et ce que le
 * post-traitement doit savoir de l'exécution (durée mesurée…). */
export type EntreePreparee = {
  entree: string | object | MessageLlm[];
  controle: unknown;
  execution?: InfosExecution;
};

export type InfosExecution = { dureeReelleSecondes?: number; nbVignettes?: number };

const lirePlancheParDefaut: LecteurPlanche = async (chemin, max) => {
  if (!existsSync(chemin)) {
    throw new Error(`Le rendu de ce plan est introuvable sur le stockage (${chemin}) : régénère ou réimporte la vidéo, regarde-la, puis relance la correction.`);
  }
  return extrairePlanche(chemin, { max });
};

type DescripteurPlanche = { jobId?: number; cheminSortie?: string; maxVignettes?: number };

const arrondi = (n: number) => Math.round(n * 100) / 100;

export async function preparerEntree(run: RunAgent, deps: DepsPreparation = {}): Promise<EntreePreparee> {
  if (run.skill === "iteration-plan") return preparerIteration(run, deps);
  return { entree: run.entree as string | object, controle: run.entree };
}

async function preparerIteration(run: RunAgent, deps: DepsPreparation): Promise<EntreePreparee> {
  const stockee = (run.entree ?? {}) as Record<string, unknown> & { planche?: DescripteurPlanche; plan?: { dureeVoulueSecondes?: number } };
  // L'agent n'écrit plus de prompt (2026-11-09) : le contrôle n'a plus de traduction à vérifier, il reçoit la même entrée que le modèle (texte seul).
  const pourLeControle = <T extends object>(e: T): T => e;
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
