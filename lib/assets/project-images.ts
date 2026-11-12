import { preparerLot, type AssetPourLot } from "./generation-batch";

/** Where the reference IMAGES of a project stand (2026-10-12). A SINGLE definition, shared by the final clap of the preparation,
 * the « Prochaine étape » banner and the asset registry. Pure rules (without database nor disk); the database read is in
 * lib/assets/queries-images.ts.
 *
 * Every asset is « to illustrate » (its reference image is generated). It « has an image » when `fichier` is
 * filled in; without an image otherwise. Nothing is versioned (F01): an asset has an image or it does not. */

export type EtatImages = {
  /** Assets to illustrate (characters, sets, props, vfx, keyframes, others). */
  total: number;
  avecImage: number;
  sansImage: number;
  /** Among those without image: a generation is already waiting in the queue or running. */
  enFile: number;
  /** Among those without image: what a « tout générer » would queue now. */
  aLancer: number;
  /** Among those without image: edit derivatives waiting for their master's image (2nd wave: relaunch afterwards). */
  attendentMaitre: number;
  /** Among those without image: no prompt, nothing to generate until it is written. */
  sansPrompt: number;
};

/** Ids of the assets to illustrate that have no image (what « tout générer » proposes to the batch). */
export function idsSansImage(assets: Pick<AssetPourLot, "id" | "type" | "fichier">[]): number[] {
  return assets.filter((a) => !a.fichier).map((a) => a.id);
}

/** `enFile`: project assets that have a generation waiting or running. `placesLibres`: what the queue can still accept
 * (PLAFOND_LOT_IMAGES minus the images already waiting). */
export function etatImages(assets: AssetPourLot[], enFile: Set<number>, placesLibres: number): EtatImages {
  const aIllustrer = assets;
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

/** « 3 sur 12 ont une image » / « 0 image générée sur 12 »…: the count phrase, the same everywhere. */
export function phraseCompteImages(e: EtatImages): string {
  return `${e.total} asset${e.total > 1 ? "s" : ""} décrit${e.total > 1 ? "s" : ""}, ${e.avecImage} image${e.avecImage > 1 ? "s" : ""} générée${e.avecImage > 1 ? "s" : ""}`;
}

/** Label of the « tout générer » button for n images. */
export const libelleGenererImages = (n: number): string => (n === 1 ? "Générer l’image" : `Générer les ${n} images`);

// ---------------------------------------------------------------------------
// « Prochaine étape » banner (project page). A LIST of steps in production order: the first unfinished one is
// highlighted, the following ones will be added there (voice, clips) without rewriting the banner. Only the « images » step exists for now.
// ---------------------------------------------------------------------------

export type EtapeSuivante = {
  cle: "images";
  titre: string;
  faites: number;
  total: number;
  terminee: boolean;
  /** Where the step is worked on. */
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

/** The highlighted step: the first one that is not finished, or null when everything is done (the banner disappears). */
export const prochaineEtape = (etapes: EtapeSuivante[]): EtapeSuivante | null => etapes.find((e) => !e.terminee) ?? null;
