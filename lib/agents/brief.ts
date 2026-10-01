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

/** Un brief « partiel » vide : la forme complète (les consommateurs lisent `.length`/`.map`
 * sans garde), rien d'inventé. Sert quand l'utilisateur pose le style ou les notes d'un projet
 * qui n'a pas (encore) de brief rédigé par l'agent. */
export function briefVide(titre: string): BriefContenu {
  return {
    titre: titre.trim() || "Projet",
    source: "reconstitue",
    arc: "",
    style: { nom: "", clause: "" },
    langueDialogues: "",
    episodes: [],
    personnages: [],
    lieux: [],
    continuite: [],
    rimes: [],
    progressions: [],
    pieges: [],
    inventions: [],
    questionsOuvertes: [],
    notes: "",
  };
}

/** Sections montrées pour un brief partiel : le style et les notes (toujours éditables), plus
 * toute section que l'utilisateur a posée (« fourni »). Un brief rédigé montre tout ce qui est défini. */
function sectionVisible(partiel: boolean, cle: string, statuts: Record<string, StatutChamp>): boolean {
  return !partiel || cle === "style" || cle === "notes" || statuts[cle] === "fourni";
}

/** La clause de style portée par un brief (trim), ou "" . */
export function clauseDuBrief(contenu: BriefContenu | null | undefined): string {
  const c = (contenu as unknown as { style?: { clause?: unknown } } | null | undefined)?.style?.clause;
  return typeof c === "string" ? c.trim() : "";
}

/** Les notes libres d'un brief (trim), ou "". */
export function notesDuBrief(contenu: BriefContenu | null | undefined): string {
  const n = (contenu as unknown as { notes?: unknown } | null | undefined)?.notes;
  return typeof n === "string" ? n.trim() : "";
}

export function construireSections(
  contenu: BriefContenu,
  statuts: Record<string, StatutChamp>,
  statutBrief: "partiel" | "brouillon" | "valide" = "valide",
): SectionBrief[] {
  const c = contenu as unknown as Record<string, unknown>;
  const partiel = statutBrief === "partiel";
  return SECTIONS_BRIEF.filter((s) => (c[s.cle] !== undefined || (partiel && (s.cle === "style" || s.cle === "notes"))) && sectionVisible(partiel, s.cle, statuts)).map((s) => ({
    cle: s.cle,
    libelle: s.libelle,
    groupe: s.groupe,
    // Brief partiel : une section jamais posée (notes vides…) reste « à valider » (à remplir), pas « déduite ».
    statut: statuts[s.cle] ?? (partiel ? "a_valider" : statutDeSection(s.cle, c[s.cle])),
    valeur: c[s.cle] ?? (s.cle === "style" ? { nom: "", clause: "" } : s.cle === "notes" ? "" : undefined),
  }));
}

/** Le brouillon qu'écrit l'agent, SANS écraser ce que l'utilisateur a posé à la main dans un brief
 * partiel : les sections « fourni » du partiel gagnent (style, notes…). */
export function fusionnerPartielDansBrouillon(
  brouillon: { contenu: BriefContenu; statuts: Record<string, StatutChamp> },
  partiel: { contenu: BriefContenu; statuts: Record<string, StatutChamp> },
): { contenu: BriefContenu; statuts: Record<string, StatutChamp> } {
  const contenu = { ...(brouillon.contenu as unknown as Record<string, unknown>) };
  const statuts = { ...brouillon.statuts };
  const posees = partiel.contenu as unknown as Record<string, unknown>;
  for (const cle of CLES_SECTION) {
    if (partiel.statuts[cle] !== "fourni" || posees[cle] === undefined) continue;
    contenu[cle] = posees[cle];
    statuts[cle] = "fourni";
  }
  return { contenu: contenu as unknown as BriefContenu, statuts };
}

/** Ce qu'il reste d'un brouillon abandonné : le brief PARTIEL qui porte la clause de style et les
 * notes du projet — null s'il n'y en a aucune (le brouillon se supprime). Les valeurs viennent des
 * COPIES du projet (`projects.clause_style` / `notes`), qui reflètent par invariant le brief de
 * référence (brief-db.ts) : on ne devine pas, dans un brouillon, ce qui a été posé à la main. Le nom
 * du style est gardé si la clause du brouillon est la même. Tout le reste du brouillon disparaît. */
export function residuPartiel(
  brouillon: { contenu: BriefContenu; statuts: Record<string, StatutChamp> },
  projet: { titre: string; clauseStyle: string; notes: string },
): { contenu: BriefContenu; statuts: Record<string, StatutChamp> } | null {
  const clause = projet.clauseStyle.trim();
  const notes = projet.notes.trim();
  if (!clause && !notes) return null;
  const contenu = briefVide(projet.titre) as unknown as Record<string, unknown>;
  const statuts: Record<string, StatutChamp> = {};
  if (clause) {
    const style = (brouillon.contenu as unknown as { style?: { nom?: unknown; clause?: unknown } }).style;
    const memeClause = typeof style?.clause === "string" && style.clause.trim() === clause;
    contenu.style = { nom: memeClause && typeof style?.nom === "string" ? style.nom : "", clause };
    statuts.style = "fourni";
  }
  if (notes) {
    contenu.notes = notes;
    statuts.notes = "fourni";
  }
  return { contenu: contenu as unknown as BriefContenu, statuts };
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
