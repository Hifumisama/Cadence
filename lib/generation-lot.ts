import { raisonNonGenerable } from "./asset-generation";

/** Génération d'images EN LOT (registre d'assets, 2026-10-03) : on coche plusieurs assets et chacun part dans la file
 * avec son propre prompt. Règles pures ; l'action serveur (app/assets/generation-actions.ts) les applique.
 *
 * Deux vagues, parce qu'un dérivé en ÉDITION part de l'image de son master :
 * - 1re vague : tout asset qui a un prompt et se génère à partir du texte, et tout dérivé en édition dont le master
 *   a DÉJÀ une image ;
 * - 2e vague : les dérivés en édition dont le master n'a pas encore d'image. Ils sont écartés avec cette raison : une
 *   fois le master adopté, on relance le lot. */

/** Au-delà de ce nombre d'images en attente, un lot est tronqué (les suivantes se relancent). Plus large que le
 * plafond d'une demande isolée : remplir un registre au début d'un projet est exactement ce pour quoi un lot existe. */
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

export type LancementLot = { assetId: number; code: string; mode: "texte" | "images"; sourceAssetId: number | null };
export type EcarteLot = { assetId: number; code: string; raison: string };
export type PlanLot = { aLancer: LancementLot[]; ecartes: EcarteLot[] };

/** Décide, pour chaque asset coché, s'il part (et comment) ou pourquoi il est écarté. `tous` = les assets du projet
 * (pour retrouver le master d'un dérivé) ; `dejaEnFile` = ceux qui ont déjà une génération en attente ou en cours ;
 * `placesLibres` = ce que la file peut encore accepter. L'ordre de `selection` est conservé (masters avant dérivés). */
export function preparerLot(selection: AssetPourLot[], tous: AssetPourLot[], dejaEnFile: Set<number>, placesLibres: number): PlanLot {
  const parId = new Map(tous.map((a) => [a.id, a]));
  const aLancer: LancementLot[] = [];
  const ecartes: EcarteLot[] = [];
  const ecarte = (a: AssetPourLot, raison: string) => ecartes.push({ assetId: a.id, code: a.code, raison });

  // Masters d'abord : un dérivé peut ainsi se juger sur l'état du master tel qu'il est maintenant.
  const ordonnee = [...selection].sort((a, b) => Number(a.deriveDeId != null) - Number(b.deriveDeId != null));
  for (const a of ordonnee) {
    const raisonType = raisonNonGenerable(a);
    if (raisonType) {
      ecarte(a, raisonType);
      continue;
    }
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

/** Ce que l'écran propose de cocher d'office : les assets qui n'ont pas encore d'image et qui peuvent partir. */
export function selectionParDefaut(plan: PlanLot, tous: AssetPourLot[]): number[] {
  const sansImage = new Set(tous.filter((a) => !a.fichier).map((a) => a.id));
  return plan.aLancer.filter((l) => sansImage.has(l.assetId)).map((l) => l.assetId);
}
