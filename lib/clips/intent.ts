/** The INTENT of a clip (`plans.description`): the narrative, the lines of dialogue (`NOM : « … »`), possibly a sentence « Consigne de l'auteur : … ». Pure, tested.
 *
 * - « État en fin de plan : … » is no longer written (2026-11-08): it was the link between clips of the old link; a `suite` now extends the
 *   previous render through its latent (Motion Context, lib/renders/video-steps.ts). Clips written before keep this line in the database: `sansEtatDeFin` removes it
 *   on reading (display, skill inputs). No migration is needed.
 * - « Consigne de l'auteur : … » remains STORED (traduction-intent reads it) but is not displayed: when the narrative respects it, it duplicates it.
 *   `intentAffichee` hides it. */

/** The start of the end-state line (old format), wherever it begins: at the start of a line or at the end of a paragraph (« Il frappe. État en fin de plan : … »). */
const ETAT_DE_FIN = /[ée]tat en fin de plan\s*:/i;
const CONSIGNE = /consigne de l['’]auteur\s*:/i;

const ranger = (lignes: string[]): string =>
  lignes
    .map((l) => l.replace(/[ \t  ]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Removes the « État en fin de plan » from a description written before 2026-11-08: from the sentence to the end of its paragraph (the next blank line).
 * A description without this sentence is returned as is (except trailing blanks). */
export function sansEtatDeFin(description: string | null | undefined): string {
  const lignes = (description ?? "").replace(/\r\n?/g, "\n").split("\n");
  const gardees: string[] = [];
  let dansEtat = false;
  for (const ligne of lignes) {
    if (dansEtat) {
      if (!ligne.trim()) dansEtat = false;
      else continue;
    }
    const m = ETAT_DE_FIN.exec(ligne);
    if (m) {
      dansEtat = true;
      const avant = ligne.slice(0, m.index);
      if (avant.trim()) gardees.push(avant);
      continue;
    }
    gardees.push(ligne);
  }
  return ranger(gardees);
}

/** Does the description still contain an end-state line (clip written before 2026-11-08)? */
export const aUnEtatDeFin = (description: string | null | undefined): boolean => ETAT_DE_FIN.test(description ?? "");

/** Removes the sentence « Consigne de l'auteur : … » (up to the end of its line). For DISPLAY only: storage keeps it. */
export function sansConsigneAuteur(description: string | null | undefined): string {
  const gardees: string[] = [];
  for (const ligne of (description ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const m = CONSIGNE.exec(ligne);
    if (!m) {
      gardees.push(ligne);
      continue;
    }
    const avant = ligne.slice(0, m.index);
    if (avant.trim()) gardees.push(avant);
  }
  return ranger(gardees);
}

/** The intent as it is DISPLAYED: without the old « État en fin de plan », without the « Consigne de l'auteur ». */
export const intentAffichee = (description: string | null | undefined): string => sansConsigneAuteur(sansEtatDeFin(description));

/** The sentence « Consigne de l'auteur : … » stored in the description (from the marker to the end of its line), or null. */
export function consigneAuteur(description: string | null | undefined): string | null {
  for (const ligne of (description ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const m = CONSIGNE.exec(ligne);
    if (m) return ligne.slice(m.index).trim();
  }
  return null;
}

/** A rewritten text (re-read by hand in the Reading view, or rendered by an agent) keeps the « Consigne de l'auteur » of the current description when it does not
 * carry one itself: it is hidden on display (`intentAffichee`), hence absent from what is edited, and must not disappear silently. A text that has
 * its own instruction keeps it (it is the new one). */
export function conserverConsigneAuteur(nouvelle: string, actuelle: string | null | undefined): string {
  if (CONSIGNE.test(nouvelle)) return nouvelle;
  const consigne = consigneAuteur(actuelle);
  return consigne ? `${nouvelle.trimEnd()}\n\n${consigne}` : nouvelle;
}

/** Do the two descriptions say the same thing? Blanks do not count (carriage returns, trailing spaces, line breaks). */
export const memeDescription = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? "").replace(/\s+/g, " ").trim() === (b ?? "").replace(/\s+/g, " ").trim();

/** Would replacing the current description with that of an old attempt LOSE it? Yes when it differs from that of the attempt AND no attempt carries it
 * (a hand edit since): otherwise it remains findable in its own attempt. */
export function descriptionSeraitPerdue(actuelle: string | null | undefined, descriptionEssai: string | null | undefined, descriptionsDesEssais: (string | null | undefined)[]): boolean {
  if (descriptionEssai == null || memeDescription(actuelle, descriptionEssai)) return false;
  if (!(actuelle ?? "").trim()) return false;
  return !descriptionsDesEssais.some((d) => d != null && memeDescription(actuelle, d));
}

/** What a text (a sheet, a render) no longer says of the clip's intention: today's description is no longer the one it started from. Without a recorded value
 * (clip written before this tracking), we do not know: false. */
export const intentionChangee = (description: string | null | undefined, descriptionDepart: string | null | undefined): boolean =>
  descriptionDepart != null && !memeDescription(description, descriptionDepart);

/** The `« … »` lines of dialogue of a description. */
const repliquesIntent = (description: string): string[] => [...description.matchAll(/«\s*([\s\S]*?)\s*»/g)].map((m) => m[1]!.trim()).filter(Boolean);

const mots = (t: string): string[] => t.toLowerCase().match(/\p{L}{3,}/gu) ?? [];

/** The narrative alone: without end state, without instruction, without dialogue lines. */
export const recitDe = (description: string): string => sansConsigneAuteur(sansEtatDeFin(description).replace(LIGNE_REPLIQUE, "")).trim();

/** A line of dialogue: « NOM : « texte » » (the same pattern as lib/h3ir/brief.ts). */
const LIGNE_REPLIQUE = /^[ \t  ]*[^:«»\n]{1,60}?[ \t  ]*:[ \t  ]*«[^\n]*»[ \t  ]*$/gm;

/** Why a NEW description (written by an agent that corrects a clip) cannot replace the current one, or null if it can.
 * An agent sometimes renders only a piece (the single sentence it changed: an `iteration-plan` rendered, for a full description, its
 * 222 characters of old end state only); replacing it would erase the narrative, and the next correction would no longer see anything. Refused when:
 * - it no longer has a narrative (only dialogue lines, an instruction or the old end state);
 * - it is much shorter than the current narrative (less than 40%; 25% for a rewrite, which may legitimately simplify) AND keeps almost no words of it
 *   (less than 30%): it is a fragment, not a description.
 * Both texts are compared WITHOUT their end state (old format). The loss of a dialogue line is reported separately (`repliquesPerdues`). */
export function raisonDescriptionIncomplete(
  nouvelle: string | null | undefined,
  actuelle: string | null | undefined,
  options: { reecriture?: boolean } = {},
): string | null {
  const recitN = recitDe(nouvelle ?? "");
  if (!recitN) return "la nouvelle description n'a plus de récit (ce qui se passe dans le plan) : elle doit être COMPLÈTE (tout le récit, puis les répliques), pas seulement la phrase changée";
  const recitA = recitDe(actuelle ?? "");
  if (!recitA) return null;
  if (recitN.length < (options.reecriture ? 0.25 : 0.4) * recitA.length) {
    const motsA = new Set(mots(recitA));
    const gardes = new Set(mots(recitN).filter((m) => motsA.has(m)));
    if (motsA.size > 0 && gardes.size / motsA.size < 0.3) {
      return `la nouvelle description (${recitN.length} caractères de récit) ne reprend presque rien de l'actuelle (${recitA.length}) : elle doit être COMPLÈTE (tout le récit, puis les répliques), pas seulement la phrase changée`;
    }
  }
  return null;
}

/** The dialogue lines of the current one that are no longer in the new one (up to blanks and case). */
export function repliquesPerdues(nouvelle: string | null | undefined, actuelle: string | null | undefined): string[] {
  const norme = (s: string) => s.toLowerCase().replace(/[\s  ]+/g, " ").trim();
  const n = norme(nouvelle ?? "");
  return repliquesIntent(actuelle ?? "").filter((r) => !n.includes(norme(r)));
}
