import { CLES_ABANDONNEES, briefVide, sansClesAbandonnees } from "./brief";
import type { BriefContenu } from "./types";

/** La fiche de notes de l'entretien d'entrée : le brief en train de se remplir, tenu PAR LE CODE. À chaque message de
 * l'utilisateur, le skill `notes-entretien` rend un PATCH (les sections que ce message change, avec la citation qui le
 * prouve) ; le code vérifie les citations, applique le patch, et décide seul de ce qui manque et de quand la fiche est
 * complète. Le modèle ne tient donc ni comptabilité ni critère d'arrêt (il les tenait mal : trop indulgent, et il se
 * contredisait). Une fois complète, la fiche devient le brouillon du brief, sans appel de rédaction. Pur. */

/** `fourni` : l'utilisateur l'a dit. `delegue` : il a explicitement laissé l'agent décider (« je te laisse choisir ») : la question est
 * tranchée, le contenu reste une proposition de l'agent. `deduit` : l'agent l'a supposé, personne ne l'a tranché. */
export type StatutFiche = "fourni" | "delegue" | "deduit";
/** Statut d'un DÉTAIL (tenue, aspect d'un lieu, élément, raccords) : `incertain` = dit, mais en termes vagues (« inspirée de… » sans couleur
 * ni matière) : il reste à préciser. */
export type StatutDetail = StatutFiche | "incertain";
/** `details` : le statut de chaque détail à préciser (clé `tenue:<nom normalisé>`, `lieu:…`, `element:…`, `raccords`), absent tant qu'aucun
 * n'est suivi. Il vit dans la fiche seulement : le brief en garde la trace dans le `statut` des sous-objets (voir `estampillerDetails`). */
export type Fiche = { contenu: Record<string, unknown>; statuts: Record<string, StatutFiche>; details?: Record<string, StatutDetail> };

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
  "elements",
  "inventions",
  "questionsOuvertes",
] as const;

/** Sections purement informatives : une « délégation » sur elles ne tranche rien (et ne ferme donc jamais l'entretien). */
const SECTIONS_INFORMATIVES: readonly string[] = ["inventions", "questionsOuvertes"];

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
/** Quand le premier message est un gros bloc (projet 236 : un seul message remplissait tout), on veut au moins deux réponses après lui :
 * même densité d'information, obtenue en plusieurs échanges. */
export const MIN_MESSAGES_GROS_BLOC = 3;
/** Longueur (caractères) à partir de laquelle le premier message est un « gros bloc » : une idée tient d'ordinaire en deux ou trois phrases. */
export const SEUIL_GROS_BLOC = 500;
/** Plafond des relances sur les détails : à partir de ce nombre de messages de l'utilisateur, les détails encore à préciser ne retiennent
 * plus l'entretien (ils restent listés, l'agent peut continuer à les creuser). L'entretien ne s'éternise jamais. */
export const PLAFOND_MESSAGES_DETAILS = 10;
/** Nombre de détails suivis au plus, par famille (dans l'ordre de la fiche : le héros d'abord). */
const MAX_DETAILS = { tenue: 3, lieu: 2, element: 2 } as const;

/** Le premier message de l'utilisateur est-il un gros bloc ? */
export const premierMessageGrosBloc = (messagesUtilisateur: readonly string[]): boolean => (messagesUtilisateur[0]?.trim().length ?? 0) >= SEUIL_GROS_BLOC;

/** Le minimum de messages de l'utilisateur pour cette conversation. */
export const minMessagesFiche = (messagesUtilisateur: readonly string[]): number => (premierMessageGrosBloc(messagesUtilisateur) ? MIN_MESSAGES_GROS_BLOC : MIN_MESSAGES_FICHE);

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
  const contenu = sansClesAbandonnees(objet(o.contenu));
  const statuts: Record<string, StatutFiche> = {};
  for (const [k, v] of Object.entries(objet(o.statuts))) if (!CLES_ABANDONNEES.includes(k) && (v === "fourni" || v === "deduit" || v === "delegue")) statuts[k] = v;
  const details: Record<string, StatutDetail> = {};
  for (const [k, v] of Object.entries(objet(o.details))) if (v === "fourni" || v === "deduit" || v === "delegue" || v === "incertain") details[k] = v;
  return { contenu: { ...contenu }, statuts, ...(Object.keys(details).length ? { details } : {}) };
}

// --- Les détails à préciser (deuxième niveau de complétude) ---------------------------------------------------------------------
// Une fois l'essentiel tranché, la fiche doit encore dire ce qui se DESSINE : la tenue de chaque personnage, l'aspect de chaque lieu, la
// couleur et l'ampleur de chaque effet ou objet, et si les tenues changent (raccords). Ces détails se génèrent depuis la fiche (un par
// personnage, lieu, élément, plafonnés) ; chacun est tranché s'il est dit précisément (citation vérifiée, sans formule vague) ou délégué.

export type DetailAPreciser = {
  /** `tenue:<nom normalisé>`, `lieu:…`, `element:…` ou `raccords`. */
  cle: string;
  libelle: string;
  /** Mots (normalisés) qui désignent ce détail dans une question ou une réponse : son nom et son thème. */
  themes: string[];
};

type Famille = "tenue" | "lieu" | "element";
type DetailCandidat = DetailAPreciser & { present: boolean; texte: string };

const chaine = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const listeObjets = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(objet) : []);

export const cleDetail = (famille: Famille, nom: string): string => `${famille}:${normaliser(nom)}`;

/** Une clé de détail rendue par le modèle, normalisée (« tenue:Aang » → « tenue:aang ») ; null si elle n'a pas la forme attendue. */
export function lireCleDetail(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  if (normaliser(brut) === "raccords") return "raccords";
  const i = brut.indexOf(":");
  if (i < 0) return null;
  const famille = normaliser(brut.slice(0, i));
  const nom = normaliser(brut.slice(i + 1));
  return (famille === "tenue" || famille === "lieu" || famille === "element") && nom ? `${famille}:${nom}` : null;
}

/** Une formule de référence (« inspirée de… », « style de… », « comme dans… », « les couleurs de… ») SANS couleur ni matière nommée : ça
 * ne se dessine pas. Le texte est normalisé (accents, casse) avant d'être lu. */
const VAGUE = / (inspir[a-z]*|style|facon|maniere|comme|rappel[a-z]*|reference|clin d oeil|couleurs? (de|du|des|d)) /;
const COULEUR =
  / (rouge|bleu|vert|jaune|orange|violet|violette|rose|noir|blanc|blanche|gris|grise|brun|marron|beige|ocre|dore|argente|safran|pourpre|ecarlate|turquoise|cyan|indigo|kaki|creme|ivoire|bordeaux|cuivre|bronze|sable|emeraude|rubis|saphir|ambre|lavande|mauve|olive|corail|anthracite|prune|fauve|roux|rousse|terracotta|sepia|pastel|carmin|vermillon|azur|magenta|taupe|chocolat|caramel|miel|terre)(s|e|es|x|ee|ees)? /;
const MATIERE =
  / (coton|lin|laine|soie|cuir|velours|jean|denim|toile|satin|feutre|fourrure|metal|metallique|acier|fer|bois|pierre|verre|plastique|nylon|polyester|cachemire|tweed|daim|tricot|papier|beton|marbre|brique|bambou|chanvre|caoutchouc|latex|lainage|mousseline|tulle|dentelle|maille|plume|ecaille|corne|argile|chaume|tuile|ardoise|granit|lame|brocart)(s|e|es|x)? /;

export function formuleVague(texte: string): boolean {
  const t = ` ${normaliser(texte)} `;
  return VAGUE.test(t) && !COULEUR.test(t) && !MATIERE.test(t);
}

/** Tous les détails que la fiche appelle (tranchés ou non), dans l'ordre de l'entretien : tenues, décors, effets et objets, raccords. */
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

/** Un détail est tranché : présent dans la fiche ET dit précisément par l'utilisateur, ou délégué par lui (citation vérifiée). Un détail dit
 * en termes vagues reste à préciser, quel que soit son statut. */
function detailTranche(fiche: Fiche, d: DetailCandidat): boolean {
  const s = fiche.details?.[d.cle];
  return d.present && (s === "delegue" || (s === "fourni" && !formuleVague(d.texte)));
}

/** Les détails encore à préciser, dans l'ordre (tenues, décors, effets et objets, raccords). */
export function detailsAPreciser(fiche: Fiche): DetailAPreciser[] {
  return detailsCandidats(fiche.contenu)
    .filter((d) => !detailTranche(fiche, d))
    .map(({ cle, libelle, themes }) => ({ cle, libelle, themes }));
}

/** Les thèmes d'une section, pour reconnaître une délégation qui la vise (voir `delegationsBornees`). */
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

/** Une délégation GLOBALE : seule une formulation qui vise « le reste » ou « tout » (« carte blanche pour le reste », « imagine le reste »,
 * « décide de tout ») vaut pour plusieurs sujets à la fois. « Carte blanche » seule est comprise comme globale (c'est l'expression consacrée). */
const GLOBALE = / (carte blanche|le reste|ce qui reste|ce qu il reste|pour tout|de tout|decide tout|tout decider|tout choisir|te laisse tout|imagine tout|invente tout) /;
export const delegationGlobale = (citation: string): boolean => GLOBALE.test(` ${normaliser(citation)} `);

const mentionne = (texte: string, themes: string[]): boolean => themes.some((m) => m.length > 0 && ` ${texte}`.includes(` ${m}`));

type Preuve = { cible: string; statut: StatutFiche; citation: string };

/** Délégations bornées (retour du projet 236 : « Je te laisse décider », réponse à UNE question sur la musique, avait été appliqué à toutes les
 * sections) : une délégation qui n'est pas globale ne vaut que pour le sujet de la question. Concrètement, quand la même citation non globale
 * délègue PLUSIEURS sujets, seuls ceux que la réponse de l'utilisateur, ou la question de l'agent juste avant, nomme (nom ou thème) sont
 * retenus ; une délégation d'un seul sujet est gardée (le modèle l'a rattachée à la question). */
function delegationsBornees(preuves: Preuve[], themesDe: (cible: string) => string[], contexte: (citation: string) => string): Preuve[] {
  const cibles = new Map<string, Set<string>>();
  for (const p of preuves) if (p.statut === "delegue") cibles.set(p.citation, (cibles.get(p.citation) ?? new Set()).add(p.cible));
  return preuves.filter((p) => {
    if (p.statut !== "delegue" || delegationGlobale(p.citation)) return true;
    if ((cibles.get(p.citation)?.size ?? 0) <= 1) return true;
    return mentionne(contexte(p.citation), themesDe(p.cible));
  });
}

/** Applique le patch d'UN appel de `notes-entretien`. Une section n'est « fournie » que si sa source est « dit » ET que sa
 * citation figure à l'identique (accents, casse, ponctuation mis à part) dans un message de l'utilisateur : une citation
 * inventée, reformulée ou prise à l'agent ne prouve rien, la section reste « déduite ». Ce que l'utilisateur a dit se
 * confirme (une source vérifiée sur une section non modifiée la passe à « fourni ») mais ne se perd jamais par un patch vide.
 * Les délégations sont bornées (`delegationsBornees`), et une délégation sur une section informative (questions ouvertes, inventions) ne
 * tranche rien. Les détails (`details` de la sortie) suivent les mêmes règles ; un détail dit en termes vagues est « incertain ».
 * `conversation` (facultative : tous les tours, agent compris) sert à retrouver la question à laquelle une délégation répond. */
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

  // Les preuves : sources de sections, la fin (son propre champ, obligatoire : un modèle remplit bien un champ requis, et oublie une source
  // facultative), et les détails. Seules les citations vérifiées comptent.
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

  const verifiees = new Map<string, StatutFiche>(); // section (ou « detail:<clé> ») → « fourni » (« dit » vérifié) ou « delegue »
  for (const p of delegationsBornees(preuves, themesDe, contexte)) if (verifiees.get(p.cible) !== "fourni") verifiees.set(p.cible, p.statut);

  const statuts = { ...fiche.statuts };
  for (const cle of touchees) {
    const prouve = verifiees.get(cle);
    if (prouve) statuts[cle] = prouve;
    else statuts[cle] = statuts[cle] === "fourni" || statuts[cle] === "delegue" ? statuts[cle]! : "deduit"; // enrichir une section dite ne la rend pas supposée
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
    if (cle && !candidats.some((d) => d.cle === cle)) details[cle] = prouve; // un détail hors plafond : noté quand même
  }
  const avecDetails = Object.keys(details).length > 0;
  return { contenu: avecDetails ? estampillerDetails(contenu, details) : contenu, statuts, ...(avecDetails ? { details } : {}) };
}

/** Recopie le statut de chaque détail dans le sous-objet du brief qu'il qualifie (`personnages[].tenue.statut`, `lieux[].aspect.statut`,
 * `elements[].statut`) : le brief en garde la trace pour ses lecteurs (prompt-asset, inventaire-assets). Copie ; rien n'est créé. */
export function estampillerDetails(contenu: Record<string, unknown>, details: Record<string, StatutDetail>): Record<string, unknown> {
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

/** L'ESSENTIEL que l'utilisateur n'a pas encore tranché (libellés de `REQUIS`), dans l'ordre. */
export function manquesEssentiels(fiche: Fiche): string[] {
  const tranche = (cle: string) => fiche.statuts[cle] === "fourni" || fiche.statuts[cle] === "delegue";
  return REQUIS.filter((r) => !(present(fiche, r.cle) && tranche(r.cle))).map((r) => r.libelle);
}

/** Ce que l'utilisateur n'a pas encore tranché (libellés), dans l'ordre : l'essentiel, puis les détails à préciser. C'est ce que l'agent
 * doit encore creuser, et ce que l'écran liste. */
export function manquesFiche(fiche: Fiche): string[] {
  return [...manquesEssentiels(fiche), ...detailsAPreciser(fiche).map((d) => d.libelle)];
}

/** La fiche est complète (décidé en code) : assez de messages (deux, trois après un gros premier bloc), tout l'essentiel tranché, et les
 * détails tranchés (dits précisément ou délégués) ; au-delà de `PLAFOND_MESSAGES_DETAILS` messages, les détails ne retiennent plus.
 * `messagesUtilisateur` : les messages (le premier dit si c'est un gros bloc), ou leur seul nombre (minimum ordinaire). */
export function ficheComplete(fiche: Fiche, messagesUtilisateur: number | readonly string[]): boolean {
  const nb = typeof messagesUtilisateur === "number" ? messagesUtilisateur : messagesUtilisateur.length;
  const min = typeof messagesUtilisateur === "number" ? MIN_MESSAGES_FICHE : minMessagesFiche(messagesUtilisateur);
  if (nb < min || manquesEssentiels(fiche).length > 0) return false;
  return nb >= PLAFOND_MESSAGES_DETAILS || detailsAPreciser(fiche).length === 0;
}

/** Les sections que l'agent a supposées ou que l'utilisateur lui a déléguées : il les cite à l'utilisateur pour qu'il les garde ou les jette. */
export function suppositions(fiche: Fiche): string[] {
  return Object.keys(fiche.contenu).filter((k) => !valeurVide(fiche.contenu[k]) && fiche.statuts[k] !== "fourni" && !["inventions", "questionsOuvertes"].includes(k));
}

const TITRES_PROVISOIRES = new Set(["", "sans titre", "projet", "untitled"]);

/** La fiche n'a pas (encore) de vrai titre. */
export const titreManquant = (fiche: Fiche): boolean => TITRES_PROVISOIRES.has(String(fiche.contenu.titre ?? "").trim().toLowerCase());

/** Entrée du skill `notes-entretien` : la fiche telle qu'elle est, et la conversation (qui parle, quoi). */
export function entreeNotes(messages: { role: string; content: string }[], fiche: Fiche) {
  return {
    fiche: { contenu: fiche.contenu, statuts: fiche.statuts },
    /** Ce que l'utilisateur n'a pas encore tranché : si son message laisse TOUT le reste à l'agent, chaque point est une délégation. */
    aTrancher: REQUIS.filter((r) => manquesEssentiels(fiche).includes(r.libelle)).map((r) => r.cle),
    /** Les détails à préciser (tenues, décors, effets, raccords) : leurs clés sont celles des `details` de la sortie. */
    detailsATrancher: detailsAPreciser(fiche).map((d) => ({ cle: d.cle, libelle: d.libelle })),
    /** Le titre manque et l'histoire a un cœur : le modèle DOIT en proposer un (il l'oubliait quand rien ne l'y obligeait). */
    titreAProposer: titreManquant(fiche) && !valeurVide(fiche.contenu.arc),
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
    const titreEp = String(contenu.titre || titreProjet);
    contenu.episodes = [{ titre: TITRES_PROVISOIRES.has(titreEp.trim().toLowerCase()) ? "" : titreEp, resume: String(contenu.arc ?? "") }];
    statuts.episodes = "deduit";
  }
  return { contenu: contenu as unknown as BriefContenu, statuts };
}

/** Du brouillon courant à la fiche : quand un brouillon existe il fait foi (l'utilisateur a pu corriger une section à la main,
 * qui passe alors « fourni »). Les suivis qui ne sont pas des sections du brief (la fin) viennent de la fiche mémorisée. */
export function briefVersFiche(brouillon: { contenu: unknown; statuts: Record<string, string> }, memorisee: Fiche): Fiche {
  const statuts: Record<string, StatutFiche> = { ...memorisee.statuts };
  for (const [k, v] of Object.entries(brouillon.statuts)) if (!CLES_ABANDONNEES.includes(k)) statuts[k] = v === "fourni" ? "fourni" : statuts[k] === "delegue" ? "delegue" : "deduit";
  const contenu = sansClesAbandonnees({ ...objet(brouillon.contenu) });
  // Le prompt long et l'image du style appartiennent au code : le modèle de l'entretien ne les voit pas (et ne peut pas les réécrire).
  const style = objet(contenu.style);
  if ("promptImage" in style || "image" in style) {
    const { promptImage: _p, image: _i, ...visible } = style;
    contenu.style = visible;
  }
  // Les statuts des détails ne vivent que dans la fiche mémorisée (le brief n'en garde que la trace dans ses sous-objets).
  return { contenu, statuts, ...(memorisee.details ? { details: { ...memorisee.details } } : {}) };
}

/** Ce qui s'affiche à l'agent de conversation : les sections remplies, sans les statuts. */
export function fichePourAgent(fiche: Fiche): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fiche.contenu)) if (!valeurVide(v)) o[k] = v;
  return o;
}

/** Le titre que l'entretien donne au projet : celui de la fiche (dit par l'utilisateur ou proposé par le modèle), adopté tant que le
 * nom du projet est encore provisoire (« Sans titre ») ou n'est que l'ancien titre de la fiche. Un titre corrigé à la main (au clap)
 * n'est jamais écrasé. `null` : rien à changer. Pur. */
export function titreAAdopter(fiche: Fiche, ancienne: Fiche, nomProjet: string): string | null {
  const titre = typeof fiche.contenu.titre === "string" ? fiche.contenu.titre.trim() : "";
  if (TITRES_PROVISOIRES.has(titre.toLowerCase()) || titre === nomProjet.trim()) return null;
  const avant = typeof ancienne.contenu.titre === "string" ? ancienne.contenu.titre.trim() : "";
  const provisoire = TITRES_PROVISOIRES.has(nomProjet.trim().toLowerCase()) || (avant !== "" && nomProjet.trim() === avant);
  return provisoire ? titre.slice(0, 200) : null;
}
