/** Cohérence entre les plans d'un épisode (2026-10-03) : quel asset sert dans quel plan. Les incohérences de détail entre
 * plans viennent le plus souvent d'une référence posée dans certains plans et pas dans d'autres (le personnage a sa
 * référence aux plans 1, 2 et 4, mais pas au 3). Le tableau le rend visible d'un coup d'œil. Pur, testé. */

export type CitationAsset = { assetCode: string; assetType: string; planUuid: string };
export type PlanMatrice = { uuid: string; position: number; titre: string };
export type LigneMatrice = {
  code: string;
  type: string;
  /** Un booléen par plan, dans l'ordre des plans. */
  presents: boolean[];
  nbPlans: number;
  /** Des plans sans cet asset ENTRE deux plans qui l'ont : le trou à regarder (« le 3 n'a pas la référence »). */
  trous: number[];
};

const ORDRE_TYPES = ["personnage", "decor", "prop", "vfx", "oth"];

/** Les lignes du tableau : un asset par ligne (au moins une citation dans l'épisode), regroupés par type puis du plus cité
 * au moins cité. Les voix et les sons ne sont pas des références d'image : ils n'y figurent pas. */
export function construireMatrice(plans: PlanMatrice[], citations: CitationAsset[]): LigneMatrice[] {
  const parAsset = new Map<string, { type: string; plans: Set<string> }>();
  for (const c of citations) {
    if (c.assetType === "voix" || c.assetType === "sfx") continue;
    const l = parAsset.get(c.assetCode) ?? { type: c.assetType, plans: new Set<string>() };
    l.plans.add(c.planUuid);
    parAsset.set(c.assetCode, l);
  }
  const lignes: LigneMatrice[] = [...parAsset.entries()].map(([code, l]) => {
    const presents = plans.map((p) => l.plans.has(p.uuid));
    const premier = presents.indexOf(true);
    const dernier = presents.lastIndexOf(true);
    const trous = presents.flatMap((v, i) => (!v && i > premier && i < dernier ? [plans[i]!.position] : []));
    return { code, type: l.type, presents, nbPlans: presents.filter(Boolean).length, trous };
  });
  const rang = (t: string) => (ORDRE_TYPES.includes(t) ? ORDRE_TYPES.indexOf(t) : ORDRE_TYPES.length);
  return lignes.sort((a, b) => rang(a.type) - rang(b.type) || b.nbPlans - a.nbPlans || a.code.localeCompare(b.code));
}
