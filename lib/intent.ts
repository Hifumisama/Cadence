/** L'INTENT d'un plan (`plans.description`) : le récit, les répliques (`NOM : « … »`), éventuellement une phrase « Consigne de l'auteur : … ». Pur, testé.
 *
 * - « État en fin de plan : … » n'est plus écrit (2026-11-08) : c'était le raccord entre plans de l'ancienne liaison ; une `suite` prolonge désormais le
 *   rendu précédent par son latent (Motion Context, lib/etapes-video.ts). Les plans écrits avant gardent cette ligne en base : `sansEtatDeFin` la retire
 *   à la lecture (affichage, entrées des skills). Aucune migration n'est nécessaire.
 * - « Consigne de l'auteur : … » reste STOCKÉE (plan-h3 et traduction-intent la lisent) mais ne s'affiche pas : quand le récit la respecte, elle le double.
 *   `intentAffichee` la masque. */

/** Le début de la ligne d'état de fin (ancien format), où qu'elle commence : en tête de ligne ou en fin de paragraphe (« Il frappe. État en fin de plan : … »). */
const ETAT_DE_FIN = /[ée]tat en fin de plan\s*:/i;
const CONSIGNE = /consigne de l['’]auteur\s*:/i;

const ranger = (lignes: string[]): string =>
  lignes
    .map((l) => l.replace(/[ \t  ]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Retire l'« État en fin de plan » d'une description écrite avant le 2026-11-08 : de la phrase jusqu'à la fin de son paragraphe (la ligne vide suivante).
 * Une description sans cette phrase est rendue telle quelle (aux blancs de fin près). */
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

/** La description contient-elle encore une ligne d'état de fin (plan écrit avant le 2026-11-08) ? */
export const aUnEtatDeFin = (description: string | null | undefined): boolean => ETAT_DE_FIN.test(description ?? "");

/** Retire la phrase « Consigne de l'auteur : … » (jusqu'à la fin de sa ligne). Pour l'AFFICHAGE seulement : le stockage la garde. */
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

/** L'intent tel qu'on l'AFFICHE : sans l'ancien « État en fin de plan », sans la « Consigne de l'auteur ». */
export const intentAffichee = (description: string | null | undefined): string => sansConsigneAuteur(sansEtatDeFin(description));

/** La phrase « Consigne de l'auteur : … » stockée dans la description (du marqueur à la fin de sa ligne), ou null. */
export function consigneAuteur(description: string | null | undefined): string | null {
  for (const ligne of (description ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const m = CONSIGNE.exec(ligne);
    if (m) return ligne.slice(m.index).trim();
  }
  return null;
}

/** Un texte réécrit (relu à la main dans la vue Lecture, ou rendu par un agent) garde la « Consigne de l'auteur » de la description actuelle quand il n'en porte
 * pas lui-même : elle est masquée à l'affichage (`intentAffichee`), donc absente de ce que l'on édite, et ne doit pas disparaître en silence. Un texte qui a
 * sa propre consigne la garde (c'est la nouvelle). */
export function conserverConsigneAuteur(nouvelle: string, actuelle: string | null | undefined): string {
  if (CONSIGNE.test(nouvelle)) return nouvelle;
  const consigne = consigneAuteur(actuelle);
  return consigne ? `${nouvelle.trimEnd()}\n\n${consigne}` : nouvelle;
}

/** Les deux descriptions disent-elles la même chose ? Les blancs ne comptent pas (retours chariot, espaces de fin de ligne, retours à la ligne). */
export const memeDescription = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? "").replace(/\s+/g, " ").trim() === (b ?? "").replace(/\s+/g, " ").trim();

/** Remplacer la description actuelle par celle d'un ancien essai la PERDRAIT-elle ? Oui quand elle diffère de celle de l'essai ET qu'aucun essai ne la porte
 * (une modification à la main depuis) : sinon elle reste retrouvable dans son propre essai. */
export function descriptionSeraitPerdue(actuelle: string | null | undefined, descriptionEssai: string | null | undefined, descriptionsDesEssais: (string | null | undefined)[]): boolean {
  if (descriptionEssai == null || memeDescription(actuelle, descriptionEssai)) return false;
  if (!(actuelle ?? "").trim()) return false;
  return !descriptionsDesEssais.some((d) => d != null && memeDescription(actuelle, d));
}

/** Ce qu'un texte (une fiche, un rendu) ne dit plus de l'intention du plan : la description d'aujourd'hui n'est plus celle dont il est parti. Sans valeur
 * enregistrée (plan écrit avant ce suivi), on ne sait pas : faux. */
export const intentionChangee = (description: string | null | undefined, descriptionDepart: string | null | undefined): boolean =>
  descriptionDepart != null && !memeDescription(description, descriptionDepart);

/** Les répliques `« … »` d'une description. */
export const repliquesIntent = (description: string): string[] => [...description.matchAll(/«\s*([\s\S]*?)\s*»/g)].map((m) => m[1]!.trim()).filter(Boolean);

const mots = (t: string): string[] => t.toLowerCase().match(/\p{L}{3,}/gu) ?? [];

/** Le récit seul : sans état de fin, sans consigne, sans lignes de réplique. */
export const recitDe = (description: string): string => sansConsigneAuteur(sansEtatDeFin(description).replace(LIGNE_REPLIQUE, "")).trim();

/** Une ligne de réplique : « NOM : « texte » » (le même motif que lib/h3ir/brief.ts). */
const LIGNE_REPLIQUE = /^[ \t  ]*[^:«»\n]{1,60}?[ \t  ]*:[ \t  ]*«[^\n]*»[ \t  ]*$/gm;

/** Pourquoi une NOUVELLE description (écrite par un agent qui corrige un plan) ne peut pas remplacer l'actuelle, ou null si elle le peut.
 * Un agent ne rend parfois qu'un morceau (la seule phrase qu'il a changée : un `iteration-plan` a rendu, pour une description complète, ses
 * 222 caractères d'ancien état de fin seulement) ; la remplacer effacerait le récit, et la correction suivante ne verrait plus rien. Refusée quand :
 * - elle n'a plus de récit (seulement des répliques, une consigne ou l'ancien état de fin) ;
 * - elle est beaucoup plus courte que le récit actuel (moins de 40 % ; 25 % pour une réécriture, qui peut légitimement simplifier) ET n'en garde
 *   presque aucun mot (moins de 30 %) : c'est un fragment, pas une description.
 * Les deux textes sont comparés SANS leur état de fin (ancien format). La perte d'une réplique se signale à part (`repliquesPerdues`). */
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

/** Les répliques de l'actuelle qui ne sont plus dans la nouvelle (aux blancs et à la casse près). */
export function repliquesPerdues(nouvelle: string | null | undefined, actuelle: string | null | undefined): string[] {
  const norme = (s: string) => s.toLowerCase().replace(/[\s  ]+/g, " ").trim();
  const n = norme(nouvelle ?? "");
  return repliquesIntent(actuelle ?? "").filter((r) => !n.includes(norme(r)));
}
