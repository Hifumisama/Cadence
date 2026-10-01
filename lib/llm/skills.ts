import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Chargeur de skills d'agents (`agents/skills/<nom>/`). Côté serveur seulement
 * (accès disque).
 *
 * Convention d'assemblage du prompt système, déterministe :
 *   1. `regles.md`                  — la mission et les règles (obligatoire) ;
 *   2. `guide-*.md`                 — les guides, par ordre alphabétique ;
 *   3. `exemples/*.md`              — les exemples, par ordre alphabétique ;
 *   4. les fichiers PARTAGÉS déclarés ci-dessous (hors du dossier du skill) ;
 *   5. le contrat de sortie : `sortie.schema.json` (obligatoire), en JSON compact.
 * Chaque fichier est précédé d'un titre `=== <type> : <nom> ===`. Le schéma est
 * AUSSI passé au fournisseur pour contraindre la sortie, mais il figure dans le
 * prompt : une grammaire (llama.cpp) force les champs sans que le modèle les voie,
 * or leurs `description` portent des consignes. Pas de manifeste : le dossier EST
 * la déclaration (voir docs/CONCEPTION_AGENTS.md §5). */

/** Les seuls fichiers lus hors du dossier d'un skill : le lexique de corrections H3,
 * partagé par `plan-h3` et `iteration-plan` (source unique, voir CLAUDE.md). */
const LEXIQUE_H3 = ".claude/skills/fiche-de-plan/references/h3-lexique-corrections.md";
export const FICHIERS_PARTAGES: Record<string, string[]> = {
  "plan-h3": [LEXIQUE_H3],
  "iteration-plan": [LEXIQUE_H3],
};

export type SkillCharge = {
  nom: string;
  /** Prompt système assemblé. */
  systeme: string;
  schema: Record<string, unknown>;
  /** Fichiers lus, dans l'ordre d'assemblage (chemins relatifs à la racine du dépôt). */
  fichiers: string[];
  caracteres: number;
  /** Estimation grossière (≈ 3,5 caractères par jeton en français) — pas une mesure. */
  jetonsEstimes: number;
};

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

export function chargerSkill(nom: string, racine: string = racineDepot()): SkillCharge {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(nom)) throw new Error(`Nom de skill invalide : « ${nom} ».`);
  const dossier = join(racine, "agents", "skills", nom);
  if (!existsSync(dossier)) throw new Error(`Skill introuvable : agents/skills/${nom}/.`);
  const regles = join(dossier, "regles.md");
  const schemaChemin = join(dossier, "sortie.schema.json");
  if (!existsSync(regles)) throw new Error(`Skill « ${nom} » : regles.md manquant.`);
  if (!existsSync(schemaChemin)) throw new Error(`Skill « ${nom} » : sortie.schema.json manquant.`);

  const morceaux: { titre: string; chemin: string }[] = [
    { titre: "règles", chemin: regles },
    ...md(dossier, (n) => n.startsWith("guide-")).map((n) => ({ titre: `guide : ${n}`, chemin: join(dossier, n) })),
    ...md(join(dossier, "exemples"), () => true).map((n) => ({ titre: `exemple : ${n}`, chemin: join(dossier, "exemples", n) })),
    ...(FICHIERS_PARTAGES[nom] ?? []).map((rel) => ({ titre: `partagé : ${rel.split("/").pop()}`, chemin: join(racine, rel) })),
  ];

  const parties = morceaux.map((m) => {
    if (!existsSync(m.chemin)) throw new Error(`Skill « ${nom} » : fichier manquant (${m.chemin}).`);
    return `=== ${m.titre === "règles" ? `${nom} : règles` : m.titre} ===\n\n${readFileSync(m.chemin, "utf-8").trim()}`;
  });
  const schema = JSON.parse(readFileSync(schemaChemin, "utf-8")) as Record<string, unknown>;
  parties.push(
    `=== contrat de sortie : sortie.schema.json ===\n\nTa réponse est UN SEUL objet JSON conforme à ce schéma (JSON Schema draft 2020-12), sans texte autour :\n\n${JSON.stringify(schema)}`,
  );
  const systeme = parties.join("\n\n");

  return {
    nom,
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
