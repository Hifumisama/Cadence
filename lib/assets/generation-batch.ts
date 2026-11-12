
/** Image generation IN BATCH (asset registry, 2026-10-03): we tick several assets and each goes into the queue
 * with its own prompt. Pure rules; the server action (app/assets/generation-actions.ts) applies them.
 *
 * Two waves, because a derivative in EDIT starts from its master's image:
 * - 1st wave: every asset that has a prompt and is generated from text, and every derivative in edit whose master
 *   ALREADY has an image;
 * - 2nd wave: the derivatives in edit whose master has no image yet. They are set aside with this reason: once
 *   the master is adopted, we relaunch the batch. */

/** Beyond this number of images waiting, a batch is truncated (the next ones are relaunched). Wider than the
 * ceiling of an isolated request: filling a registry at the start of a project is exactly what a batch exists for. */
export const PLAFOND_LOT_IMAGES = 30;

export type AssetPourLot = {
  id: number;
  code: string;
  type: string;
  promptGeneration: string | null;
  methodeGeneration: string | null;
  fichier: string | null;
  deriveDeId: number | null;
};

type LancementLot = { assetId: number; code: string; mode: "texte" | "images"; sourceAssetId: number | null };
export type EcarteLot = { assetId: number; code: string; raison: string };
export type PlanLot = { aLancer: LancementLot[]; ecartes: EcarteLot[] };

/** Decides, for each ticked asset, whether it goes (and how) or why it is set aside. `tous` = the project's assets
 * (to find a derivative's master); `dejaEnFile` = those that already have a generation waiting or running;
 * `placesLibres` = what the queue can still accept. The order of `selection` is kept (masters before derivatives). */
export function preparerLot(selection: AssetPourLot[], tous: AssetPourLot[], dejaEnFile: Set<number>, placesLibres: number): PlanLot {
  const parId = new Map(tous.map((a) => [a.id, a]));
  const aLancer: LancementLot[] = [];
  const ecartes: EcarteLot[] = [];
  const ecarte = (a: AssetPourLot, raison: string) => ecartes.push({ assetId: a.id, code: a.code, raison });

  // Masters first: a derivative can thus be judged on the master's state as it is now.
  const ordonnee = [...selection].sort((a, b) => Number(a.deriveDeId != null) - Number(b.deriveDeId != null));
  for (const a of ordonnee) {
    if (!(a.promptGeneration ?? "").trim()) {
      ecarte(a, "pas de prompt : écris-le (ou demande-le à l'agent) avant de générer.");
      continue;
    }
    if (dejaEnFile.has(a.id)) {
      ecarte(a, "une génération de cet asset attend déjà dans la file.");
      continue;
    }
    if (a.methodeGeneration === "edition") {
      const master = a.deriveDeId != null ? parId.get(a.deriveDeId) : undefined;
      if (!master) {
        ecarte(a, "édition sans master : il n'y a pas d'image de départ.");
        continue;
      }
      if (!master.fichier) {
        ecarte(a, `attend l'image de son master (${master.code}) : génère-la et adopte-la d'abord, puis relance le lot.`);
        continue;
      }
      if (aLancer.length >= placesLibres) {
        ecarte(a, "la file est pleine : relance le lot quand elle se sera vidée.");
        continue;
      }
      aLancer.push({ assetId: a.id, code: a.code, mode: "images", sourceAssetId: master.id });
      continue;
    }
    if (aLancer.length >= placesLibres) {
      ecarte(a, "la file est pleine : relance le lot quand elle se sera vidée.");
      continue;
    }
    aLancer.push({ assetId: a.id, code: a.code, mode: "texte", sourceAssetId: null });
  }
  return { aLancer, ecartes };
}
