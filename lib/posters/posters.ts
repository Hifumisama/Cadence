/** Presentation posters (image of a project or an episode) — pure rules, no database or disk.
 *
 * A poster is generated with the SAME mechanism as an asset image (ComfyUI queue, candidates, « Utiliser » (use)), so it
 * relies on an asset of its own type, `affiche`. This asset is an implementation detail: it never appears in
 * the registry, does not count in the totals and is never shown to the agent (see `horsAffiches`, lib/assets/assets-visible.ts).
 * When a candidate is adopted, its image becomes the poster of the project or episode (`posterFichier`). By default the title
 * is not in the image: it is overlaid on display (components/ui/Poster.tsx); it can also be written by the model
 * (`Title lettering:` line of the prompt) and the poster file then carries the suffix `-titre` (lib/posters/poster.ts). */

export const TYPE_AFFICHE = "affiche";

/** What a poster dresses: the project (the film) or its episode. */
export type CibleAffiche = "projects" | "episodes";

const LETTRE: Record<CibleAffiche, string> = { projects: "P", episodes: "E" };

/** Code of the poster asset: one per project, per episode. */
export function codeAffiche(cible: CibleAffiche, id: number): string {
  return `AFFICHE_${LETTRE[cible]}${id}`;
}

/** Finds what a poster code designates, or null if it is not one. */
export function cibleDeCodeAffiche(code: string): { cible: CibleAffiche; id: number } | null {
  const m = /^AFFICHE_([PE])(\d+)$/.exec(code);
  if (!m) return null;
  return { cible: m[1] === "P" ? "projects" : "episodes", id: Number(m[2]) };
}

/** Format and resolution proposed by default: all posters (project, episode) are 2:3, like the cards.
 * Editable in the generation window. */
export function formatAfficheParDefaut(): { aspect: "2:3"; megapixels: number } {
  return { aspect: "2:3", megapixels: 1.3 };
}

const LIGNE_SANS_TEXTE = "No text, no lettering, no logo, no watermark.";
const DEBUT_LIGNE_TITRE = "Title lettering:";

/** The proposed prompt: a template filled with what the project knows about itself. The style clause is not included (the
 * workflow adds it separately). No label (« Story: ») nor quoted title outside the « title in the image » case:
 * the model would draw the words it is given. The summary is in French, so only the agent (skill `prompt-asset`, `affiche` variant)
 * writes a real prompt; this template is only the starting point. */
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

/** Is the title requested in the image? True when the prompt carries the `Title lettering: …` line. The prompt is the
 * authority (that of the candidate being adopted): no setting to store separately. */
export function titreDansPrompt(prompt: string): boolean {
  return prompt.includes(DEBUT_LIGNE_TITRE);
}

/** Adds or removes the title line of a prompt (edited by hand or written by the agent, included): active → the « sans
 * texte » (no text) line is replaced by the title line; inactive → the reverse. The rest of the prompt is not touched. */
export function avecTitreDansImage(prompt: string, titre: string, actif: boolean): string {
  const nom = titre.trim() || "Untitled";
  // The title sentence is removed wherever it is: alone on its line, or attached to the end of a paragraph (the model sometimes writes it without a line break; the old
  // version then left it in place before adding its own, and the title was requested twice: AF-03).
  const lignes = prompt
    .split("\n")
    .map((l) => {
      const i = l.indexOf(DEBUT_LIGNE_TITRE);
      return { texte: i >= 0 ? l.slice(0, i) : l, coupee: i >= 0 };
    })
    .filter((l) => !(l.coupee && l.texte.trim() === "") && !/^\s*No text/i.test(l.texte))
    .map((l) => l.texte.trimEnd());
  while (lignes.length > 0 && lignes[lignes.length - 1] === "") lignes.pop();
  lignes.push(
    actif
      ? `${DEBUT_LIGNE_TITRE} "${nom.replace(/"/g, "'")}", written once in large elegant lettering integrated into the composition. No logo, no watermark.`
      : LIGNE_SANS_TEXTE,
  );
  return lignes.join("\n");
}

function normaliser(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** The main character of a project, for the poster: the first character in the brief (the brief's order says
 * which one counts) whose asset is found in the registry, by its name in the code or the description. Without a match,
 * falls back to the first character asset that has an image: better a known face than none. */
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
