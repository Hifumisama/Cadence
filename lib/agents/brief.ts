import { SECTIONS_BRIEF, type BriefContenu, type CleSectionBrief, type SectionBrief, type StatutChamp } from "./types";

/** Le brief — fonctions pures (aucun accès base ni disque) : de la sortie du skill
 * `brief-projet` au contenu + statuts stockés, aux sections affichées, aux différences. */

export const CLES_SECTION: string[] = SECTIONS_BRIEF.map((s) => s.cle);

export function estCleSection(cle: string): cle is CleSectionBrief {
  return CLES_SECTION.includes(cle);
}

/** Égalité structurelle indifférente à l'ordre des clés. */
export function egal(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

function normaliserStatut(v: unknown): StatutChamp | null {
  if (v === "fourni") return "fourni";
  if (v === "deduit") return "deduit";
  if (v === "a_valider" || v === "incertain") return "a_valider";
  return null;
}

/** Statut d'une section : celui que l'agent a déclaré (`statuts` de sa sortie), sinon déduit
 * du contenu — les inventions et les questions ouvertes sont toujours « à valider » ; une liste
 * de personnages/lieux est « à valider » si l'un d'eux est incertain, « fournie » si tous le
 * sont ; le reste est « déduit » (ce que l'agent a conclu, tant que l'utilisateur ne l'a pas
 * corrigé : une correction à la main passe la section à « fourni »). */
export function statutDeSection(cle: string, valeur: unknown, declares: Record<string, unknown> = {}): StatutChamp {
  const declare = normaliserStatut(declares[cle]);
  if (declare) return declare;
  if (cle === "inventions" || cle === "questionsOuvertes") {
    return Array.isArray(valeur) && valeur.length > 0 ? "a_valider" : "deduit";
  }
  if ((cle === "personnages" || cle === "lieux") && Array.isArray(valeur) && valeur.length > 0) {
    const statuts = valeur.map((x) => normaliserStatut((x as { statut?: unknown })?.statut));
    if (statuts.some((s) => s === "a_valider")) return "a_valider";
    if (statuts.every((s) => s === "fourni")) return "fourni";
  }
  return "deduit";
}

/** De la sortie du skill (avec son éventuel champ `statuts`) au contenu et aux statuts stockés. */
export function sortieVersBrief(sortie: Record<string, unknown>): { contenu: BriefContenu; statuts: Record<string, StatutChamp> } {
  const { statuts: declares, ...reste } = sortie;
  const contenu = reste as unknown as BriefContenu;
  const decl = (declares && typeof declares === "object" ? declares : {}) as Record<string, unknown>;
  const statuts: Record<string, StatutChamp> = {};
  for (const cle of CLES_SECTION) {
    const valeur = (contenu as unknown as Record<string, unknown>)[cle];
    if (valeur === undefined) continue;
    statuts[cle] = statutDeSection(cle, valeur, decl);
  }
  return { contenu, statuts };
}

export function construireSections(contenu: BriefContenu, statuts: Record<string, StatutChamp>): SectionBrief[] {
  const c = contenu as unknown as Record<string, unknown>;
  return SECTIONS_BRIEF.filter((s) => c[s.cle] !== undefined).map((s) => ({
    cle: s.cle,
    libelle: s.libelle,
    groupe: s.groupe,
    statut: statuts[s.cle] ?? statutDeSection(s.cle, c[s.cle]),
    valeur: c[s.cle],
  }));
}

export type DifferenceSection = { cle: CleSectionBrief; avant: unknown; apres: unknown };

/** Les sections qui diffèrent entre deux briefs (`avant` null = pas de brief). */
export function diffSections(avant: BriefContenu | null, apres: BriefContenu): DifferenceSection[] {
  const a = (avant ?? {}) as unknown as Record<string, unknown>;
  const b = apres as unknown as Record<string, unknown>;
  return SECTIONS_BRIEF.filter((s) => b[s.cle] !== undefined && !egal(a[s.cle], b[s.cle])).map((s) => ({
    cle: s.cle,
    avant: a[s.cle] ?? null,
    apres: b[s.cle],
  }));
}

/** Contenu avec une section remplacée (copie). */
export function avecSection(contenu: BriefContenu, cle: CleSectionBrief, valeur: unknown): BriefContenu {
  return { ...(contenu as unknown as Record<string, unknown>), [cle]: valeur } as unknown as BriefContenu;
}

/** Sous-schéma d'une section, extrait du schéma complet du brief (pour valider une correction à la main). */
export function sousSchemaSection(schema: Record<string, unknown>, cle: string): Record<string, unknown> | null {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return props[cle] ?? null;
}
