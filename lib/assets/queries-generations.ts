import { db } from "../../db";
import { assetGenerationSources, assetGenerations, assets } from "../../db/schema";
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { horsAffiches } from "./assets-visible";
import { estImage, fichierMediaExiste, generationMediaSrc, sourceImportMediaSrc, urlAssetMedia } from "../media";

/** An image from the registry that can be offered as a source of a « à partir
 * d'images » generation: the asset has an image present on storage. */
export type SourceDisponible = { id: number; code: string; type: string; src: string };

/** Project assets that have an image (except the current asset, except voices and sounds):
 * what the source selector of the popup offers. Server-side only
 * (disk access). */
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

/** The current image of an asset, offered as a source (the « à partir
 * d'images » mode preselects it), or null if it has none (or if it is not an
 * image, or if the file is missing). Server-side only (disk access). */
export function imageActuelle(a: { id: number; code: string; type: string; fichier: string | null }): SourceDisponible | null {
  if (!a.fichier || !estImage(a.fichier) || !fichierMediaExiste(a.fichier)) return null;
  return { id: a.id, code: a.code, type: a.type, src: urlAssetMedia(a.fichier) };
}

/** Image candidates of an asset, from the newest to the oldest, with the URL of
 * their preview when the file is on storage. Server-side only
 * (disk access). */
export async function getGenerationsAsset(assetId: number) {
  const lignes = await db
    .select()
    .from(assetGenerations)
    .where(eq(assetGenerations.assetId, assetId))
    .orderBy(desc(assetGenerations.createdAt), desc(assetGenerations.id));
  // Provenance: the source images of each « à partir d'images » generation (the 1st is the target), by their code
  // when they come from the registry, « image importée » otherwise.
  const sources =
    lignes.length === 0
      ? []
      : await db
          .select({ generationId: assetGenerationSources.generationId, position: assetGenerationSources.position, origine: assetGenerationSources.origine, fichier: assetGenerationSources.fichier, code: assets.code })
          .from(assetGenerationSources)
          .leftJoin(assets, eq(assets.id, assetGenerationSources.assetId))
          .where(inArray(assetGenerationSources.generationId, lignes.map((g) => g.id)))
          .orderBy(asc(assetGenerationSources.position));
  const sourcesParGeneration = new Map<number, string[]>();
  // The image the attempt left from (source 1): the attempt photographed it, it no longer moves.
  const baseParGeneration = new Map<number, string>();
  const jointesParGeneration = new Map<number, string[]>();
  for (const x of sources) {
    const src = x.origine === "import" ? sourceImportMediaSrc(assetId, x.fichier) : x.fichier ? urlAssetMedia(x.fichier) : null;
    if (!src) continue;
    if (x.position === 1) baseParGeneration.set(x.generationId, src);
    else jointesParGeneration.set(x.generationId, [...(jointesParGeneration.get(x.generationId) ?? []), src]);
  }
  for (const x of sources) {
    const liste = sourcesParGeneration.get(x.generationId) ?? [];
    liste.push(x.origine === "asset" && x.code ? x.code : "image importée");
    sourcesParGeneration.set(x.generationId, liste);
  }
  return lignes.map((g) => ({
    id: g.id,
    /** Codes of the starting images (the 1st is the target), empty for a generation from text. */
    sources: sourcesParGeneration.get(g.id) ?? [],
    /** The image the attempt left from (null: it was born from text, or the base is no longer on storage). */
    baseSrc: baseParGeneration.get(g.id) ?? null,
    /** Images 2 and 3 of the attempt (attached by the user), in order. */
    jointesSrc: jointesParGeneration.get(g.id) ?? [],
    /** The user's French instruction (null: attempt without instruction, batch or old attempt). */
    consigne: g.consigne,
    /** The prompt sent to the model (empty as long as the instruction is not translated). */
    prompt: g.prompt,
    /** When the attempt became the asset's image (ms), null if it did not. */
    adopteAt: g.adopteAt ? g.adopteAt.getTime() : null,
    uuid: g.uuid,
    statut: g.statut,
    methode: g.methode,
    aspect: g.aspect,
    megapixels: g.megapixels,
    erreur: g.erreur,
    annulationDemandee: g.annulationDemandeeAt != null && g.statut === "en_cours",
    src: g.statut === "termine" ? generationMediaSrc(assetId, g.fichier) : null,
    // Progress relayed by the worker, as long as the request is in progress. The preview
    // is a file overwritten at each step: `apercuAt` makes it a fresh URL.
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
