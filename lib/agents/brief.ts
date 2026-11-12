import schemaBrief from "./brief-schema.json";
import { SECTIONS_BRIEF, type BriefContenu, type CleSectionBrief, type SectionBrief, type StatutChamp } from "./types";

/** The brief — pure functions (no database or disk access): from the interview's sheet (`notes-entretien`) to the content +
 * stored statuses, to the displayed sections, to the differences. */

/** Schema of the stored brief (`brief-schema.json`). No more `brief-projet` skill (2026-10-12): the brief fills up over the
 * conversation. The sub-schemas of the patchable sections are repeated in that of `notes-entretien` (a test requires them to be identical). */
export const SCHEMA_BRIEF = schemaBrief as unknown as Record<string, unknown>;

/** The sections that carry a choice made in the design (language, duration, genre and tone): changing them would mean redoing the project, so they
 * are no longer edited by hand once the design is done (see `modifierChampBrief`). */
export const SECTIONS_FIGEES_PAR_LA_CONCEPTION: readonly string[] = ["langueDialogues", "dureeEpisodeSecondes", "genreTon"];

const CLES_SECTION: string[] = SECTIONS_BRIEF.map((s) => s.cle);

/** The old "Contraintes" sections of the brief, removed on 2026-10-12 (never filled in or seriously used). No migration:
 * a brief already stored may still carry them; they are simply ignored on read (see `sansClesAbandonnees`). */
export const CLES_ABANDONNEES: readonly string[] = ["continuite", "rimes", "progressions", "pieges"];

/** A copy of the object WITHOUT the abandoned keys (the brief schema is strict: an old brief no longer satisfies it as is). Pure; what
 * is not an object is returned unchanged. */
export function sansClesAbandonnees<T>(objet: T): T {
  if (!objet || typeof objet !== "object" || Array.isArray(objet)) return objet;
  const copie = { ...(objet as Record<string, unknown>) };
  for (const cle of CLES_ABANDONNEES) delete copie[cle];
  return copie as T;
}

export function estCleSection(cle: string): cle is CleSectionBrief {
  return CLES_SECTION.includes(cle);
}

/** Structural equality, regardless of key order. */
function egal(a: unknown, b: unknown): boolean {
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
  // No more "à valider" in a brief (test feedback, 2026-10-03): what the agent hesitates to set is settled in
  // conversation (`resteADefinir`); a "à valider" or "incertain" status declared by the model counts as "déduit".
  if (v === "a_valider" || v === "incertain") return "deduit";
  return null;
}

/** A section's status: the one the agent declared (`statuts` of its output), otherwise inferred
 * from the content — inventions and open questions are INFORMATIVE ("déduit"): the conversation has
 * cleared up the grey areas, no point left to validate one by one (general test feedback, 2026-10-03); a
 * list of characters/places is "à valider" if one of them is uncertain, "fourni" if all
 * are; the rest is "déduit" (what the agent concluded, until the user
 * corrects it: a manual correction moves the section to "fourni"). */
export function statutDeSection(cle: string, valeur: unknown, declares: Record<string, unknown> = {}): StatutChamp {
  const declare = normaliserStatut(declares[cle]);
  if (declare) return declare;
  if (cle === "inventions" || cle === "questionsOuvertes") return "deduit";
  if ((cle === "personnages" || cle === "lieux") && Array.isArray(valeur) && valeur.length > 0) {
    const statuts = valeur.map((x) => normaliserStatut((x as { statut?: unknown })?.statut));
    if (statuts.every((s) => s === "fourni")) return "fourni";
  }
  return "deduit";
}

/** From the skill's output (with its optional `statuts` field) to the stored content and statuses. */
export function sortieVersBrief(sortie: Record<string, unknown>): { contenu: BriefContenu; statuts: Record<string, StatutChamp> } {
  const { statuts: declares, ...reste } = sortie;
  const contenu = sansClesAbandonnees(reste) as unknown as BriefContenu;
  const decl = (declares && typeof declares === "object" ? declares : {}) as Record<string, unknown>;
  const statuts: Record<string, StatutChamp> = {};
  for (const cle of CLES_SECTION) {
    const valeur = (contenu as unknown as Record<string, unknown>)[cle];
    if (valeur === undefined) continue;
    statuts[cle] = statutDeSection(cle, valeur, decl);
  }
  return { contenu, statuts };
}

/** An empty "partiel" brief: the full shape (consumers read `.length`/`.map`
 * without a guard), nothing invented. Used when the user sets the style or notes of a project
 * that does not (yet) have a brief written by the agent. */
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
    inventions: [],
    questionsOuvertes: [],
    notes: "",
  };
}

/** Sections shown for a partial brief: the style and notes (always editable), plus
 * any section the user set ("fourni"). A written brief shows everything that is defined. */
function sectionVisible(partiel: boolean, cle: string, statuts: Record<string, StatutChamp>): boolean {
  return !partiel || cle === "style" || cle === "notes" || statuts[cle] === "fourni";
}

/** The style clause carried by a brief (trimmed), or "". */
export function clauseDuBrief(contenu: BriefContenu | null | undefined): string {
  const c = (contenu as unknown as { style?: { clause?: unknown } } | null | undefined)?.style?.clause;
  return typeof c === "string" ? c.trim() : "";
}

/** The long style prompt (images), or "": a project without a design (or a retouched style) has none, and images then fall back to the clause. */
export function promptImageDuBrief(contenu: BriefContenu | null | undefined): string {
  const p = (contenu as unknown as { style?: { promptImage?: unknown } } | null | undefined)?.style?.promptImage;
  return typeof p === "string" ? p.trim() : "";
}

/** The long prompt (images) and the style preview belong to the CODE (set when the project is created): the interview model does not see them, so the brief it
 * returns does not carry them. When the whole brief is written, they are restored from `precedent` (the brief already in the database, or what the design gives) when the clause is
 * the same: same clause, same style. No effect if the new style already has its own, or if the style really changed. */
export function retablirStyleDuCode(contenu: BriefContenu, precedent: { clause?: string; promptImage?: string; image?: string } | null | undefined): BriefContenu {
  const c = contenu as unknown as { style?: { clause?: unknown; promptImage?: unknown; image?: unknown } };
  const style = c.style;
  if (!style || !precedent) return contenu;
  const memeClause = typeof style.clause === "string" && style.clause.trim() !== "" && style.clause.trim() === (precedent.clause ?? "").trim();
  if (!memeClause) return contenu;
  const aPrompt = typeof style.promptImage === "string" && style.promptImage.trim() !== "";
  const aImage = typeof style.image === "string" && style.image.trim() !== "";
  const prompt = precedent.promptImage?.trim();
  const image = precedent.image?.trim();
  if ((aPrompt || !prompt) && (aImage || !image)) return contenu;
  return { ...contenu, style: { ...style, ...(!aPrompt && prompt ? { promptImage: prompt } : {}), ...(!aImage && image ? { image } : {}) } } as unknown as BriefContenu;
}

/** The free notes of a brief (trimmed), or "". */
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
    // Partial brief: a section never set (empty notes…) stays "à valider" (to fill in), not "déduite".
    statut: statuts[s.cle] ?? (partiel ? "a_valider" : statutDeSection(s.cle, c[s.cle])),
    valeur: c[s.cle] ?? (s.cle === "style" ? { nom: "", clause: "" } : s.cle === "notes" ? "" : undefined),
  }));
}

/** The draft the agent writes, WITHOUT overwriting what the user set by hand in a
 * partial brief: the partial's "fourni" sections win (style, notes…). */
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

export type DifferenceSection = { cle: CleSectionBrief; avant: unknown; apres: unknown };

/** The sections that differ between two briefs (`avant` null = no brief). */
export function diffSections(avant: BriefContenu | null, apres: BriefContenu): DifferenceSection[] {
  const a = (avant ?? {}) as unknown as Record<string, unknown>;
  const b = apres as unknown as Record<string, unknown>;
  return SECTIONS_BRIEF.filter((s) => b[s.cle] !== undefined && !egal(a[s.cle], b[s.cle])).map((s) => ({
    cle: s.cle,
    avant: a[s.cle] ?? null,
    apres: b[s.cle],
  }));
}

/** Sub-schema of a section, extracted from the full brief schema (to validate a manual correction). */
export function sousSchemaSection(schema: Record<string, unknown>, cle: string): Record<string, unknown> | null {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return props[cle] ?? null;
}
