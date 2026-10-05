import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agentRuns, assets } from "@/db/schema";
import { personnagePrincipal } from "./affiches";
import { horsAffiches } from "./assets-visibles";
import { lireBriefOuVide } from "./queries-agents";
import { imageActuelle } from "./queries-generations";

/** Le personnage principal du projet et son image : lu côté serveur (accès disque), partagé par la page et l'action. */
export async function lirePersonnagePrincipal(projectId: number, nomProjet: string) {
  const brief = await lireBriefOuVide(projectId, nomProjet);
  const lignes = await db
    .select({ code: assets.code, description: assets.description, fichier: assets.fichier })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage"), horsAffiches))
    .orderBy(assets.code);
  const registre = lignes.map((a) => ({
    code: a.code,
    description: a.description ?? "",
    aImage: imageActuelle({ id: 0, code: a.code, type: "personnage", fichier: a.fichier }) != null,
  }));
  const choix = personnagePrincipal(brief.statut === "partiel" ? [] : brief.contenu.personnages, registre);
  return choix ? { ...choix.asset, nom: choix.nom ?? choix.asset.code } : null;
}

/** Une rédaction de prompt par l'agent est-elle en file ou en cours pour cette affiche ? */
export async function redactionAfficheEnCours(projectId: number, code: string): Promise<boolean> {
  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.projectId, projectId),
        eq(agentRuns.but, "affiche"),
        eq(agentRuns.cleSousTache, code),
        inArray(agentRuns.statut, ["en_attente", "en_cours"]),
      ),
    )
    .limit(1);
  return run != null;
}
