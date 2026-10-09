import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations } from "../db/schema";
import { METHODE_TEST_AUDIO, METHODE_TEST_VIDEO } from "./asset-generation";
import { supprimerGenerationEtFichiers } from "./generation-sources";

/** Les TENTATIVES du ressenti (les vidéos de test d'une voix) sont temporaires : elles servent à juger une voix, pas à la garder.
 * Dès que la voix change — timbre retouché, repris du début, nouvelle voix de référence gardée ou déposée — elles ne disent plus rien
 * de la voix et partent toutes : celles qui sont prêtes, ratées, annulées ou encore en file. Celle qui est EN COURS de rendu est
 * laissée (ComfyUI la fait, la supprimer maintenant échouerait) ; la purge habituelle l'emportera plus tard.
 *
 * Reste la seule vidéo gardée, la « référence ressenti » (`voix_fiches.test_video`, un fichier à part sous voix/<id>/, pas une
 * génération) : elle n'est pas touchée ici. Quand la voix de référence change, elle est refaite par la resynchronisation
 * (`regenererApresChangementReference`, app/voix/actions.ts). Aucune dépendance à Next : partagé par l'application et le worker. */
export async function supprimerEssaisTest(assetId: number, mediaRoot: string): Promise<number> {
  const lignes = await db
    .select()
    .from(assetGenerations)
    .where(
      and(
        eq(assetGenerations.assetId, assetId),
        // Les tentatives ET leurs audios de test (la voix qui dit le texte d'un test, avant la vidéo) : l'un ne sert pas sans l'autre.
        inArray(assetGenerations.methode, [METHODE_TEST_VIDEO, METHODE_TEST_AUDIO]),
        inArray(assetGenerations.statut, ["en_attente", "termine", "echoue", "annulee"]),
      ),
    );
  for (const g of lignes) await supprimerGenerationEtFichiers(g, mediaRoot);
  return lignes.length;
}
