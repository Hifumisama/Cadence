import { CLES_ABANDONNEES, briefVide, sansClesAbandonnees } from "./brief";
import type { BriefContenu } from "./types";

/** The interview's notes sheet: the brief being filled in, held BY THE CODE. At each user message,
 * the `notes-entretien` skill returns a PATCH (the sections this message changes, with the quote that proves it);
 * the code checks the quotes, applies the patch, and decides on its own what is missing and when the sheet is
 * complete. The model therefore keeps neither bookkeeping nor a stopping criterion (it kept them badly: too lenient, and it
 * contradicted itself). Once complete, the sheet becomes the brief's draft, without a writing call. Pure. */

/** `fourni`: the user said it. `delegue`: they explicitly left the agent to decide ("je te laisse choisir"): the question is
 * settled, the content remains a proposal from the agent. `deduit`: the agent assumed it, nobody settled it. */
export type StatutFiche = "fourni" | "delegue" | "deduit";
/** Status of a DETAIL (costume, look of a place, element, continuity): `incertain` = said, but in vague terms ("inspirée de…" without colour
 * nor material): it still has to be specified. */
type StatutDetail = StatutFiche | "incertain";
/** `details`: the status of each detail to specify (key `tenue:<normalised name>`, `lieu:…`, `element:…`, `raccords`), absent until one
 * is followed. It lives in the sheet only: the brief keeps a trace of it in the `statut` of the sub-objects (see `estampillerDetails`). */
export type Fiche = { contenu: Record<string, unknown>; statuts: Record<string, StatutFiche>; details?: Record<string, StatutDetail> };

export const FICHE_VIDE: Fiche = { contenu: {}, statuts: {} };

/** The brief sections the patch can write (`notes` is never written by the agent: the user sets them). */
export const SECTIONS_PATCHABLES = [
  "titre",
  "arc",
  "genreTon",
  "style",
  "langueDialogues",
  "dureeEpisodeSecondes",
  "rythme",
  "univers",
  "episodes",
  "personnages",
  "lieux",
  "elements",
  "inventions",
  "questionsOuvertes",
] as const;

/** Purely informative sections: a "delegation" on them settles nothing (and so never closes the interview). */
const SECTIONS_INFORMATIVES: readonly string[] = ["inventions", "questionsOuvertes"];

/** What the USER must have settled (said, or delegated to the agent, proven by a quote) for the sheet to be complete. `fin` is not
 * a brief section: the ending lives in `arc`, but we follow separately whether the user said it. */
export const REQUIS = [
  { cle: "arc", libelle: "le cœur de l'histoire (le héros, ce qu'il veut, ce qui la fait basculer)" },
  { cle: "fin", libelle: "la fin (comment ça se termine, ce qu'on doit ressentir en sortant)" },
  { cle: "genreTon", libelle: "le ton et le genre" },
  { cle: "style", libelle: "le style visuel" },
  { cle: "rythme", libelle: "le rythme (lent, mesuré, vif…)" },
  { cle: "dureeEpisodeSecondes", libelle: "la durée visée" },
  { cle: "personnages", libelle: "le héros : son âge et son apparence" },
] as const;

/** Sections the patch can cite without modifying them ("I confirmed what is already noted"): all of them, plus `fin`. */
const SECTIONS_CITABLES: readonly string[] = [...SECTIONS_PATCHABLES, "fin"];

/** User messages needed at minimum before a sheet can be declared complete: the idea, then a reply. */
export const MIN_MESSAGES_FICHE = 2;
/** When the first message is a big block (project 236: a single message filled everything), we want at least two replies after it:
 * the same information density, obtained over several exchanges. */
export const MIN_MESSAGES_GROS_BLOC = 3;
/** Length (characters) from which the first message counts as a "gros bloc": an idea usually fits in two or three sentences. */
export const SEUIL_GROS_BLOC = 500;
/** Cap on follow-ups about details: from this number of user messages on, the details still to specify no longer hold
 * the interview (they stay listed, the agent may keep digging into them). The interview never drags on. */
export const PLAFOND_MESSAGES_DETAILS = 10;
/** Maximum number of details followed, per family (in sheet order: the hero first). */
const MAX_DETAILS = { tenue: 3, lieu: 2, element: 2 } as const;

/** Is the user's first message a big block? */
export const premierMessageGrosBloc = (messagesUtilisateur: readonly string[]): boolean => (messagesUtilisateur[0]?.trim().length ?? 0) >= SEUIL_GROS_BLOC;

/** The minimum number of user messages for this conversation. */
export const minMessagesFiche = (messagesUtilisateur: readonly string[]): number => (premierMessageGrosBloc(messagesUtilisateur) ? MIN_MESSAGES_GROS_BLOC : MIN_MESSAGES_FICHE);

const normaliser = (t: string): string =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Minimum length (normalised) of a quote: a "oui" does not prove a subject. */
const CITATION_MIN = 4;

function citationVerifiee(citation: unknown, corpus: string[]): boolean {
  if (typeof citation !== "string") return false;
  const c = normaliser(citation);
  return c.length >= CITATION_MIN && corpus.some((m) => m.includes(c));
}

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A value that says nothing (empty string, empty list, style with neither name nor clause): never applied, it erases nothing. */
export function valeurVide(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(valeurVide);
  return false;
}

/** Reads a sheet coming from the database: an unexpected shape gives an empty sheet. */
export function lireFiche(brut: unknown): Fiche {
  const o = objet(brut);
  const contenu = sansClesAbandonnees(objet(o.contenu));
  const statuts: Record<string, StatutFiche> = {};
  for (const [k, v] of Object.entries(objet(o.statuts))) if (!CLES_ABANDONNEES.includes(k) && (v === "fourni" || v === "deduit" || v === "delegue")) statuts[k] = v;
  const details: Record<string, StatutDetail> = {};
  for (const [k, v] of Object.entries(objet(o.details))) if (v === "fourni" || v === "deduit" || v === "delegue" || v === "incertain") details[k] = v;
  return { contenu: { ...contenu }, statuts, ...(Object.keys(details).length ? { details } : {}) };
}

// --- Details to specify (second level of completeness) ---------------------------------------------------------------------
// Once the essentials are settled, the sheet still has to say what gets DRAWN: each character's costume, each place's look, the
// colour and scale of each effect or prop, and whether the costumes change (continuity). These details are generated from the sheet (one per
// character, place, element, capped); each is settled if it is said precisely (verified quote, without a vague formula) or delegated.

export type DetailAPreciser = {
  /** `tenue:<normalised name>`, `lieu:…`, `element:…` or `raccords`. */
  cle: string;
  libelle: string;
  /** (Normalised) words that designate this detail in a question or an answer: its name and its theme. */
  themes: string[];
};

type Famille = "tenue" | "lieu" | "element";
type DetailCandidat = DetailAPreciser & { present: boolean; texte: string };

const chaine = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const listeObjets = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(objet) : []);

const cleDetail = (famille: Famille, nom: string): string => `${famille}:${normaliser(nom)}`;

/** A detail key returned by the model, normalised ("tenue:Aang" → "tenue:aang"); null if it does not have the expected shape. */
function lireCleDetail(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  if (normaliser(brut) === "raccords") return "raccords";
  const i = brut.indexOf(":");
  if (i < 0) return null;
  const famille = normaliser(brut.slice(0, i));
  const nom = normaliser(brut.slice(i + 1));
  return (famille === "tenue" || famille === "lieu" || famille === "element") && nom ? `${famille}:${nom}` : null;
}

/** A reference formula ("inspirée de…", "style de…", "comme dans…", "les couleurs de…") WITHOUT a named colour or material: it
 * does not get drawn. The text is normalised (accents, case) before being read. */
const VAGUE = / (inspir[a-z]*|style|facon|maniere|comme|rappel[a-z]*|reference|clin d oeil|couleurs? (de|du|des|d)) /;
const COULEUR =
  / (rouge|bleu|vert|jaune|orange|violet|violette|rose|noir|blanc|blanche|gris|grise|brun|marron|beige|ocre|dore|argente|safran|pourpre|ecarlate|turquoise|cyan|indigo|kaki|creme|ivoire|bordeaux|cuivre|bronze|sable|emeraude|rubis|saphir|ambre|lavande|mauve|olive|corail|anthracite|prune|fauve|roux|rousse|terracotta|sepia|pastel|carmin|vermillon|azur|magenta|taupe|chocolat|caramel|miel|terre)(s|e|es|x|ee|ees)? /;
const MATIERE =
  / (coton|lin|laine|soie|cuir|velours|jean|denim|toile|satin|feutre|fourrure|metal|metallique|acier|fer|bois|pierre|verre|plastique|nylon|polyester|cachemire|tweed|daim|tricot|papier|beton|marbre|brique|bambou|chanvre|caoutchouc|latex|lainage|mousseline|tulle|dentelle|maille|plume|ecaille|corne|argile|chaume|tuile|ardoise|granit|lame|brocart)(s|e|es|x)? /;

export function formuleVague(texte: string): boolean {
  const t = ` ${normaliser(texte)} `;
  return VAGUE.test(t) && !COULEUR.test(t) && !MATIERE.test(t);
}

/** All the details the sheet calls for (settled or not), in interview order: costumes, sets, effects and props, continuity. */
function detailsCandidats(contenu: Record<string, unknown>): DetailCandidat[] {
  const d: DetailCandidat[] = [];
  const persos = listeObjets(contenu.personnages).filter((p) => chaine(p.nom));
  for (const p of persos.slice(0, MAX_DETAILS.tenue)) {
    const nom = chaine(p.nom);
    const t = objet(p.tenue);
    d.push({
      cle: cleDetail("tenue", nom),
      libelle: `la tenue de ${nom} (coupe, couleurs, matières)`,
      themes: [normaliser(nom), "tenue", "vetement", "costume", "habit", "habill", "porte", "couleur", "matiere", "coupe"],
      present: !!chaine(t.couleurs) && !!(chaine(t.coupe) || chaine(t.matieres)),
      texte: [t.coupe, t.couleurs, t.matieres].map(chaine).join(" "),
    });
  }
  for (const l of listeObjets(contenu.lieux).filter((x) => chaine(x.nom)).slice(0, MAX_DETAILS.lieu)) {
    const nom = chaine(l.nom);
    const a = objet(l.aspect);
    d.push({
      cle: cleDetail("lieu", nom),
      libelle: `le décor « ${nom} » (lumière, matières, palette)`,
      themes: [normaliser(nom), "lieu", "decor", "lumiere", "eclair", "heure", "matiere", "palette", "couleur"],
      present: !!chaine(a.lumiere) && !!(chaine(a.matieres) || chaine(a.palette)),
      texte: [a.lumiere, a.matieres, a.palette].map(chaine).join(" "),
    });
  }
  for (const e of listeObjets(contenu.elements).filter((x) => chaine(x.nom)).slice(0, MAX_DETAILS.element)) {
    const nom = chaine(e.nom);
    d.push({
      cle: cleDetail("element", nom),
      libelle: `« ${nom} » (couleur, ampleur, comportement)`,
      themes: [normaliser(nom), "effet", "couleur", "ampleur", "taille", "comportement", "pouvoir", "magie", "objet"],
      present: !!chaine(e.couleur) && !!(chaine(e.ampleur) || chaine(e.comportement)),
      texte: [e.couleur, e.ampleur, e.comportement].map(chaine).join(" "),
    });
  }
  if (persos.length) {
    d.push({
      cle: "raccords",
      libelle: "les changements de tenue au fil du film (ou aucun)",
      themes: ["raccord", "change", "tenue", "costume", "evolu"],
      present: persos.some((p) => !!chaine(objet(p.tenue).evolution)),
      texte: "",
    });
  }
  return d;
}

/** A detail is settled: present in the sheet AND said precisely by the user, or delegated by them (verified quote). A detail said
 * in vague terms remains to be specified, whatever its status. */
function detailTranche(fiche: Fiche, d: DetailCandidat): boolean {
  const s = fiche.details?.[d.cle];
  return d.present && (s === "delegue" || (s === "fourni" && !formuleVague(d.texte)));
}

/** The details still to specify, in order (costumes, sets, effects and props, continuity). */
export function detailsAPreciser(fiche: Fiche): DetailAPreciser[] {
  return detailsCandidats(fiche.contenu)
    .filter((d) => !detailTranche(fiche, d))
    .map(({ cle, libelle, themes }) => ({ cle, libelle, themes }));
}

/** The themes of a section, to recognise a delegation aimed at it (see `delegationsBornees`). */
const THEMES_SECTION: Record<string, string[]> = {
  titre: ["titre", "appel", "nom"],
  arc: ["histoire", "heros", "heroine", "coeur", "bascul", "veut", "intrigue", "recit"],
  fin: ["fin", "finit", "termin", "conclu", "sortant", "denouement"],
  genreTon: ["ton", "genre", "ambiance", "humour", "drame", "comedie"],
  style: ["style", "visuel", "look", "rendu", "dessin", "anim", "realis", "aquarelle", "image"],
  rythme: ["rythme", "cadence", "tempo", "lent", "rapide", "nerveu", "vif", "pose", "montage"],
  dureeEpisodeSecondes: ["duree", "minute", "seconde", "court", "long"],
  personnages: ["heros", "heroine", "personnage", "age", "apparence", "physique"],
  langueDialogues: ["langue", "dialogue", "francais", "anglais"],
  univers: ["univers", "monde", "regle"],
  episodes: ["episode"],
  lieux: ["lieu", "decor", "endroit", "ville"],
  elements: ["effet", "vfx", "pouvoir", "magie", "objet", "accessoire"],
};

/** A GLOBAL delegation: only a wording that aims at "le reste" or "tout" ("carte blanche pour le reste", "imagine le reste",
 * "décide de tout") holds for several subjects at once. "Carte blanche" alone is understood as global (it is the set phrase). */
const GLOBALE = / (carte blanche|le reste|ce qui reste|ce qu il reste|pour tout|de tout|decide tout|tout decider|tout choisir|te laisse tout|imagine tout|invente tout) /;
export const delegationGlobale = (citation: string): boolean => GLOBALE.test(` ${normaliser(citation)} `);

const mentionne = (texte: string, themes: string[]): boolean => themes.some((m) => m.length > 0 && ` ${texte}`.includes(` ${m}`));

type Preuve = { cible: string; statut: StatutFiche; citation: string };

/** Bounded delegations (feedback from project 236: "Je te laisse décider", a reply to ONE question about the music, had been applied to all
 * sections): a delegation that is not global holds only for the subject of the question. Concretely, when the same non-global quote
 * delegates SEVERAL subjects, only those that the user's reply, or the agent's question just before, names (name or theme) are
 * kept; a delegation of a single subject is kept (the model tied it to the question). */
function delegationsBornees(preuves: Preuve[], themesDe: (cible: string) => string[], contexte: (citation: string) => string): Preuve[] {
  const cibles = new Map<string, Set<string>>();
  for (const p of preuves) if (p.statut === "delegue") cibles.set(p.citation, (cibles.get(p.citation) ?? new Set()).add(p.cible));
  return preuves.filter((p) => {
    if (p.statut !== "delegue" || delegationGlobale(p.citation)) return true;
    if ((cibles.get(p.citation)?.size ?? 0) <= 1) return true;
    return mentionne(contexte(p.citation), themesDe(p.cible));
  });
}

/** Applies the patch of ONE `notes-entretien` call. A section is "fournie" only if its source is "dit" AND its
 * quote appears verbatim (accents, case, punctuation aside) in a user message: an invented, reworded or agent-taken
 * quote proves nothing, the section stays "déduite". What the user said is confirmed
 * (a verified source on an unchanged section turns it to "fourni") but is never lost through an empty patch.
 * Delegations are bounded (`delegationsBornees`), and a delegation on an informative section (open questions, inventions) settles
 * nothing. The details (`details` of the output) follow the same rules; a detail said in vague terms is "incertain".
 * `conversation` (optional: all turns, agent included) is used to find the question a delegation answers. */
export function appliquerNotes(fiche: Fiche, sortie: unknown, messagesUtilisateur: string[], conversation?: { role: string; content: string }[]): Fiche {
  const corpus = messagesUtilisateur.map(normaliser);
  const o = objet(sortie);
  const modifications = objet(o.modifications);

  const contenu = { ...fiche.contenu };
  const touchees = new Set<string>();
  for (const [cle, valeur] of Object.entries(modifications)) {
    if (!(SECTIONS_PATCHABLES as readonly string[]).includes(cle) || valeurVide(valeur)) continue;
    contenu[cle] = valeur;
    touchees.add(cle);
  }
  const candidats = detailsCandidats(contenu);

  // The proofs: section sources, the ending (its own field, mandatory: a model does fill a required field, and forgets an
  // optional source), and the details. Only verified quotes count.
  const preuves: Preuve[] = [];
  const fin = objet(o.fin);
  const sources = [...(Array.isArray(o.sources) ? o.sources : []), { section: "fin", origine: fin.origine, citation: fin.citation }];
  for (const s of sources) {
    const { section, origine, citation } = objet(s);
    if (typeof section !== "string" || !SECTIONS_CITABLES.includes(section)) continue;
    if ((origine !== "dit" && origine !== "delegue") || !citationVerifiee(citation, corpus)) continue;
    if (origine === "delegue" && SECTIONS_INFORMATIVES.includes(section)) continue;
    preuves.push({ cible: section, statut: origine === "dit" ? "fourni" : "delegue", citation: normaliser(citation as string) });
  }
  for (const s of Array.isArray(o.details) ? o.details : []) {
    const { detail, origine, citation } = objet(s);
    const cle = lireCleDetail(detail);
    if (!cle || (origine !== "dit" && origine !== "delegue") || !citationVerifiee(citation, corpus)) continue;
    preuves.push({ cible: `detail:${cle}`, statut: origine === "dit" ? "fourni" : "delegue", citation: normaliser(citation as string) });
  }
  const themesDe = (cible: string): string[] => {
    if (!cible.startsWith("detail:")) return THEMES_SECTION[cible] ?? [];
    const cle = cible.slice("detail:".length);
    return candidats.find((d) => d.cle === cle)?.themes ?? [cle.slice(cle.indexOf(":") + 1)];
  };
  const contexte = (citation: string): string => {
    const conv = conversation ?? [];
    for (let i = conv.length - 1; i >= 0; i--) {
      if (conv[i]!.role !== "user" || !normaliser(conv[i]!.content).includes(citation)) continue;
      const question = conv.slice(0, i).reverse().find((m) => m.role !== "user");
      return `${normaliser(conv[i]!.content)} ${question ? normaliser(question.content) : ""}`;
    }
    return corpus.find((m) => m.includes(citation)) ?? "";
  };

  const verifiees = new Map<string, StatutFiche>(); // section (or "detail:<key>") → "fourni" (verified "dit") or "delegue"
  for (const p of delegationsBornees(preuves, themesDe, contexte)) if (verifiees.get(p.cible) !== "fourni") verifiees.set(p.cible, p.statut);

  const statuts = { ...fiche.statuts };
  for (const cle of touchees) {
    const prouve = verifiees.get(cle);
    if (prouve) statuts[cle] = prouve;
    else statuts[cle] = statuts[cle] === "fourni" || statuts[cle] === "delegue" ? statuts[cle]! : "deduit"; // enriching a said section does not make it assumed
  }
  for (const [cle, prouve] of verifiees) {
    if (cle.startsWith("detail:")) continue;
    if (cle === "fin" || !valeurVide(contenu[cle])) statuts[cle] = statuts[cle] === "fourni" && prouve === "delegue" ? "fourni" : prouve;
  }

  const details: Record<string, StatutDetail> = { ...(fiche.details ?? {}) };
  const sectionDuDetail = (cle: string) => (cle.startsWith("lieu:") ? "lieux" : cle.startsWith("element:") ? "elements" : "personnages");
  for (const d of candidats) {
    const prouve = verifiees.get(`detail:${d.cle}`);
    const avant = details[d.cle];
    let s: StatutDetail | undefined = avant;
    if (prouve) s = avant === "fourni" && prouve === "delegue" ? "fourni" : prouve;
    else if (!avant && d.present && touchees.has(sectionDuDetail(d.cle))) s = "deduit";
    if (s === "fourni" && formuleVague(d.texte)) s = "incertain";
    if (s) details[d.cle] = s;
  }
  for (const [cible, prouve] of verifiees) {
    const cle = cible.startsWith("detail:") ? cible.slice("detail:".length) : null;
    if (cle && !candidats.some((d) => d.cle === cle)) details[cle] = prouve; // a detail beyond the cap: still noted
  }
  const avecDetails = Object.keys(details).length > 0;
  return { contenu: avecDetails ? estampillerDetails(contenu, details) : contenu, statuts, ...(avecDetails ? { details } : {}) };
}

/** Copies each detail's status into the brief sub-object it qualifies (`personnages[].tenue.statut`, `lieux[].aspect.statut`,
 * `elements[].statut`): the brief keeps a trace of it for its readers (prompt-asset, inventaire-assets). Copy; nothing is created. */
function estampillerDetails(contenu: Record<string, unknown>, details: Record<string, StatutDetail>): Record<string, unknown> {
  const c = { ...contenu };
  const estampiller = (section: string, sous: string | null, famille: Famille) => {
    const liste = c[section];
    if (!Array.isArray(liste)) return;
    let change = false;
    const nouvelle = liste.map((x) => {
      const o = objet(x);
      const nom = chaine(o.nom);
      const s = nom ? details[cleDetail(famille, nom)] : undefined;
      if (!s) return x;
      if (sous === null) {
        if (o.statut === s) return x;
        change = true;
        return { ...o, statut: s };
      }
      const so = o[sous];
      if (!so || typeof so !== "object" || Array.isArray(so) || (so as Record<string, unknown>).statut === s) return x;
      change = true;
      return { ...o, [sous]: { ...(so as Record<string, unknown>), statut: s } };
    });
    if (change) c[section] = nouvelle;
  };
  estampiller("personnages", "tenue", "tenue");
  estampiller("lieux", "aspect", "lieu");
  estampiller("elements", null, "element");
  return c;
}

const present = (fiche: Fiche, cle: string): boolean => (cle === "fin" ? true : !valeurVide(fiche.contenu[cle]));

/** The ESSENTIALS the user has not yet settled (labels of `REQUIS`), in order. */
export function manquesEssentiels(fiche: Fiche): string[] {
  const tranche = (cle: string) => fiche.statuts[cle] === "fourni" || fiche.statuts[cle] === "delegue";
  return REQUIS.filter((r) => !(present(fiche, r.cle) && tranche(r.cle))).map((r) => r.libelle);
}

/** What the user has not yet settled (labels), in order: the essentials, then the details to specify. This is what the agent
 * still has to dig into, and what the screen lists. */
export function manquesFiche(fiche: Fiche): string[] {
  return [...manquesEssentiels(fiche), ...detailsAPreciser(fiche).map((d) => d.libelle)];
}

/** The sheet is complete (decided in code): enough messages (two, three after a big first block), all the essentials settled, and the
 * details settled (said precisely or delegated); beyond `PLAFOND_MESSAGES_DETAILS` messages, the details no longer hold.
 * `messagesUtilisateur`: the messages (the first tells whether it is a big block), or just their count (ordinary minimum). */
export function ficheComplete(fiche: Fiche, messagesUtilisateur: number | readonly string[]): boolean {
  const nb = typeof messagesUtilisateur === "number" ? messagesUtilisateur : messagesUtilisateur.length;
  const min = typeof messagesUtilisateur === "number" ? MIN_MESSAGES_FICHE : minMessagesFiche(messagesUtilisateur);
  if (nb < min || manquesEssentiels(fiche).length > 0) return false;
  return nb >= PLAFOND_MESSAGES_DETAILS || detailsAPreciser(fiche).length === 0;
}

/** The sections the agent assumed or the user delegated to it: it cites them to the user so they keep or throw them away. */
export function suppositions(fiche: Fiche): string[] {
  return Object.keys(fiche.contenu).filter((k) => !valeurVide(fiche.contenu[k]) && fiche.statuts[k] !== "fourni" && !["inventions", "questionsOuvertes"].includes(k));
}

const TITRES_PROVISOIRES = new Set(["", "sans titre", "projet", "untitled"]);

/** The sheet does not (yet) have a real title. */
export const titreManquant = (fiche: Fiche): boolean => TITRES_PROVISOIRES.has(String(fiche.contenu.titre ?? "").trim().toLowerCase());

/** Input of the `notes-entretien` skill: the sheet as it is, and the conversation (who speaks, what). */
export function entreeNotes(messages: { role: string; content: string }[], fiche: Fiche) {
  return {
    fiche: { contenu: fiche.contenu, statuts: fiche.statuts },
    /** What the user has not yet settled: if their message leaves ALL the rest to the agent, each point is a delegation. */
    aTrancher: REQUIS.filter((r) => manquesEssentiels(fiche).includes(r.libelle)).map((r) => r.cle),
    /** The details to specify (costumes, sets, effects, continuity): their keys are those of the output's `details`. */
    detailsATrancher: detailsAPreciser(fiche).map((d) => ({ cle: d.cle, libelle: d.libelle })),
    /** The title is missing and the story has a core: the model MUST propose one (it used to forget when nothing obliged it to). */
    titreAProposer: titreManquant(fiche) && !valeurVide(fiche.contenu.arc),
    conversation: messages.map((m) => ({ qui: m.role === "user" ? ("utilisateur" as const) : ("agent" as const), texte: m.content })),
  };
}

/** From the sheet to the brief draft: the full shape (consumers read `.length` without a guard), with what the code
 * can set without inventing anything important (project title, French, one episode taking up the arc), marked "déduit". */
export function ficheVersBrief(fiche: Fiche, titreProjet: string): { contenu: BriefContenu; statuts: Record<string, "fourni" | "deduit"> } {
  const base = { ...(briefVide(titreProjet) as unknown as Record<string, unknown>), source: "pitch" };
  const contenu: Record<string, unknown> = { ...base };
  const statuts: Record<string, "fourni" | "deduit"> = {};
  for (const [k, v] of Object.entries(fiche.contenu)) {
    if (valeurVide(v)) continue;
    contenu[k] = v;
    statuts[k] = fiche.statuts[k] === "fourni" ? "fourni" : "deduit"; // the brief only knows fourni / déduit
  }
  if (valeurVide(contenu.langueDialogues)) {
    contenu.langueDialogues = "Français";
    statuts.langueDialogues = "deduit";
  }
  if (valeurVide(contenu.episodes)) {
    const titreEp = String(contenu.titre || titreProjet);
    contenu.episodes = [{ titre: TITRES_PROVISOIRES.has(titreEp.trim().toLowerCase()) ? "" : titreEp, resume: String(contenu.arc ?? "") }];
    statuts.episodes = "deduit";
  }
  return { contenu: contenu as unknown as BriefContenu, statuts };
}

/** From the current draft to the sheet: when a draft exists it is authoritative (the user may have corrected a section by hand,
 * which then becomes "fourni"). The follow-ups that are not brief sections (the ending) come from the memorised sheet. */
export function briefVersFiche(brouillon: { contenu: unknown; statuts: Record<string, string> }, memorisee: Fiche): Fiche {
  const statuts: Record<string, StatutFiche> = { ...memorisee.statuts };
  for (const [k, v] of Object.entries(brouillon.statuts)) if (!CLES_ABANDONNEES.includes(k)) statuts[k] = v === "fourni" ? "fourni" : statuts[k] === "delegue" ? "delegue" : "deduit";
  const contenu = sansClesAbandonnees({ ...objet(brouillon.contenu) });
  // The long prompt and the style image belong to the code: the interview model does not see them (and cannot rewrite them).
  const style = objet(contenu.style);
  if ("promptImage" in style || "image" in style) {
    const { promptImage: _p, image: _i, ...visible } = style;
    contenu.style = visible;
  }
  // The details' statuses live only in the memorised sheet (the brief only keeps a trace of them in its sub-objects).
  return { contenu, statuts, ...(memorisee.details ? { details: { ...memorisee.details } } : {}) };
}

/** What is shown to the conversation agent: the filled sections, without the statuses. */
export function fichePourAgent(fiche: Fiche): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fiche.contenu)) if (!valeurVide(v)) o[k] = v;
  return o;
}

/** The title the interview gives the project: the sheet's (said by the user or proposed by the model), adopted as long as the
 * project's name is still provisional ("Sans titre") or is only the sheet's former title. A title corrected by hand (at the clap)
 * is never overwritten. `null`: nothing to change. Pure. */
export function titreAAdopter(fiche: Fiche, ancienne: Fiche, nomProjet: string): string | null {
  const titre = typeof fiche.contenu.titre === "string" ? fiche.contenu.titre.trim() : "";
  if (TITRES_PROVISOIRES.has(titre.toLowerCase()) || titre === nomProjet.trim()) return null;
  const avant = typeof ancienne.contenu.titre === "string" ? ancienne.contenu.titre.trim() : "";
  const provisoire = TITRES_PROVISOIRES.has(nomProjet.trim().toLowerCase()) || (avant !== "" && nomProjet.trim() === avant);
  return provisoire ? titre.slice(0, 200) : null;
}
