import type { Operation } from "./types";
import type { PlanVue, RepliqueVue, VueEpisode } from "./vue-episode";

// Locaux : vue-episode.ts touche à la base, et ce module est importé côté navigateur (affichage.ts).
const planParUuid = (vue: VueEpisode, uuid: string): PlanVue | undefined => vue.plans.find((p) => p.uuid === uuid);
const repliqueParUuid = (vue: VueEpisode, uuid: string): RepliqueVue | undefined => vue.repliques.find((r) => r.uuid === uuid);

/** Le scénario AVEC le brouillon : les opérations des décisions appliquées, en mémoire, sur la vue de l'épisode. Pur, testé.
 * Sert aux chiffres (durée totale, gain d'une décision) et à l'affichage ; n'écrit rien. */

export type PlanBrouillon = {
  uuid: string;
  /** La poignée d'origine (le rang réel, pas celui du brouillon). */
  handle: string;
  titre: string;
  description: string;
  duree: number;
  dureeOriginale: number;
  coupe: boolean;
  deplace: boolean;
};

export type RepliqueBrouillon = { uuid: string; handle: string; texte: string; texteOriginal: string; locuteur: string; supprimee: boolean };

export type Brouillon = {
  /** Dans l'ordre résultat ; un plan coupé reste à sa place (barré à l'affichage). */
  plans: PlanBrouillon[];
  repliques: RepliqueBrouillon[];
  /** Durée des plans non coupés. */
  total: number;
  /** Opérations sans effet (cible déjà coupée ou supprimée, repère coupé) : à signaler, jamais appliquées. */
  ignorees: { operation: Operation; raison: string }[];
};

export function appliquerAuBrouillon(vue: VueEpisode, operations: Operation[]): Brouillon {
  const plans: PlanBrouillon[] = vue.plans.map((p) => ({ uuid: p.uuid, handle: p.handle, titre: p.titre, description: p.description, duree: p.duree, dureeOriginale: p.duree, coupe: false, deplace: false }));
  const repliques: RepliqueBrouillon[] = vue.repliques.map((r) => ({ uuid: r.uuid, handle: r.handle, texte: r.texte, texteOriginal: r.texte, locuteur: r.locuteur, supprimee: false }));
  const ignorees: Brouillon["ignorees"] = [];
  const plan = (uuid: string) => plans.find((p) => p.uuid === uuid);
  const replique = (uuid: string) => repliques.find((r) => r.uuid === uuid);

  for (const op of operations) {
    if (op.type === "supprimer_replique" || op.type === "remplacer_replique") {
      const r = replique(op.repliqueUuid);
      if (!r) continue;
      if (r.supprimee) {
        ignorees.push({ operation: op, raison: `${r.handle} est déjà supprimée.` });
        continue;
      }
      if (op.type === "supprimer_replique") r.supprimee = true;
      else {
        if (op.texte !== undefined) r.texte = op.texte;
        if (op.locuteur !== undefined) r.locuteur = op.locuteur;
      }
      continue;
    }
    const p = plan(op.planUuid);
    if (!p) continue;
    if (op.type === "couper_plan") {
      p.coupe = true;
      continue;
    }
    if (p.coupe) {
      ignorees.push({ operation: op, raison: `${p.handle} est déjà coupé.` });
      continue;
    }
    if (op.type === "duree_plan") p.duree = op.secondes;
    else if (op.type === "modifier_plan") {
      if (op.titre !== undefined) p.titre = op.titre;
      if (op.description !== undefined) p.description = op.description;
    } else if (op.type === "deplacer_plan") {
      const sans = plans.filter((x) => x.uuid !== p.uuid);
      let index: number;
      if ("fin" in op.position) index = sans.length;
      else if ("debut" in op.position) index = 0;
      else {
        const repere = op.position.apresPlanUuid;
        const i = sans.findIndex((x) => x.uuid === repere);
        if (i === -1 || sans[i]!.coupe) {
          ignorees.push({ operation: op, raison: `Le repère de déplacement de ${p.handle} est coupé ou introuvable.` });
          continue;
        }
        index = i + 1;
      }
      p.deplace = true;
      plans.splice(0, plans.length, ...sans.slice(0, index), p, ...sans.slice(index));
    }
  }
  return { plans, repliques, total: plans.reduce((a, p) => a + (p.coupe ? 0 : p.duree), 0), ignorees };
}

/** Les secondes que ces opérations font gagner à l'épisode (négatif : elles en font perdre). */
export function gainSecondes(vue: VueEpisode, operations: Operation[]): number {
  const avant = vue.plans.reduce((a, p) => a + p.duree, 0);
  return avant - appliquerAuBrouillon(vue, operations).total;
}

/** Les plans que des opérations touchent (uuid), pour ne montrer que les scènes concernées. */
export function plansTouches(operations: Operation[], vue: VueEpisode): Set<string> {
  const touches = new Set<string>();
  for (const op of operations) {
    if (op.type === "supprimer_replique" || op.type === "remplacer_replique") {
      for (const uuid of repliqueParUuid(vue, op.repliqueUuid)?.plans ?? []) touches.add(uuid);
    } else if (planParUuid(vue, op.planUuid)) touches.add(op.planUuid);
  }
  return touches;
}
