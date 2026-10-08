import { db } from "../db";
import { assets, planRefs, repliques as tableRepliques, voixFiches } from "../db/schema";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { assetMediaSrc, voixMediaSrc } from "./media";
import { estSourceVoix, etatFiche, etatPhases, nomVoix } from "./voix";
import { langueFicheVoix } from "./langues-tts";
import { getEpisodesProjet, getOptionsLocuteur, getRepliquesProjet } from "./queries-repliques";

/** Requêtes du casting vocal (F06, CDC §6). Une voix est un asset de type
 * "voix" ; sa fiche de casting vit dans voix_fiches (voir db/schema.ts). Côté
 * serveur uniquement (accès disque pour résoudre les URL média). */

export type VoixCatalogueItem = Awaited<ReturnType<typeof getCastingCatalogue>>["voix"][number];

/** Ce qui est relié à une voix (voir `verdictSuppressionVoix` dans lib/voix.ts). */
export async function liensDeLaVoix(assetId: number, personnageId: number | null) {
  const [[citations], [directes], [duPersonnage]] = await Promise.all([
    db.select({ n: count() }).from(planRefs).where(eq(planRefs.assetId, assetId)),
    db.select({ n: count() }).from(tableRepliques).where(or(eq(tableRepliques.voixId, assetId), eq(tableRepliques.locuteurId, assetId))),
    personnageId == null
      ? Promise.resolve([{ n: 0 }])
      : db.select({ n: count() }).from(tableRepliques).where(eq(tableRepliques.locuteurId, personnageId)),
  ]);
  return { citations: citations?.n ?? 0, repliquesDirectes: directes?.n ?? 0, repliquesDuPersonnage: duPersonnage?.n ?? 0 };
}

/** Catalogue : toutes les voix du projet, avec de quoi afficher leur
 * avancement dans les quatre étapes sans ouvrir chaque fiche. */
export async function getCastingCatalogue(projectId: number) {
  const lesVoix = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.type, "voix")))
    .orderBy(assets.code);
  const ids = lesVoix.map((v) => v.id);

  const [fiches, repliques, personnages] = await Promise.all([
    ids.length ? db.select().from(voixFiches).where(inArray(voixFiches.assetId, ids)) : [],
    getRepliquesProjet(projectId),
    db
      .select({ id: assets.id, code: assets.code })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage")))
      .orderBy(assets.code),
  ]);

  const ficheParId = new Map(fiches.map((f) => [f.assetId, f]));
  const codePersonnage = new Map(personnages.map((p) => [p.id, p.code]));

  const voix = lesVoix.map((v) => {
    const fiche = ficheParId.get(v.id) ?? null;
    const sesRepliques = repliques.filter((r) => r.voix?.id === v.id);
    const source = fiche && estSourceVoix(fiche.source) ? fiche.source : "design";
    const personnageCode = fiche?.personnageId ? (codePersonnage.get(fiche.personnageId) ?? null) : null;
    return {
      ...v,
      source,
      personnageCode,
      // Le nom affiché (le code VOICE_* n'apparaît plus dans le casting) et l'état de la fiche (à créer / à valider / validée).
      nom: nomVoix({ code: v.code, personnageCode }),
      personnageNom: personnageCode ? nomVoix({ code: personnageCode }) : null,
      etat: etatFiche({ fichier: v.fichier, statut: v.statut }),
      langue: langueFicheVoix(fiche?.langue),
      refText: fiche?.refText ?? "",
      referenceSrc: assetMediaSrc(v.fichier),
      nbRepliques: sesRepliques.length,
      nbRepliquesMesurees: sesRepliques.filter((r) => r.dureeSecondes != null).length,
      phases: etatPhases({
        source,
        instruction: v.promptGeneration,
        referenceFichier: v.fichier,
        refText: fiche?.refText ?? "",
        statut: v.statut,
        testVideo: fiche?.testVideo ?? null,
        nbRepliques: sesRepliques.length,
        nbRepliquesMesurees: sesRepliques.filter((r) => r.dureeSecondes != null).length,
      }),
    };
  });

  return {
    voix,
    personnages,
    nbRepliques: repliques.length,
    nbRepliquesSansVoix: repliques.filter((r) => r.voix == null).length,
  };
}

export type VoixDetail = NonNullable<Awaited<ReturnType<typeof getVoixDetail>>>;

/** Fiche de casting complète d'une voix, retrouvée par son code d'asset. */
export async function getVoixDetail(projectId: number, code: string) {
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.code, code), eq(assets.type, "voix")));
  if (!asset) return null;

  const [[fiche], repliques, personnages, decors, episodes, optionsLocuteur] = await Promise.all([
    db.select().from(voixFiches).where(eq(voixFiches.assetId, asset.id)),
    getRepliquesProjet(projectId),
    db
      .select({ id: assets.id, code: assets.code, description: assets.description })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), eq(assets.type, "personnage")))
      .orderBy(assets.code),
    db
      .select({ id: assets.id, code: assets.code, description: assets.description })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), eq(assets.type, "decor")))
      .orderBy(assets.code),
    getEpisodesProjet(projectId),
    getOptionsLocuteur(projectId),
  ]);

  const ficheComplete = {
    personnageId: fiche?.personnageId ?? null,
    source: fiche && estSourceVoix(fiche.source) ? fiche.source : ("design" as const),
    langue: langueFicheVoix(fiche?.langue), // une ancienne valeur saisie à la main (« Français ») est remise au nom du moteur
    refText: fiche?.refText ?? "",
    testDecorId: fiche?.testDecorId ?? null,
    testPersonnageId: fiche?.testPersonnageId ?? null,
    testTexte: fiche?.testTexte ?? "",
    testAudio: fiche?.testAudio ?? null,
    testVideo: fiche?.testVideo ?? null,
  };

  const sesRepliques = repliques.filter((r) => r.voix?.id === asset.id);
  return {
    asset,
    fiche: ficheComplete,
    personnage: personnages.find((p) => p.id === ficheComplete.personnageId) ?? null,
    personnages,
    // Nom lisible et état de la fiche : dérivés ici, une seule fois (lib/voix.ts).
    nom: nomVoix({ code: asset.code, personnageCode: personnages.find((p) => p.id === ficheComplete.personnageId)?.code ?? null }),
    etat: etatFiche({ fichier: asset.fichier, statut: asset.statut }),
    decors,
    referenceSrc: assetMediaSrc(asset.fichier),
    testAudioSrc: voixMediaSrc(asset.id, ficheComplete.testAudio),
    testVideoSrc: voixMediaSrc(asset.id, ficheComplete.testVideo),
    // Les répliques de cette voix : celles de son personnage (voix déduite du
    // casting) et celles qui la citent directement (voix off). Aucun « caster/
    // délier » : pour changer la voix d'une réplique, on change son locuteur.
    repliques: sesRepliques,
    episodes,
    optionsLocuteur,
    // Locuteur proposé par défaut à une nouvelle réplique créée d'ici.
    locuteurParDefaut: ficheComplete.personnageId != null ? `p:${ficheComplete.personnageId}` : `v:${asset.id}`,
    phases: etatPhases({
      source: ficheComplete.source,
      instruction: asset.promptGeneration,
      referenceFichier: asset.fichier,
      refText: ficheComplete.refText,
      statut: asset.statut,
      testVideo: ficheComplete.testVideo,
      nbRepliques: sesRepliques.length,
      nbRepliquesMesurees: sesRepliques.filter((r) => r.dureeSecondes != null).length,
    }),
  };
}

/** L'asset voix visé par une action — null si l'id ne désigne pas une voix. */
export async function getVoixAsset(assetId: number) {
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.type, "voix")));
  return asset ?? null;
}
