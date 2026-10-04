import { eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations } from "../../db/schema";
import { libelleEtatSousTache, libelleTache } from "../agents-affichage";
import { lireConversation, lireProposition } from "../queries-agents";
import { ETAPES_CREATION, progression, type EtapeCreation, type StatutCreation } from "./creation";
import { lireCreation } from "./creation-db";
import type { VueSousTache } from "./types";

/** L'état de la création d'un projet, tel que la page de l'installateur le lit (et le sondage de l'API). Pour chaque étape
 * qui a travaillé : le détail de ce qui se fait au fil de l'eau (un lot = ses sous-tâches une à une, avec leur état ; un appel
 * seul = son état et son compteur de jetons) : ce sont les mêmes tâches que celles de la file du header. */
export type SousTacheVue = { libelle: string; statut: VueSousTache["statut"]; detail: string };
export type VueCreation = {
  statut: StatutCreation;
  erreur: string | null;
  faites: number;
  total: number;
  etapes: {
    cle: string;
    libelle: string;
    detail: string;
    statut: EtapeCreation["statut"];
    resultat: string | null;
    erreur: string | null;
    /** Ce que fait l'appel en cours (étape sans sous-tâches) : « En cours · 312 jetons », « En file · n°2 »… */
    activite: string | null;
    sousTaches: SousTacheVue[];
  }[];
  misAJour: string;
};

export async function lireVueCreation(projectId: number): Promise<VueCreation | null> {
  const c = await lireCreation(projectId);
  if (!c) return null;
  const etapes = (Array.isArray(c.etapes) ? c.etapes : []) as EtapeCreation[];
  const p = progression(etapes);
  const [conv] = await db.select({ uuid: agentConversations.uuid }).from(agentConversations).where(eq(agentConversations.projectId, projectId));

  const detailees = await Promise.all(
    ETAPES_CREATION.map(async (def) => {
      const e = etapes.find((x) => x.cle === def.cle);
      let activite: string | null = null;
      let sousTaches: SousTacheVue[] = [];
      if (e && (e.statut === "en_cours" || e.statut === "fait") && e.propositionUuid) {
        const prop = await lireProposition(e.propositionUuid);
        if (prop?.lot) {
          sousTaches = prop.lot.sousTaches.map((s) => ({ libelle: s.libelle, statut: s.statut, detail: libelleEtatSousTache(s) }));
        } else if (e.statut === "en_cours") {
          activite = libelleTache(prop?.tache ?? null);
        }
      } else if (e?.statut === "en_cours" && def.cle === "brief" && conv) {
        activite = libelleTache((await lireConversation(conv.uuid))?.tache ?? null);
      }
      return {
        cle: def.cle,
        libelle: def.libelle,
        detail: def.detail,
        statut: e?.statut ?? ("a_venir" as const),
        resultat: e?.detail ?? null,
        erreur: e?.erreur ?? null,
        activite,
        sousTaches,
      };
    }),
  );

  return { statut: c.statut as StatutCreation, erreur: c.erreur, faites: p.faites, total: p.total, etapes: detailees, misAJour: c.updatedAt.toISOString() };
}
