import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Chargeur de skills d'agents (`agents/skills/<nom>/`), au format standard Agent Skills
 * (agentskills.io). Côté serveur seulement (accès disque).
 *
 * Convention d'assemblage du prompt système, déterministe :
 *   1. `SKILL.md`                   — la mission et les règles (obligatoire) ; son en-tête YAML
 *      (`name`, `description`) sert à la portabilité et n'entre PAS dans le prompt ;
 *   2. `references/guide-*.md`      — les guides, par ordre alphabétique, FILTRÉS par
 *      variante (voir plus bas) ;
 *   3. `references/exemples/*.md`   — les exemples, par ordre alphabétique ;
 *   4. les fichiers PARTAGÉS déclarés ci-dessous (hors du dossier du skill) ;
 *   5. le contrat de sortie : `assets/sortie.schema.json` (obligatoire), en JSON compact.
 * Chaque fichier est précédé d'un titre `=== <type>: <nom> ===` (en anglais, comme les
 * instructions). Le schéma est AUSSI passé au fournisseur pour contraindre la sortie, mais
 * il figure dans le prompt : une grammaire (llama.cpp) force les champs sans que le modèle
 * les voie, or leurs `description` portent des consignes. Le dossier EST la déclaration : le
 * en-tête ne pilote aucun chargement (voir docs/CONCEPTION_AGENTS.md §5).
 *
 * Variantes : un guide peut se réserver à certains cas en déclarant, sur sa PREMIÈRE
 * ligne, `<!-- variantes: image, generation -->` (la ligne est retirée du prompt).
 * Quand l'appelant fournit une `variante`, seuls sont chargés les guides SANS
 * déclaration et ceux qui la nomment ; sans `variante`, tous les guides sont chargés.
 * Cela évite d'envoyer au modèle (surtout un petit modèle local) un guide audio pour
 * écrire un prompt d'image. Exemple prompt-asset : `sfx`, `generation` (Krea 2),
 * `edition` (Qwen), `image` (les deux guides d'image : la méthode reste à recommander). */

/** Les seuls fichiers lus hors du dossier d'un skill : le lexique de corrections H3 (qui vit dans
 * `plan-h3`), partagé avec `iteration-plan` (source unique), et les guides d'image de `prompt-asset`. */
const LEXIQUE_H3 = "agents/skills/plan-h3/references/h3-lexique-corrections.md";
export const FICHIERS_PARTAGES: Record<string, string[]> = {
  "plan-h3": [LEXIQUE_H3],
  "iteration-plan": [LEXIQUE_H3],
  // L'affiche s'écrit comme un asset d'image : mêmes guides Krea 2 / Qwen, jamais recopiés.
  "prompt-affiche": ["agents/skills/prompt-asset/references/guide-krea2.md", "agents/skills/prompt-asset/references/guide-qwen-edit.md"],
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
  /** Estimation grossière (≈ 4 caractères par jeton en anglais) — pas une mesure. */
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

const ENTETE = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** En-tête YAML de `SKILL.md` (format Agent Skills) : `name` et `description`, sur une ligne chacun
 * (pas de YAML complet : le standard n'exige ici que des scalaires). `null` si le fichier n'en a pas. */
export function lireFrontmatter(contenu: string): { name: string; description: string } | null {
  const m = ENTETE.exec(contenu);
  if (!m) return null;
  const champ = (cle: string) => {
    const l = new RegExp(`^${cle}:[ \\t]*(.*)$`, "m").exec(m[1]!);
    return l ? l[1]!.trim().replace(/^(["'])(.*)\1$/, "$2") : "";
  };
  return { name: champ("name"), description: champ("description") };
}

function sansFrontmatter(contenu: string): string {
  return contenu.replace(ENTETE, "");
}

export const CARACTERES_PAR_JETON = 4;

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
  const principal = join(dossier, "SKILL.md");
  const schemaChemin = join(dossier, "assets", "sortie.schema.json");
  if (!existsSync(principal)) throw new Error(`Skill « ${nom} » : SKILL.md manquant.`);
  if (!existsSync(schemaChemin)) throw new Error(`Skill « ${nom} » : assets/sortie.schema.json manquant.`);
  const entete = lireFrontmatter(readFileSync(principal, "utf-8"));
  if (!entete || entete.name !== nom || !entete.description) {
    throw new Error(`Skill « ${nom} » : SKILL.md doit commencer par un en-tête avec name: ${nom} et description.`);
  }

  const refs = join(dossier, "references");
  const guidesIgnores: string[] = [];
  const guides = md(refs, (n) => n.startsWith("guide-")).filter((n) => {
    if (!variante) return true;
    const declarees = variantesDuGuide(readFileSync(join(refs, n), "utf-8"));
    const garde = declarees === null || declarees.includes(variante);
    if (!garde) guidesIgnores.push(`agents/skills/${nom}/references/${n}`);
    return garde;
  });

  const morceaux: { titre: string; chemin: string }[] = [
    { titre: "rules", chemin: principal },
    ...guides.map((n) => ({ titre: `guide: ${n}`, chemin: join(refs, n) })),
    ...md(join(refs, "exemples"), () => true).map((n) => ({ titre: `example: ${n}`, chemin: join(refs, "exemples", n) })),
    ...(FICHIERS_PARTAGES[nom] ?? []).map((rel) => ({ titre: `shared: ${rel.split("/").pop()}`, chemin: join(racine, rel) })),
  ];

  const parties = morceaux.map((m) => {
    if (!existsSync(m.chemin)) throw new Error(`Skill « ${nom} » : fichier manquant (${m.chemin}).`);
    return `=== ${m.titre === "rules" ? `${nom}: rules` : m.titre} ===\n\n${sansDeclaration(sansFrontmatter(readFileSync(m.chemin, "utf-8"))).trim()}`;
  });
  const schema = JSON.parse(readFileSync(schemaChemin, "utf-8")) as Record<string, unknown>;
  parties.push(
    `=== output contract: sortie.schema.json ===\n\nYour answer is ONE JSON object matching this schema (JSON Schema draft 2020-12), with no text around it:\n\n${JSON.stringify(schema)}`,
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
      `agents/skills/${nom}/assets/sortie.schema.json`,
    ],
    caracteres: systeme.length,
    jetonsEstimes: estimerJetons(systeme.length),
  };
}

export function listerSkills(racine: string = racineDepot()): string[] {
  const dossier = join(racine, "agents", "skills");
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dossier, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}
