import type { CibleDemandee, Portee } from "./types";

/** A SINGLE entry point to the agent (2026-10-03, feedback from the general test): the "Agent" button in the banner infers the
 * scope from the PAGE you are on, always the smallest that applies there (a clip, an asset, an episode, otherwise the
 * project). The user can widen it with one click (clip → its episode → the project); they never choose "a scope"
 * cold. Pure, tested: reading the URL touches neither the database nor the DOM. */

export type DemandePage = {
  projectId: number;
  portee: Portee;
  cible: CibleDemandee | null;
  /** Direct view (the assets page opens the registry). */
  vue?: "registre";
  /** The page's episode (used to place a new clip, and to widen a clip to its episode). */
  episodeId?: number;
  planUuid?: string;
};

const entier = (s: string | undefined): number | null => (s && /^\d+$/.test(s) ? Number(s) : null);

/** The most precise request for this page, or null outside a project (home, lists). */
export function demandeDepuisChemin(chemin: string): DemandePage | null {
  const seg = chemin.split("?")[0]!.split("/").filter(Boolean);
  if (seg[0] !== "p") return null;
  const projectId = entier(seg[1]);
  if (projectId == null) return null;

  if (seg[2] === "assets") {
    const code = seg[3] ? decodeURIComponent(seg[3]) : null;
    return code ? { projectId, portee: "asset", cible: { code } } : { projectId, portee: "projet", cible: null, vue: "registre" };
  }
  if (seg[2] === "e") {
    const episodeId = entier(seg[3]);
    if (episodeId == null) return { projectId, portee: "projet", cible: null };
    if (seg[4] === "montage" && seg[5] && /^[0-9a-f-]{36}$/i.test(seg[5])) {
      return { projectId, portee: "plan", cible: { uuid: seg[5] }, episodeId, planUuid: seg[5] };
    }
    return { projectId, portee: "episode", cible: { id: episodeId }, episodeId };
  }
  return { projectId, portee: "projet", cible: null };
}
