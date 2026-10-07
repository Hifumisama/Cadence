import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Les textes des exemples du skill `plan-h3` (brouillons JSON de agents/skills/plan-h3/references/exemples/*.md), pour que
 * les contrôles repèrent une phrase recopiée d'un exemple. Vide si le dossier est absent. Côté serveur. */
export function corpusExemplesPlanH3(racine = process.cwd()): string[] {
  const dossier = join(racine, "agents", "skills", "plan-h3", "references", "exemples");
  if (!existsSync(dossier)) return [];
  const textes: string[] = [];
  for (const nom of readdirSync(dossier).filter((n) => n.endsWith(".md"))) {
    const m = /```json\r?\n([\s\S]*?)\r?\n```/.exec(readFileSync(join(dossier, nom), "utf-8"));
    if (!m) continue;
    try {
      const j = JSON.parse(m[1]!) as Record<string, unknown>;
      const chaines = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(chaines) : v && typeof v === "object" ? Object.values(v).flatMap(chaines) : []);
      textes.push(...chaines({ ...j, titre: undefined, notes: undefined }));
    } catch {
      /* exemple illisible : ignoré, le test des exemples le signale */
    }
  }
  return textes;
}
