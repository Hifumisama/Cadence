/** Affiches de présentation (image d'un projet ou d'un épisode) — règles pures, sans base ni disque.
 *
 * Une affiche se génère avec la MÊME mécanique qu'une image d'asset (file ComfyUI, candidats, « Utiliser »), donc elle
 * s'appuie sur un asset d'un type à part, `affiche`. Cet asset est un détail d'implémentation : il n'apparaît jamais dans
 * le registre, ne compte pas dans les totaux et n'est jamais montré à l'agent (voir `horsAffiches`, lib/assets-visibles.ts).
 * Quand un candidat est adopté, son image devient l'affiche du projet ou de l'épisode (`posterFichier`). Le titre n'est
 * jamais dans l'image : il se superpose à l'affichage (components/ui/Poster.tsx). */

export const TYPE_AFFICHE = "affiche";

/** Ce qu'une affiche habille : le projet ou un épisode (les saisons gardent leur import manuel). */
export type CibleAffiche = "projects" | "episodes";

/** Code de l'asset d'affiche : un par projet, un par épisode. */
export function codeAffiche(cible: CibleAffiche, id: number): string {
  return cible === "projects" ? `AFFICHE_P${id}` : `AFFICHE_E${id}`;
}

/** Retrouve ce que désigne un code d'affiche, ou null si ce n'en est pas un. */
export function cibleDeCodeAffiche(code: string): { cible: CibleAffiche; id: number } | null {
  const m = /^AFFICHE_([PE])(\d+)$/.exec(code);
  if (!m) return null;
  return { cible: m[1] === "P" ? "projects" : "episodes", id: Number(m[2]) };
}

/** Format et définition proposés d'entrée : l'affiche d'un projet vit surtout sur les cartes (2:3), celle d'un épisode dans
 * son en-tête (16:9). Modifiables dans la fenêtre de génération. */
export function formatAfficheParDefaut(cible: CibleAffiche): { aspect: "2:3" | "16:9"; megapixels: number } {
  return cible === "projects" ? { aspect: "2:3", megapixels: 1.3 } : { aspect: "16:9", megapixels: 1.3 };
}

/** Le prompt proposé : un gabarit rempli avec ce que le projet sait de lui-même. La clause de style n'y figure pas (le
 * workflow l'ajoute à part). Le titre y est cité pour donner le sujet, mais on demande explicitement AUCUN texte : les
 * modèles d'images déforment les lettres, et le titre est superposé à l'affichage. */
export function promptAffiche(entree: { cible: CibleAffiche; titre: string; resume?: string | null; genreTon?: string | null }): string {
  const titre = entree.titre.trim();
  const resume = (entree.resume ?? "").trim();
  const ton = (entree.genreTon ?? "").trim();
  const forme = entree.cible === "projects" ? "Vertical poster composition" : "Wide cinematic composition";
  const lignes = [
    `Cinematic key art for "${titre || "an untitled story"}".`,
    ...(ton ? [`Mood: ${ton}.`] : []),
    ...(resume ? [`Story: ${resume}`] : []),
    `${forme}, one strong focal subject, atmospheric lighting, clear space left for a title.`,
    "No text, no lettering, no logo, no watermark.",
  ];
  return lignes.join("\n");
}
