import { briefVide } from "./brief";
import type { BriefContenu } from "./types";

/** La fiche de notes de l'entretien d'entrée : le brief en train de se remplir, tenu PAR LE CODE. À chaque message de
 * l'utilisateur, le skill `notes-entretien` rend un PATCH (les sections que ce message change, avec la citation qui le
 * prouve) ; le code vérifie les citations, applique le patch, et décide seul de ce qui manque et de quand la fiche est
 * complète. Le modèle ne tient donc ni comptabilité ni critère d'arrêt (il les tenait mal : trop indulgent, et il se
 * contredisait). Une fois complète, la fiche devient le brouillon du brief, sans appel de rédaction. Pur. */

/** `fourni` : l'utilisateur l'a dit. `delegue` : il a explicitement laissé l'agent décider (« je te laisse choisir ») : la question est
 * tranchée, le contenu reste une proposition de l'agent. `deduit` : l'agent l'a supposé, personne ne l'a tranché. */
export type StatutFiche = "fourni" | "delegue" | "deduit";
export type Fiche = { contenu: Record<string, unknown>; statuts: Record<string, StatutFiche> };

export const FICHE_VIDE: Fiche = { contenu: {}, statuts: {} };

/** Les sections du brief que le patch peut écrire (`notes` n'est jamais écrite par l'agent : c'est l'utilisateur qui les pose). */
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
  "continuite",
  "rimes",
  "progressions",
  "pieges",
  "inventions",
  "questionsOuvertes",
] as const;

/** Ce que l'UTILISATEUR doit avoir tranché (dit, ou délégué à l'agent, prouvé par une citation) pour que la fiche soit complète. `fin` n'est
 * pas une section du brief : la fin vit dans `arc`, mais on suit à part si l'utilisateur l'a dite. */
export const REQUIS = [
  { cle: "arc", libelle: "le cœur de l'histoire (le héros, ce qu'il veut, ce qui la fait basculer)" },
  { cle: "fin", libelle: "la fin (comment ça se termine, ce qu'on doit ressentir en sortant)" },
  { cle: "genreTon", libelle: "le ton et le genre" },
  { cle: "style", libelle: "le style visuel" },
  { cle: "rythme", libelle: "le rythme (lent, mesuré, vif…)" },
  { cle: "dureeEpisodeSecondes", libelle: "la durée visée" },
  { cle: "personnages", libelle: "le héros : son âge et son apparence" },
] as const;

/** Sections que le patch peut citer sans les modifier (« j'ai confirmé ce qui est déjà noté ») : toutes, plus `fin`. */
export const SECTIONS_CITABLES: readonly string[] = [...SECTIONS_PATCHABLES, "fin"];

/** Messages de l'utilisateur au moins avant qu'une fiche puisse être déclarée complète : l'idée, puis une réponse. */
export const MIN_MESSAGES_FICHE = 2;

export const normaliser = (t: string): string =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Longueur minimale (normalisée) d'une citation : un « oui » ne prouve pas un sujet. */
const CITATION_MIN = 4;

function citationVerifiee(citation: unknown, corpus: string[]): boolean {
  if (typeof citation !== "string") return false;
  const c = normaliser(citation);
  return c.length >= CITATION_MIN && corpus.some((m) => m.includes(c));
}

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Une valeur qui ne dit rien (chaîne vide, liste vide, style sans nom ni clause) : jamais appliquée, elle n'efface rien. */
export function valeurVide(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(valeurVide);
  return false;
}

/** Lit une fiche venue de la base : une forme inattendue donne une fiche vide. */
export function lireFiche(brut: unknown): Fiche {
  const o = objet(brut);
  const contenu = objet(o.contenu);
  const statuts: Record<string, StatutFiche> = {};
  for (const [k, v] of Object.entries(objet(o.statuts))) if (v === "fourni" || v === "deduit" || v === "delegue") statuts[k] = v;
  return { contenu: { ...contenu }, statuts };
}

/** Applique le patch d'UN appel de `notes-entretien`. Une section n'est « fournie » que si sa source est « dit » ET que sa
 * citation figure à l'identique (accents, casse, ponctuation mis à part) dans un message de l'utilisateur : une citation
 * inventée, reformulée ou prise à l'agent ne prouve rien, la section reste « déduite ». Ce que l'utilisateur a dit se
 * confirme (une source vérifiée sur une section non modifiée la passe à « fourni ») mais ne se perd jamais par un patch vide. */
export function appliquerNotes(fiche: Fiche, sortie: unknown, messagesUtilisateur: string[]): Fiche {
  const corpus = messagesUtilisateur.map(normaliser);
  const o = objet(sortie);
  const modifications = objet(o.modifications);
  const verifiees = new Map<string, StatutFiche>(); // section → « fourni » (source « dit » vérifiée) ou « delegue » (idem pour une délégation)
  // La fin a son propre champ (obligatoire) dans la sortie : un modèle remplit bien un champ requis, et oublie une source facultative.
  const fin = objet(o.fin);
  const sources = [...(Array.isArray(o.sources) ? o.sources : []), { section: "fin", origine: fin.origine, citation: fin.citation }];
  for (const s of sources) {
    const { section, origine, citation } = objet(s);
    if (typeof section !== "string" || !SECTIONS_CITABLES.includes(section)) continue;
    if ((origine !== "dit" && origine !== "delegue") || !citationVerifiee(citation, corpus)) continue;
    const statut: StatutFiche = origine === "dit" ? "fourni" : "delegue";
    if (verifiees.get(section) !== "fourni") verifiees.set(section, statut);
  }
  const contenu = { ...fiche.contenu };
  const statuts = { ...fiche.statuts };
  for (const [cle, valeur] of Object.entries(modifications)) {
    if (!(SECTIONS_PATCHABLES as readonly string[]).includes(cle) || valeurVide(valeur)) continue;
    contenu[cle] = valeur;
    const prouve = verifiees.get(cle);
    if (prouve) statuts[cle] = prouve;
    else statuts[cle] = statuts[cle] === "fourni" || statuts[cle] === "delegue" ? statuts[cle]! : "deduit"; // enrichir une section dite ne la rend pas supposée
  }
  for (const [cle, prouve] of verifiees) {
    if (cle === "fin" || !valeurVide(contenu[cle])) statuts[cle] = statuts[cle] === "fourni" && prouve === "delegue" ? "fourni" : prouve;
  }
  return { contenu, statuts };
}

const present = (fiche: Fiche, cle: string): boolean => (cle === "fin" ? true : !valeurVide(fiche.contenu[cle]));

/** Ce que l'utilisateur n'a pas encore DIT (libellés), dans l'ordre : c'est ce que l'agent doit encore creuser. */
export function manquesFiche(fiche: Fiche): string[] {
  const tranche = (cle: string) => fiche.statuts[cle] === "fourni" || fiche.statuts[cle] === "delegue";
  return REQUIS.filter((r) => !(present(fiche, r.cle) && tranche(r.cle))).map((r) => r.libelle);
}

/** La fiche est complète : tout l'essentiel est dit par l'utilisateur, après au moins un échange. Décidé en code. */
export const ficheComplete = (fiche: Fiche, nbMessagesUtilisateur: number): boolean =>
  nbMessagesUtilisateur >= MIN_MESSAGES_FICHE && manquesFiche(fiche).length === 0;

/** Les sections que l'agent a supposées ou que l'utilisateur lui a déléguées : il les cite à l'utilisateur pour qu'il les garde ou les jette. */
export function suppositions(fiche: Fiche): string[] {
  return Object.keys(fiche.contenu).filter((k) => !valeurVide(fiche.contenu[k]) && fiche.statuts[k] !== "fourni" && !["inventions", "questionsOuvertes"].includes(k));
}

/** Entrée du skill `notes-entretien` : la fiche telle qu'elle est, et la conversation (qui parle, quoi). */
export function entreeNotes(messages: { role: string; content: string }[], fiche: Fiche) {
  return {
    fiche: { contenu: fiche.contenu, statuts: fiche.statuts },
    /** Ce que l'utilisateur n'a pas encore tranché : si son message laisse TOUT le reste à l'agent, chaque point est une délégation. */
    aTrancher: REQUIS.filter((r) => manquesFiche(fiche).includes(r.libelle)).map((r) => r.cle),
    conversation: messages.map((m) => ({ qui: m.role === "user" ? ("utilisateur" as const) : ("agent" as const), texte: m.content })),
  };
}

/** De la fiche au brouillon de brief : la forme complète (les consommateurs lisent `.length` sans garde), avec ce que le code
 * peut poser sans rien inventer d'important (titre du projet, français, un épisode qui reprend l'arc), marqué « déduit ». */
export function ficheVersBrief(fiche: Fiche, titreProjet: string): { contenu: BriefContenu; statuts: Record<string, "fourni" | "deduit"> } {
  const base = { ...(briefVide(titreProjet) as unknown as Record<string, unknown>), source: "pitch" };
  const contenu: Record<string, unknown> = { ...base };
  const statuts: Record<string, "fourni" | "deduit"> = {};
  for (const [k, v] of Object.entries(fiche.contenu)) {
    if (valeurVide(v)) continue;
    contenu[k] = v;
    statuts[k] = fiche.statuts[k] === "fourni" ? "fourni" : "deduit"; // le brief ne connaît que fourni / déduit
  }
  if (valeurVide(contenu.langueDialogues)) {
    contenu.langueDialogues = "Français";
    statuts.langueDialogues = "deduit";
  }
  if (valeurVide(contenu.episodes)) {
    contenu.episodes = [{ titre: String(contenu.titre || titreProjet), resume: String(contenu.arc ?? "") }];
    statuts.episodes = "deduit";
  }
  return { contenu: contenu as unknown as BriefContenu, statuts };
}

/** Du brouillon courant à la fiche : quand un brouillon existe il fait foi (l'utilisateur a pu corriger une section à la main,
 * qui passe alors « fourni »). Les suivis qui ne sont pas des sections du brief (la fin) viennent de la fiche mémorisée. */
export function briefVersFiche(brouillon: { contenu: unknown; statuts: Record<string, string> }, memorisee: Fiche): Fiche {
  const statuts: Record<string, StatutFiche> = { ...memorisee.statuts };
  for (const [k, v] of Object.entries(brouillon.statuts)) statuts[k] = v === "fourni" ? "fourni" : statuts[k] === "delegue" ? "delegue" : "deduit";
  const contenu = { ...objet(brouillon.contenu) };
  // Le prompt long et l'image du style appartiennent au code : le modèle de l'entretien ne les voit pas (et ne peut pas les réécrire).
  const style = objet(contenu.style);
  if ("promptImage" in style || "image" in style) {
    const { promptImage: _p, image: _i, ...visible } = style;
    contenu.style = visible;
  }
  return { contenu, statuts };
}

/** Ce qui s'affiche à l'agent de conversation : les sections remplies, sans les statuts. */
export function fichePourAgent(fiche: Fiche): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fiche.contenu)) if (!valeurVide(v)) o[k] = v;
  return o;
}
