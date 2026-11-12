import { intentionChangee } from "../clips/intent";
import { decouperSections, validerPromptColle } from "../clips/prompt";

/** Render history of a clip: choosing what to watch, comparing, and deciding what goes to final render. Pure
 * (no database nor disk access) — importable client-side. */

export type RenduVue = {
  id: number;
  numeroRendu: number;
  statut: string;
  cheminSortie: string | null;
  seedUtilisee: string | null;
  dureeUtilisee: number | null;
  promptUtilise: string | null;
  activerUpscale: boolean;
  /** Video already shot, dropped by hand: not a generation (no seed, no prompt). */
  importe: boolean;
};

/** A render that can be watched: finished AND with its file. */
export const estLisible = (r: RenduVue): boolean => r.statut === "termine" && !!r.cheminSortie;

/** The render requested in the URL if it is readable; otherwise the most recent readable one (the history is from newest to oldest). */
export function choisirRendu(rendus: RenduVue[], idDemande: number | null | undefined): RenduVue | null {
  const lisibles = rendus.filter(estLisible);
  return lisibles.find((r) => r.id === idDemande) ?? lisibles[0] ?? null;
}

/** The render to compare: readable, and distinct from the main one. */
export function choisirComparaison(rendus: RenduVue[], idDemande: number | null | undefined, principal: RenduVue | null): RenduVue | null {
  if (idDemande == null) return null;
  const r = rendus.find((x) => x.id === idDemande);
  return r && estLisible(r) && r.id !== principal?.id ? r : null;
}

const normaliser = (s: string) => s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();

/** Has the clip's prompt changed since this render? Without a recorded prompt (old renders), we do not know: no. */
export function promptDiffere(promptCourant: string, promptUtilise: string | null): boolean {
  if (!promptUtilise?.trim()) return false;
  return normaliser(promptCourant) !== normaliser(promptUtilise);
}

/** What, in the CONTENT of the clip, has changed since its last finished render: the assembled prompt, the generation duration.
 * Compared by VALUE (what the worker actually submitted, `promptUtilise` / `dureeUtilisee`), not by date: no extra
 * timestamp to keep. Without a recorded value (old renders, imported video), we do not know: nothing. */
export type RaisonPerime = "prompt" | "duree" | "intention" | "raccord";

/** `description` / `descriptionUtilisee` (optional): the clip's text today and that the render left from. If omitted, the intention is not judged
 * (the upscale of a render, `ficheChangeeDepuis`, only looks at the sheet). */
export function raisonsContenuPerime(
  courant: { prompt: string | null; duree: number | null; description?: string | null },
  rendu: { promptUtilise: string | null; dureeUtilisee: number | null; descriptionUtilisee?: string | null },
): RaisonPerime[] {
  const raisons: RaisonPerime[] = [];
  if (courant.prompt != null && promptDiffere(courant.prompt, rendu.promptUtilise)) raisons.push("prompt");
  if (courant.duree != null && rendu.dureeUtilisee != null && courant.duree !== rendu.dureeUtilisee) raisons.push("duree");
  if (courant.description !== undefined && intentionChangee(courant.description, rendu.descriptionUtilisee)) raisons.push("intention");
  return raisons;
}

const LIBELLE_RAISON_PERIME: Record<RaisonPerime, string> = { prompt: "prompt modifié", duree: "durée modifiée", intention: "intention modifiée", raccord: "raccord à refaire" };

/** A clip is stale if it has a changed reference OR changed content. */
export const estPerime = (p: { codes: string[]; raisons: RaisonPerime[] }): boolean => p.codes.length > 0 || p.raisons.length > 0;

/** « CHAR_maya, prompt modifié »: what is stale, in one line (clip film strip). */
export const resumerPerime = (p: { codes: string[]; raisons: RaisonPerime[] }): string => [...p.codes, ...p.raisons.map((r) => LIBELLE_RAISON_PERIME[r])].join(", ");

/** The alert sentence of the clip sheet. */
export function detailPerime(p: { codes: string[]; raisons: RaisonPerime[] }): string {
  const parts: string[] = [];
  if (p.codes.length > 0) parts.push(`${p.codes.join(", ")} ${p.codes.length > 1 ? "ont changé" : "a changé"}`);
  if (p.raisons.includes("prompt")) parts.push("le prompt a changé");
  if (p.raisons.includes("duree")) parts.push("la durée a changé");
  if (p.raisons.includes("intention")) parts.push("le texte du plan a changé");
  if (p.raisons.includes("raccord")) parts.push("le rendu du plan précédent a changé");
  return `${parts.join(" ; ")} depuis le dernier rendu : relance pour en tenir compte.`;
}

/** Why this render cannot be rendered as final (null = possible). Same seed + same prompt + same references + same
 * duration = same result: a seed is therefore needed. */
export function raisonNonRetenable(r: RenduVue): string | null {
  if (r.importe) return "Vidéo importée : elle n'a pas de seed, on ne peut pas la reproduire en rendu final.";
  if (!estLisible(r)) return "Ce rendu n'est pas terminé.";
  if (!r.seedUtilisee) return "Ce rendu n'a pas gardé sa seed.";
  return null;
}

/** The sections of a sent prompt (worker format: « section:\ncontenu »), ready to rewrite into the clip, or the reasons
 * why it cannot be restored. */
export function sectionsDuPromptEnvoye(promptUtilise: string): { ok: true; sections: Record<string, string> } | { ok: false; erreurs: string[] } {
  const { erreurs } = validerPromptColle(promptUtilise);
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, sections: decouperSections(promptUtilise) };
}
