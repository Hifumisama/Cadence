import { decouperSections, validerPromptColle } from "./prompt";

/** Historique des rendus d'un plan : choisir ce qu'on regarde, comparer, et décider ce qui part en rendu final. Pur
 * (aucun accès base ni disque) — importable côté client. */

export type RenduVue = {
  id: number;
  numeroRendu: number;
  statut: string;
  cheminSortie: string | null;
  seedUtilisee: string | null;
  dureeUtilisee: number | null;
  promptUtilise: string | null;
  activerUpscale: boolean;
  /** Vidéo déjà tournée, déposée à la main : pas une génération (ni seed, ni prompt). */
  importe: boolean;
};

/** Un rendu qu'on peut regarder : terminé ET avec son fichier. */
export const estLisible = (r: RenduVue): boolean => r.statut === "termine" && !!r.cheminSortie;

/** Le rendu demandé dans l'URL s'il est lisible ; sinon le plus récent lisible (l'historique est du plus récent au plus ancien). */
export function choisirRendu(rendus: RenduVue[], idDemande: number | null | undefined): RenduVue | null {
  const lisibles = rendus.filter(estLisible);
  return lisibles.find((r) => r.id === idDemande) ?? lisibles[0] ?? null;
}

/** Le rendu à comparer : lisible, et distinct du principal. */
export function choisirComparaison(rendus: RenduVue[], idDemande: number | null | undefined, principal: RenduVue | null): RenduVue | null {
  if (idDemande == null) return null;
  const r = rendus.find((x) => x.id === idDemande);
  return r && estLisible(r) && r.id !== principal?.id ? r : null;
}

const normaliser = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();

/** Le prompt du plan a-t-il changé depuis ce rendu ? Sans prompt enregistré (anciens rendus), on ne sait pas : non. */
export function promptDiffere(promptCourant: string, promptUtilise: string | null): boolean {
  if (!promptUtilise?.trim()) return false;
  return normaliser(promptCourant) !== normaliser(promptUtilise);
}

/** Ce qui, dans le CONTENU du plan, a changé depuis son dernier rendu terminé : le prompt assemblé, la durée de génération.
 * Comparé par VALEUR (ce que le worker a réellement soumis, `promptUtilise` / `dureeUtilisee`), pas par date : aucun
 * horodatage de plus à tenir. Sans valeur enregistrée (anciens rendus, vidéo importée), on ne sait pas : rien. */
export type RaisonPerime = "prompt" | "duree";

export function raisonsContenuPerime(
  courant: { prompt: string | null; duree: number | null },
  rendu: { promptUtilise: string | null; dureeUtilisee: number | null },
): RaisonPerime[] {
  const raisons: RaisonPerime[] = [];
  if (courant.prompt != null && promptDiffere(courant.prompt, rendu.promptUtilise)) raisons.push("prompt");
  if (courant.duree != null && rendu.dureeUtilisee != null && courant.duree !== rendu.dureeUtilisee) raisons.push("duree");
  return raisons;
}

export const LIBELLE_RAISON_PERIME: Record<RaisonPerime, string> = { prompt: "prompt modifié", duree: "durée modifiée" };

/** Un plan est périmé s'il a une référence changée OU un contenu changé. */
export const estPerime = (p: { codes: string[]; raisons: RaisonPerime[] }): boolean => p.codes.length > 0 || p.raisons.length > 0;

/** « CHAR_maya, prompt modifié » : ce qui est périmé, en une ligne (frise des plans). */
export const resumerPerime = (p: { codes: string[]; raisons: RaisonPerime[] }): string => [...p.codes, ...p.raisons.map((r) => LIBELLE_RAISON_PERIME[r])].join(", ");

/** La phrase de l'alerte de la fiche de plan. */
export function detailPerime(p: { codes: string[]; raisons: RaisonPerime[] }): string {
  const parts: string[] = [];
  if (p.codes.length > 0) parts.push(`${p.codes.join(", ")} ${p.codes.length > 1 ? "ont changé" : "a changé"}`);
  if (p.raisons.includes("prompt")) parts.push("le prompt a changé");
  if (p.raisons.includes("duree")) parts.push("la durée a changé");
  return `${parts.join(" ; ")} depuis le dernier rendu : relance pour en tenir compte.`;
}

/** Pourquoi on ne peut pas rendre ce rendu en final (null = possible). Même seed + même prompt + mêmes références + même
 * durée = même résultat : il faut donc une seed. */
export function raisonNonRetenable(r: RenduVue): string | null {
  if (r.importe) return "Vidéo importée : elle n'a pas de seed, on ne peut pas la reproduire en rendu final.";
  if (!estLisible(r)) return "Ce rendu n'est pas terminé.";
  if (!r.seedUtilisee) return "Ce rendu n'a pas gardé sa seed.";
  return null;
}

/** Les sections d'un prompt envoyé (format du worker : « section:\ncontenu »), prêtes à réécrire dans le plan, ou les raisons
 * pour lesquelles on ne peut pas le restaurer. */
export function sectionsDuPromptEnvoye(promptUtilise: string): { ok: true; sections: Record<string, string> } | { ok: false; erreurs: string[] } {
  const { erreurs } = validerPromptColle(promptUtilise);
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, sections: decouperSections(promptUtilise) };
}
