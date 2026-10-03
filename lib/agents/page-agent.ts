import type { CibleDemandee, Portee } from "./types";

/** Un SEUL point d'accès à l'agent (2026-10-03, retours du test général) : le bouton « Agent » du bandeau déduit la
 * portée de la PAGE où l'on se trouve, toujours la plus petite qui s'y applique (un plan, un asset, un épisode, sinon le
 * projet). L'utilisateur peut l'élargir d'un clic (le plan → son épisode → le projet) ; il ne choisit jamais « une portée »
 * à froid. Pur, testé : la lecture de l'URL ne touche ni la base ni le DOM. */

export type DemandePage = {
  projectId: number;
  portee: Portee;
  cible: CibleDemandee | null;
  /** Vue directe (la page des assets ouvre le registre, la page des voix le casting). */
  vue?: "registre" | "voix";
  /** Épisode de la page (sert à placer un nouveau plan, et à élargir un plan vers son épisode). */
  episodeId?: number;
  planUuid?: string;
};

export type PorteePage = { cle: string; libelle: string; demande: DemandePage };

const entier = (s: string | undefined): number | null => (s && /^\d+$/.test(s) ? Number(s) : null);

/** La demande la plus précise pour cette page, ou null hors d'un projet (accueil, listes). */
export function demandeDepuisChemin(chemin: string): DemandePage | null {
  const seg = chemin.split("?")[0]!.split("/").filter(Boolean);
  if (seg[0] !== "p") return null;
  const projectId = entier(seg[1]);
  if (projectId == null) return null;

  if (seg[2] === "assets") {
    const code = seg[3] ? decodeURIComponent(seg[3]) : null;
    return code ? { projectId, portee: "asset", cible: { code } } : { projectId, portee: "projet", cible: null, vue: "registre" };
  }
  if (seg[2] === "voix") return { projectId, portee: "projet", cible: null, vue: "voix" };
  if (seg[2] === "e") {
    const episodeId = entier(seg[3]);
    if (episodeId == null) return { projectId, portee: "projet", cible: null };
    if (seg[4] === "plans" && seg[5] && /^[0-9a-f-]{36}$/i.test(seg[5])) {
      return { projectId, portee: "plan", cible: { uuid: seg[5] }, episodeId, planUuid: seg[5] };
    }
    return { projectId, portee: "episode", cible: { id: episodeId }, episodeId };
  }
  return { projectId, portee: "projet", cible: null };
}

const LIBELLE_PORTEE: Record<Portee, string> = { projet: "Tout le projet", saison: "Cette saison", episode: "Cet épisode", plan: "Ce plan", asset: "Cet asset" };

/** Les portées proposées pour cette page, de la plus petite (par défaut) à la plus large : un plan s'élargit à son
 * épisode puis au projet, un épisode au projet, un asset au projet. */
export function porteesDepuisChemin(chemin: string): PorteePage[] {
  const d = demandeDepuisChemin(chemin);
  if (!d) return [];
  const liste: PorteePage[] = [{ cle: `${d.portee}:${JSON.stringify(d.cible)}`, libelle: LIBELLE_PORTEE[d.portee], demande: d }];
  if (d.portee === "plan" && d.episodeId != null) {
    const ep: DemandePage = { projectId: d.projectId, portee: "episode", cible: { id: d.episodeId }, episodeId: d.episodeId };
    liste.push({ cle: `episode:${d.episodeId}`, libelle: LIBELLE_PORTEE.episode, demande: ep });
  }
  if (d.portee !== "projet") {
    const p: DemandePage = { projectId: d.projectId, portee: "projet", cible: null };
    liste.push({ cle: "projet", libelle: LIBELLE_PORTEE.projet, demande: p });
  }
  return liste;
}
