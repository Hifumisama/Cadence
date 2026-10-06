import { db } from "../db";
import { assetGenerationSources, assetGenerations, assets } from "../db/schema";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { horsAffiches } from "./assets-visibles";
import { parametresTestVideo } from "./asset-generation";
import { estImage, fichierMediaExiste, generationMediaSrc, urlAssetMedia } from "./media";

/** Une image du registre proposable comme source d'une génération « à partir
 * d'images » : l'asset a une image présente sur le stockage. */
export type SourceDisponible = { id: number; code: string; type: string; src: string };

/** Assets du projet qui ont une image (hors l'asset courant, hors voix et sons) :
 * ce que le sélecteur de sources de la popup propose. Côté serveur uniquement
 * (accès disque). */
export async function getAssetsAvecImage(projectId: number, exceptAssetId: number): Promise<SourceDisponible[]> {
  const lignes = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, fichier: assets.fichier })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), isNotNull(assets.fichier), ne(assets.id, exceptAssetId), horsAffiches))
    .orderBy(asc(assets.code));
  return lignes
    .filter((a) => a.fichier && estImage(a.fichier) && fichierMediaExiste(a.fichier))
    .map((a) => ({ id: a.id, code: a.code, type: a.type, src: urlAssetMedia(a.fichier!) }));
}

/** L'image courante d'un asset, proposable comme source (le mode « à partir
 * d'images » la présélectionne), ou null s'il n'en a pas (ou si ce n'est pas une
 * image, ou si le fichier manque). Côté serveur uniquement (accès disque). */
export function imageActuelle(a: { id: number; code: string; type: string; fichier: string | null }): SourceDisponible | null {
  if (!a.fichier || !estImage(a.fichier) || !fichierMediaExiste(a.fichier)) return null;
  return { id: a.id, code: a.code, type: a.type, src: urlAssetMedia(a.fichier) };
}

/** Candidats d'image d'un asset, du plus récent au plus ancien, avec l'URL de
 * leur aperçu quand le fichier est sur le stockage. Côté serveur uniquement
 * (accès disque). */
export async function getGenerationsAsset(assetId: number) {
  const lignes = await db
    .select()
    .from(assetGenerations)
    .where(and(eq(assetGenerations.assetId, assetId), isNull(assetGenerations.repliqueId)))
    .orderBy(desc(assetGenerations.createdAt), desc(assetGenerations.id));
  // Provenance : les images sources de chaque génération « à partir d'images » (la 1re est la cible), par leur code
  // quand elles viennent du registre, « image importée » sinon.
  const sources =
    lignes.length === 0
      ? []
      : await db
          .select({ generationId: assetGenerationSources.generationId, position: assetGenerationSources.position, origine: assetGenerationSources.origine, code: assets.code })
          .from(assetGenerationSources)
          .leftJoin(assets, eq(assets.id, assetGenerationSources.assetId))
          .where(inArray(assetGenerationSources.generationId, lignes.map((g) => g.id)))
          .orderBy(asc(assetGenerationSources.position));
  const sourcesParGeneration = new Map<number, string[]>();
  for (const x of sources) {
    const liste = sourcesParGeneration.get(x.generationId) ?? [];
    liste.push(x.origine === "asset" && x.code ? x.code : "image importée");
    sourcesParGeneration.set(x.generationId, liste);
  }
  return lignes.map((g) => ({
    id: g.id,
    /** Codes des images de départ (la 1re est la cible), vide pour une génération à partir du texte. */
    sources: sourcesParGeneration.get(g.id) ?? [],
    uuid: g.uuid,
    statut: g.statut,
    methode: g.methode,
    aspect: g.aspect,
    megapixels: g.megapixels,
    loraPersonnage: g.loraPersonnage,
    /** Durée demandée (génération audio), null pour une image. */
    dureeSecondes: g.dureeSecondes,
    /** Génération de voix : le texte lu et la créativité demandée, null sinon. */
    texteReference: g.texteReference,
    temperature: g.temperature,
    erreur: g.erreur,
    /** Test vidéo d'une voix : rendu final (vrai) ou prévisualisation (faux) ; null pour toute autre génération. */
    upscale: parametresTestVideo(g.parametres)?.upscale ?? null,
    annulationDemandee: g.annulationDemandeeAt != null && g.statut === "en_cours",
    src: g.statut === "termine" ? generationMediaSrc(assetId, g.fichier) : null,
    // Progression relayée par le worker, tant que la demande est en cours. L'aperçu
    // est un fichier écrasé à chaque étape : `apercuAt` en fait une URL neuve.
    progression:
      g.statut === "en_cours" && g.progressionValeur != null && g.progressionMax
        ? { valeur: g.progressionValeur, max: g.progressionMax, etape: g.etapeLibelle }
        : null,
    apercuSrc:
      g.statut === "en_cours" && g.apercuAt
        ? (() => {
            const url = generationMediaSrc(assetId, g.apercuFichier);
            return url ? `${url}?v=${g.apercuAt.getTime()}` : null;
          })()
        : null,
    createdAt: g.createdAt.toISOString(),
  }));
}

export type GenerationVue = Awaited<ReturnType<typeof getGenerationsAsset>>[number];
