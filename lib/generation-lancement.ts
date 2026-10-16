import { db } from "@/db";
import { assetGenerationSources, assetGenerations, assets, projects } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { formatParDefaut, loraParDefaut, nouvelleSeed, raisonDemandeInvalide, raisonNonGenerable, type DemandeGeneration } from "./asset-generation";
import { styleDesImages } from "./conception";
import { PLAFOND_LOT_IMAGES, preparerLot, type EcarteLot } from "./generation-lot";
import { MEDIA_ROOT, cheminAssetMedia, cheminSourceImportMedia, estImage, estNomSourceImport } from "./media";
import { nbImagesEnAttente, rangDansLaFile } from "./queries-taches";
import { PLAFOND_FILE_IMAGES } from "./taches";

// Mise en file des générations d'images, SANS Next (ni revalidatePath) : le worker l'appelle aussi (images lancées
// toutes seules pendant la création d'un projet, voir lib/images-auto.ts). Les actions serveur de
// app/assets/generation-actions.ts l'enveloppent et rafraîchissent l'écran.

/** `position` : 1 = la génération part tout de suite ; n = n-1 tâches passent devant. */
export type ResultatLancement = { ok: true; position: number } | { ok: false; erreur: string };

async function existe(chemin: string): Promise<boolean> {
  try {
    await access(chemin);
    return true;
  } catch {
    return false;
  }
}

/** Source résolue au lancement : le nom de fichier est un instantané (voir
 * assetGenerationSources). */
type SourceResolue = { origine: "asset" | "import"; assetId: number | null; fichier: string };

/** Pose une demande dans la file : plusieurs générations peuvent attendre (même
 * pour un seul asset), jusqu'à PLAFOND_FILE_IMAGES en attente au total. */
export async function poserGeneration(assetId: number, demande: DemandeGeneration, plafond: number = PLAFOND_FILE_IMAGES, adoptionAuto = false): Promise<ResultatLancement> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const raisonAsset = raisonNonGenerable(asset);
  if (raisonAsset) return { ok: false, erreur: raisonAsset };
  const raison = raisonDemandeInvalide(demande);
  if (raison) return { ok: false, erreur: raison };
  if ((await nbImagesEnAttente()) >= plafond) {
    return { ok: false, erreur: `La file est pleine (${plafond} images en attente) : laisse le worker en vider quelques-unes.` };
  }

  const prompt = demande.prompt.trim();
  const sources: SourceResolue[] = [];

  if (demande.mode === "images") {
    for (const [i, src] of demande.sources.entries()) {
      if (src.origine === "asset") {
        const [source] = await db.select().from(assets).where(eq(assets.id, src.assetId));
        if (!source || source.projectId !== asset.projectId) {
          return { ok: false, erreur: `Image ${i + 1} : cet asset n'existe pas dans le projet.` };
        }
        if (!source.fichier) return { ok: false, erreur: `Image ${i + 1} : « ${source.code} » n'a pas encore d'image.` };
        if (!estImage(source.fichier)) return { ok: false, erreur: `Image ${i + 1} : « ${source.code} » n'est pas une image.` };
        if (!(await existe(join(MEDIA_ROOT, cheminAssetMedia(source.fichier))))) {
          return { ok: false, erreur: `Image ${i + 1} : le fichier de « ${source.code} » est introuvable sur le stockage.` };
        }
        sources.push({ origine: "asset", assetId: source.id, fichier: source.fichier });
      } else {
        if (!estNomSourceImport(src.fichier)) return { ok: false, erreur: `Image ${i + 1} : nom de fichier invalide.` };
        if (!(await existe(join(MEDIA_ROOT, cheminSourceImportMedia(assetId, src.fichier))))) {
          return { ok: false, erreur: `Image ${i + 1} : l'image importée n'est plus disponible, dépose-la à nouveau.` };
        }
        sources.push({ origine: "import", assetId: null, fichier: src.fichier });
      }
    }
  }

  const [projet] = await db.select({ clauseStyle: projects.clauseStyle, stylePromptImage: projects.stylePromptImage }).from(projects).where(eq(projects.id, asset.projectId));
  const texte = demande.mode === "texte";

  const genId = await db.transaction(async (tx) => {
    const [gen] = await tx
      .insert(assetGenerations)
      .values({
        assetId,
        methode: texte ? "generation" : "edition",
        prompt,
        // Instantané de ce qui est soumis : la clause de style et le format ne
        // concernent que le mode texte (l'édition suit l'image 1, sans style).
        // Les images reçoivent le prompt LONG du style quand le projet en a un (conception), sinon la clause courte.
        clauseStyle: texte ? styleDesImages(projet) : "",
        ...(texte ? { aspect: demande.aspect, megapixels: demande.megapixels } : {}),
        loraPersonnage: texte ? demande.loraPersonnage : false,
        lightning: texte ? null : true,
        seed: nouvelleSeed(),
        adoptionAuto,
      })
      .returning({ id: assetGenerations.id });
    if (sources.length > 0) {
      await tx.insert(assetGenerationSources).values(
        sources.map((s, i) => ({ generationId: gen!.id, position: i + 1, origine: s.origine, assetId: s.assetId, fichier: s.fichier })),
      );
    }
    return gen!.id;
  });
  return { ok: true, position: await rangDansLaFile(genId) };
}

/** Génération EN LOT (registre d'assets) : chaque asset coché part dans la file avec SON prompt, au format par défaut
 * de son type (texte), ou en édition à partir de l'image de son master (dérivé). Les assets qui ne peuvent pas partir
 * (voix, son, sans prompt, déjà en file, dérivé dont le master n'a pas d'image) sont rendus avec leur raison : rien
 * n'est silencieusement ignoré. Règles dans lib/generation-lot.ts. */
export async function poserGenerationsLot(
  projectId: number,
  assetIds: number[],
): Promise<{ ok: true; lancees: number; ecartes: EcarteLot[] } | { ok: false; erreur: string }> {
  if (assetIds.length === 0) return { ok: false, erreur: "Coche au moins un asset." };
  const tous = await db.select().from(assets).where(eq(assets.projectId, projectId));
  const voulus = new Set(assetIds);
  const selection = tous.filter((a) => voulus.has(a.id));
  if (selection.length !== voulus.size) return { ok: false, erreur: "Un des assets cochés n'existe plus dans ce projet." };
  const enFile = await db
    .select({ assetId: assetGenerations.assetId })
    .from(assetGenerations)
    .where(and(inArray(assetGenerations.assetId, tous.map((a) => a.id)), inArray(assetGenerations.statut, ["en_attente", "en_cours"])));
  const plan = preparerLot(selection, tous, new Set(enFile.map((g) => g.assetId)), Math.max(0, PLAFOND_LOT_IMAGES - (await nbImagesEnAttente())));

  let lancees = 0;
  const ecartes = [...plan.ecartes];
  for (const l of plan.aLancer) {
    const a = tous.find((x) => x.id === l.assetId)!;
    const format = formatParDefaut(a.type);
    const r = await poserGeneration(
      a.id,
      {
        mode: l.mode,
        prompt: a.promptGeneration ?? "",
        aspect: format.aspect,
        megapixels: format.megapixels,
        loraPersonnage: l.mode === "texte" && loraParDefaut(a.type),
        sources: l.sourceAssetId != null ? [{ origine: "asset", assetId: l.sourceAssetId }] : [],
      },
      PLAFOND_LOT_IMAGES,
      true, // un lot : le résultat est adopté tout seul à la fin de la génération
    );
    if (r.ok) lancees += 1;
    else ecartes.push({ assetId: a.id, code: a.code, raison: r.erreur });
  }
  return { ok: true, lancees, ecartes };
}

