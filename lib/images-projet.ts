import { raisonNonGenerable } from "./asset-generation";
import { preparerLot, type AssetPourLot } from "./generation-lot";

/** Où en sont les IMAGES de référence d'un projet (2026-10-12). Définition UNIQUE, partagée par le clap final de la préparation,
 * le bandeau « Prochaine étape » et le registre d'assets. Règles pures (sans base ni disque) ; la lecture en base est dans
 * lib/queries-images.ts.
 *
 * Un asset « à illustrer » est un asset dont l'image de référence se génère : tout sauf une voix (casting vocal) et un son
 * (génération audio), c'est-à-dire exactement ce que `raisonNonGenerable` accepte. Il « a une image » quand `fichier` est
 * renseigné ; sans image sinon. Rien n'est versionné (F01) : un asset a une image ou n'en a pas. */

export type EtatImages = {
  /** Assets à illustrer (personnages, décors, props, vfx, keyframes, autres). */
  total: number;
  avecImage: number;
  sansImage: number;
  /** Parmi les sans-image : une génération attend déjà dans la file ou tourne. */
  enFile: number;
  /** Parmi les sans-image : ce qu'un « tout générer » mettrait en file maintenant. */
  aLancer: number;
  /** Parmi les sans-image : des dérivés en édition qui attendent l'image de leur master (2e vague : relancer ensuite). */
  attendentMaitre: number;
  /** Parmi les sans-image : pas de prompt, rien à générer tant qu'il n'est pas écrit. */
  sansPrompt: number;
};

/** Un asset compte-t-il parmi ceux qu'on illustre ? */
export const estAIllustrer = (a: { type: string }): boolean => raisonNonGenerable(a) === null;

/** Ids des assets à illustrer qui n'ont pas d'image (ce que « tout générer » propose au lot). */
export function idsSansImage(assets: Pick<AssetPourLot, "id" | "type" | "fichier">[]): number[] {
  return assets.filter((a) => estAIllustrer(a) && !a.fichier).map((a) => a.id);
}

/** `enFile` : assets du projet qui ont une génération en attente ou en cours. `placesLibres` : ce que la file peut encore accepter
 * (PLAFOND_LOT_IMAGES moins les images déjà en attente). */
export function etatImages(assets: AssetPourLot[], enFile: Set<number>, placesLibres: number): EtatImages {
  const aIllustrer = assets.filter(estAIllustrer);
  const sans = aIllustrer.filter((a) => !a.fichier);
  const parId = new Map(assets.map((a) => [a.id, a]));
  const candidats = sans.filter((a) => !enFile.has(a.id));
  const plan = preparerLot(candidats, assets, enFile, placesLibres);
  const aPrompt = (a: AssetPourLot) => (a.promptGeneration ?? "").trim() !== "";
  const attendMaitre = (a: AssetPourLot) => {
    if (a.methodeGeneration !== "edition" || a.deriveDeId == null) return false;
    const master = parId.get(a.deriveDeId);
    return master != null && !master.fichier;
  };
  return {
    total: aIllustrer.length,
    avecImage: aIllustrer.length - sans.length,
    sansImage: sans.length,
    enFile: sans.filter((a) => enFile.has(a.id)).length,
    aLancer: plan.aLancer.length,
    attendentMaitre: candidats.filter((a) => aPrompt(a) && attendMaitre(a)).length,
    sansPrompt: candidats.filter((a) => !aPrompt(a)).length,
  };
}

/** « 3 sur 12 ont une image » / « 0 image générée sur 12 »… : la phrase de compte, la même partout. */
export function phraseCompteImages(e: EtatImages): string {
  return `${e.total} asset${e.total > 1 ? "s" : ""} décrit${e.total > 1 ? "s" : ""}, ${e.avecImage} image${e.avecImage > 1 ? "s" : ""} générée${e.avecImage > 1 ? "s" : ""}`;
}

/** Libellé du bouton « tout générer » pour n images. */
export const libelleGenererImages = (n: number): string => (n === 1 ? "Générer l’image" : `Générer les ${n} images`);

// ---------------------------------------------------------------------------
// Bandeau « Prochaine étape » (page du projet). Une LISTE d'étapes dans l'ordre de la production : la première non terminée est
// mise en avant, les suivantes s'y ajouteront (voix, plans) sans réécrire le bandeau. Seule l'étape « images » existe pour l'instant.
// ---------------------------------------------------------------------------

export type EtapeSuivante = {
  cle: "images";
  titre: string;
  faites: number;
  total: number;
  terminee: boolean;
  /** Où l'étape se travaille. */
  href: string;
  libelleLien: string;
};

export function etapesSuivantes(projectId: number, images: EtatImages): EtapeSuivante[] {
  return [
    {
      cle: "images",
      titre: "Les images de référence",
      faites: images.avecImage,
      total: images.total,
      terminee: images.sansImage === 0,
      href: `/p/${projectId}/assets`,
      libelleLien: "Ouvrir le registre",
    },
  ];
}

/** L'étape mise en avant : la première qui n'est pas terminée, ou null quand tout est fait (le bandeau disparaît). */
export const prochaineEtape = (etapes: EtapeSuivante[]): EtapeSuivante | null => etapes.find((e) => !e.terminee) ?? null;
