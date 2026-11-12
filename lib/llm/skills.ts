import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Loader for agent skills (`agents/skills/<nom>/`), in the standard Agent Skills format
 * (agentskills.io). Server side only (disk access).
 *
 * Deterministic convention for assembling the system prompt:
 *   1. `SKILL.md`                   — the mission and the rules (mandatory); its YAML header
 *      (`name`, `description`) serves portability and does NOT go into the prompt;
 *   2. `references/guide-*.md`      — the guides, in alphabetical order, FILTERED by
 *      variant (see below); those that declare variants come AFTER the examples (3), so that the
 *      prompt prefix (rules, common guides, examples) stays identical from one variant to another and is
 *      reused from the server's cache;
 *   3. `references/exemples/*.md`   — the examples, in alphabetical order;
 *   4. the SHARED files declared below (outside the skill's folder);
 *   5. the output contract: `assets/sortie.schema.json` (mandatory), in compact JSON.
 * Each file is preceded by a title `=== <type>: <nom> ===` (in English, like the
 * instructions). The schema is ALSO passed to the provider to constrain the output, but
 * it appears in the prompt: a grammar (llama.cpp) forces the fields without the model
 * seeing them, yet their `description`s carry instructions. The folder IS the declaration: the
 * header drives no loading (see docs/CONCEPTION_AGENTS.md §5).
 *
 * Variants: a guide can reserve itself for certain cases by declaring, on its FIRST
 * line, `<!-- variantes: image, generation -->` (the line is removed from the prompt).
 * When the caller provides a `variante`, only the guides WITHOUT a declaration and those that name it are loaded; without a `variante`, all guides are loaded.
 * This avoids sending the model (especially a small local model) an audio guide to
 * write an image prompt. Example prompt-asset: `generation` (Krea 2),
 * `edition` (Qwen), `image` (the two image guides: the method is still to be recommended),
 * `affiche` (the presentation poster: the two image guides too). */

/** Files read outside a skill's folder. None since 2026-11-09: `iteration-plan` reads its own copy of the lexicon, oriented to diagnosis
 * (agents/skills/iteration-plan/references/guide-lexique-diagnostic.md).
 * The poster is no longer a skill: it is the `affiche` variant of `prompt-asset`, which loads its image guides through the `variantes` declaration. */
const FICHIERS_PARTAGES: Record<string, string[]> = {};

export type OptionsChargement = {
  /** Use case that restricts the guides loaded (see above). */
  variante?: string;
};

export type SkillCharge = {
  nom: string;
  variante: string | null;
  /** Guides set aside for not matching the variant (relative paths). */
  guidesIgnores: string[];
  /** Assembled system prompt. */
  systeme: string;
  schema: Record<string, unknown>;
  /** Files read, in assembly order (paths relative to the repository root). */
  fichiers: string[];
  caracteres: number;
  /** Rough estimate (≈ 4 characters per token in English) — not a measurement. */
  jetonsEstimes: number;
};

/** Variants declared by a guide: `<!-- variantes: a, b -->` on the first
 * line. `null` = guide without declaration, always loaded. */
export function variantesDuGuide(contenu: string): string[] | null {
  const m = /^\s*<!--\s*variantes\s*:\s*([^>]*?)\s*-->/i.exec(contenu);
  if (!m) return null;
  return m[1]!.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function sansDeclaration(contenu: string): string {
  return contenu.replace(/^\s*<!--\s*variantes\s*:[^>]*-->\s*\n?/i, "");
}

const ENTETE = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** YAML header of `SKILL.md` (Agent Skills format): `name` and `description`, one line each
 * (not full YAML: the standard only requires scalars here). `null` if the file has none. */
function lireFrontmatter(contenu: string): { name: string; description: string } | null {
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

const CARACTERES_PAR_JETON = 4;

function estimerJetons(caracteres: number): number {
  return Math.ceil(caracteres / CARACTERES_PAR_JETON);
}

function md(dossier: string, filtre: (nom: string) => boolean): string[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((n) => n.endsWith(".md") && filtre(n))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

function racineDepot(): string {
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
  const communs: string[] = [];
  const parVariante: string[] = [];
  for (const n of md(refs, (n) => n.startsWith("guide-"))) {
    const declarees = variantesDuGuide(readFileSync(join(refs, n), "utf-8"));
    if (declarees === null) communs.push(n);
    else if (!variante || declarees.includes(variante)) parVariante.push(n);
    else guidesIgnores.push(`agents/skills/${nom}/references/${n}`);
  }
  const guide = (n: string) => ({ titre: `guide: ${n}`, chemin: join(refs, n) });

  const morceaux: { titre: string; chemin: string }[] = [
    { titre: "rules", chemin: principal },
    ...communs.map(guide),
    ...md(join(refs, "exemples"), () => true).map((n) => ({ titre: `example: ${n}`, chemin: join(refs, "exemples", n) })),
    ...parVariante.map(guide),
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
