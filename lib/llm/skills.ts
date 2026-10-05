import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Chargeur de skills d'agents (`agents/skills/<nom>/`). Côté serveur seulement
 * (accès disque).
 *
 * Convention d'assemblage du prompt système, déterministe :
 *   1. `regles.md`                  — la mission et les règles (obligatoire) ;
 *   2. `guide-*.md`                 — les guides, par ordre alphabétique, FILTRÉS par
 *      variante (voir plus bas) ;
 *   3. `exemples/*.md`              — les exemples, par ordre alphabétique ;
 *   4. les fichiers PARTAGÉS déclarés ci-dessous (hors du dossier du skill) ;
 *   5. le contrat de sortie : `sortie.schema.json` (obligatoire), en JSON compact.
 * Chaque fichier est précédé d'un titre `=== <type> : <nom> ===`. Le schéma est
 * AUSSI passé au fournisseur pour contraindre la sortie, mais il figure dans le
 * prompt : une grammaire (llama.cpp) force les champs sans que le modèle les voie,
 * or leurs `description` portent des consignes. Pas de manifeste : le dossier EST
 * la déclaration (voir docs/CONCEPTION_AGENTS.md §5).
 *
 * Variantes : un guide peut se réserver à certains cas en déclarant, sur sa PREMIÈRE
 * ligne, `<!-- variantes: image, generation -->` (la ligne est retirée du prompt).
 * Quand l'appelant fournit une `variante`, seuls sont chargés les guides SANS
 * déclaration et ceux qui la nomment ; sans `variante`, tous les guides sont chargés.
 * Cela évite d'envoyer au modèle (surtout un petit modèle local) un guide audio pour
 * écrire un prompt d'image. Exemple prompt-asset : `sfx`, `generation` (Krea 2),
 * `edition` (Qwen), `image` (les deux guides d'image : la méthode reste à recommander). */

/** Les seuls fichiers lus hors du dossier d'un skill : le lexique de corrections H3,
 * partagé par `plan-h3` et `iteration-plan` (source unique, voir CLAUDE.md), et les guides d'image de `prompt-asset`. */
const LEXIQUE_H3 = ".claude/skills/fiche-de-plan/references/h3-lexique-corrections.md";
export const FICHIERS_PARTAGES: Record<string, string[]> = {
  "plan-h3": [LEXIQUE_H3],
  "iteration-plan": [LEXIQUE_H3],
  // L'affiche s'écrit comme un asset d'image : mêmes guides Krea 2 / Qwen, jamais recopiés.
  "prompt-affiche": ["agents/skills/prompt-asset/guide-krea2.md", "agents/skills/prompt-asset/guide-qwen-edit.md"],
};

export type OptionsChargement = {
  /** Cas d'usage qui restreint les guides chargés (voir plus haut). */
  variante?: string;
};

export type SkillCharge = {
  nom: string;
  variante: string | null;
  /** Guides écartés faute de correspondre à la variante (chemins relatifs). */
  guidesIgnores: string[];
  /** Prompt système assemblé. */
  systeme: string;
  schema: Record<string, unknown>;
  /** Fichiers lus, dans l'ordre d'assemblage (chemins relatifs à la racine du dépôt). */
  fichiers: string[];
  caracteres: number;
  /** Estimation grossière (≈ 3,5 caractères par jeton en français) — pas une mesure. */
  jetonsEstimes: number;
};

/** Variantes déclarées par un guide : `<!-- variantes: a, b -->` sur la première
 * ligne. `null` = guide sans déclaration, toujours chargé. */
export function variantesDuGuide(contenu: string): string[] | null {
  const m = /^\s*<!--\s*variantes\s*:\s*([^>]*?)\s*-->/i.exec(contenu);
  if (!m) return null;
  return m[1]!.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function sansDeclaration(contenu: string): string {
  return contenu.replace(/^\s*<!--\s*variantes\s*:[^>]*-->\s*\n?/i, "");
}

export const CARACTERES_PAR_JETON = 3.5;

export function estimerJetons(caracteres: number): number {
  return Math.ceil(caracteres / CARACTERES_PAR_JETON);
}

function md(dossier: string, filtre: (nom: string) => boolean): string[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((n) => n.endsWith(".md") && filtre(n))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

export function racineDepot(): string {
  return resolve(process.cwd());
}

export function chargerSkill(nom: string, racine: string = racineDepot(), options: OptionsChargement = {}): SkillCharge {
  const variante = options.variante?.trim().toLowerCase() || null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nom)) throw new Error(`Nom de skill invalide : « ${nom} ».`);
  const dossier = join(racine, "agents", "skills", nom);
  if (!existsSync(dossier)) throw new Error(`Skill introuvable : agents/skills/${nom}/.`);
  const regles = join(dossier, "regles.md");
  const schemaChemin = join(dossier, "sortie.schema.json");
  if (!existsSync(regles)) throw new Error(`Skill « ${nom} » : regles.md manquant.`);
  if (!existsSync(schemaChemin)) throw new Error(`Skill « ${nom} » : sortie.schema.json manquant.`);

  const guidesIgnores: string[] = [];
  const guides = md(dossier, (n) => n.startsWith("guide-")).filter((n) => {
    if (!variante) return true;
    const declarees = variantesDuGuide(readFileSync(join(dossier, n), "utf-8"));
    const garde = declarees === null || declarees.includes(variante);
    if (!garde) guidesIgnores.push(`agents/skills/${nom}/${n}`);
    return garde;
  });

  const morceaux: { titre: string; chemin: string }[] = [
    { titre: "règles", chemin: regles },
    ...guides.map((n) => ({ titre: `guide : ${n}`, chemin: join(dossier, n) })),
    ...md(join(dossier, "exemples"), () => true).map((n) => ({ titre: `exemple : ${n}`, chemin: join(dossier, "exemples", n) })),
    ...(FICHIERS_PARTAGES[nom] ?? []).map((rel) => ({ titre: `partagé : ${rel.split("/").pop()}`, chemin: join(racine, rel) })),
  ];

  const parties = morceaux.map((m) => {
    if (!existsSync(m.chemin)) throw new Error(`Skill « ${nom} » : fichier manquant (${m.chemin}).`);
    return `=== ${m.titre === "règles" ? `${nom} : règles` : m.titre} ===\n\n${sansDeclaration(readFileSync(m.chemin, "utf-8")).trim()}`;
  });
  const schema = JSON.parse(readFileSync(schemaChemin, "utf-8")) as Record<string, unknown>;
  parties.push(
    `=== contrat de sortie : sortie.schema.json ===\n\nTa réponse est UN SEUL objet JSON conforme à ce schéma (JSON Schema draft 2020-12), sans texte autour :\n\n${JSON.stringify(schema)}`,
  );
  const systeme = parties.join("\n\n");

  return {
    nom,
    variante,
    guidesIgnores,
    systeme,
    schema,
    fichiers: [
      ...morceaux.map((m) => m.chemin.slice(racine.length + 1).replace(/\\/g, "/")),
      `agents/skills/${nom}/sortie.schema.json`,
    ],
    caracteres: systeme.length,
    jetonsEstimes: estimerJetons(systeme.length),
  };
}

export function listerSkills(racine: string = racineDepot()): string[] {
  const dossier = join(racine, "agents", "skills");
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dossier, e.name, "regles.md")))
    .map((e) => e.name)
    .sort();
}
