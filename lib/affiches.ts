/** Affiches de présentation (image d'un projet ou d'un épisode) — règles pures, sans base ni disque.
 *
 * Une affiche se génère avec la MÊME mécanique qu'une image d'asset (file ComfyUI, candidats, « Utiliser »), donc elle
 * s'appuie sur un asset d'un type à part, `affiche`. Cet asset est un détail d'implémentation : il n'apparaît jamais dans
 * le registre, ne compte pas dans les totaux et n'est jamais montré à l'agent (voir `horsAffiches`, lib/assets-visibles.ts).
 * Quand un candidat est adopté, son image devient l'affiche du projet ou de l'épisode (`posterFichier`). Par défaut le titre
 * n'est pas dans l'image : il se superpose à l'affichage (components/ui/Poster.tsx) ; il peut aussi être écrit par le modèle
 * (ligne `Title lettering:` du prompt) et le fichier d'affiche porte alors le suffixe `-titre` (lib/poster.ts). */

export const TYPE_AFFICHE = "affiche";

/** Ce qu'une affiche habille : le projet, une saison ou un épisode. */
export type CibleAffiche = "projects" | "seasons" | "episodes";

const LETTRE: Record<CibleAffiche, string> = { projects: "P", seasons: "S", episodes: "E" };

/** Code de l'asset d'affiche : un par projet, par saison, par épisode. */
export function codeAffiche(cible: CibleAffiche, id: number): string {
  return `AFFICHE_${LETTRE[cible]}${id}`;
}

/** Retrouve ce que désigne un code d'affiche, ou null si ce n'en est pas un. */
export function cibleDeCodeAffiche(code: string): { cible: CibleAffiche; id: number } | null {
  const m = /^AFFICHE_([PSE])(\d+)$/.exec(code);
  if (!m) return null;
  return { cible: m[1] === "P" ? "projects" : m[1] === "S" ? "seasons" : "episodes", id: Number(m[2]) };
}

/** Format et définition proposés d'entrée : toutes les affiches (projet, saison, épisode) sont en 2:3, comme les cartes.
 * Modifiables dans la fenêtre de génération. */
export function formatAfficheParDefaut(): { aspect: "2:3"; megapixels: number } {
  return { aspect: "2:3", megapixels: 1.3 };
}

const LIGNE_SANS_TEXTE = "No text, no lettering, no logo, no watermark.";
const DEBUT_LIGNE_TITRE = "Title lettering:";

/** Le prompt proposé : un gabarit rempli avec ce que le projet sait de lui-même. La clause de style n'y figure pas (le
 * workflow l'ajoute à part). Pas d'étiquette (« Story: ») ni de titre entre guillemets hors du cas « titre dans l'image » :
 * le modèle dessinerait les mots qu'on lui donne. Le résumé est en français, donc seul l'agent (skill `prompt-affiche`)
 * fait un vrai prompt ; ce gabarit n'est que le point de départ. */
export function promptAffiche(entree: { cible: CibleAffiche; titre: string; resume?: string | null; genreTon?: string | null; titreDansImage?: boolean }): string {
  const resume = (entree.resume ?? "").trim().replace(/\s+/g, " ");
  const ton = (entree.genreTon ?? "").trim().replace(/[.\s]+$/, "");
  const lignes = [
    `Cinematic poster key art${ton ? `, ${ton} mood` : ""}.`,
    ...(resume ? [`The scene: ${resume}`] : []),
    "Vertical poster composition, one strong focal subject, atmospheric lighting.",
  ];
  return avecTitreDansImage(lignes.join("\n"), entree.titre, entree.titreDansImage === true);
}

/** Le titre est-il demandé dans l'image ? Vrai quand le prompt porte la ligne `Title lettering: …`. C'est le prompt qui fait
 * foi (celui du candidat à l'adoption) : pas de réglage à stocker à part. */
export function titreDansPrompt(prompt: string): boolean {
  return prompt.split("\n").some((l) => l.trimStart().startsWith(DEBUT_LIGNE_TITRE));
}

/** Met ou retire la ligne de titre d'un prompt (modifié à la main ou écrit par l'agent compris) : actif → la ligne « sans
 * texte » est remplacée par la ligne de titre ; inactif → l'inverse. Le reste du prompt n'est pas touché. */
export function avecTitreDansImage(prompt: string, titre: string, actif: boolean): string {
  const nom = titre.trim() || "Untitled";
  const lignes = prompt
    .split("\n")
    .filter((l) => !l.trimStart().startsWith(DEBUT_LIGNE_TITRE) && !/^\s*No text/i.test(l))
    .map((l) => l.trimEnd());
  while (lignes.length > 0 && lignes[lignes.length - 1] === "") lignes.pop();
  lignes.push(
    actif
      ? `${DEBUT_LIGNE_TITRE} "${nom.replace(/"/g, "'")}", written once in large elegant lettering integrated into the composition. No other text, no logo, no watermark.`
      : LIGNE_SANS_TEXTE,
  );
  return lignes.join("\n");
}

function normaliser(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Le personnage principal d'un projet, pour l'affiche : le premier personnage du brief (c'est l'ordre du brief qui dit
 * qui compte) dont on retrouve l'asset dans le registre, par son nom dans le code ou la description. Sans correspondance,
 * repli sur le premier asset personnage qui a une image : mieux vaut un visage connu qu'aucun. */
export function personnagePrincipal<A extends { code: string; description: string; aImage: boolean }>(
  personnagesBrief: { nom: string }[],
  personnagesRegistre: A[],
): { nom: string | null; asset: A } | null {
  for (const p of personnagesBrief) {
    const mots = normaliser(p.nom).split(/[^a-z0-9]+/).filter((m) => m.length >= 3);
    if (mots.length === 0) continue;
    const trouve = personnagesRegistre.find((a) => {
      const texte = normaliser(`${a.code} ${a.description}`);
      return mots.some((m) => texte.includes(m));
    });
    if (trouve) return { nom: p.nom, asset: trouve };
  }
  const repli = personnagesRegistre.find((a) => a.aImage) ?? personnagesRegistre[0];
  return repli ? { nom: null, asset: repli } : null;
}
