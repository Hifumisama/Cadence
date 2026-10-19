import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { agentTraces } from "../db/schema";

/** Exporte des traces d'agents (agent_traces) au format du banc de rejeu (`npm run llm:banc`).
 *
 *   npm run llm:banc:export -- --projet 220 [--skills scenario-episode,plan-h3] [--sortie essais/banc/p220.jsonl]
 *
 * Une ligne JSON par trace : messages d'origine, sortie validée, durées, et la VARIANTE du skill relue dans l'appel
 * (agent_runs.options), sans quoi le banc chargerait tous les guides de genre. Seules les traces réussies sont gardées. */

const arg = (nom: string) => {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<number> {
  const projet = Number(arg("--projet"));
  if (!Number.isInteger(projet) || projet <= 0) {
    console.error("Usage : npm run llm:banc:export -- --projet <id> [--skills a,b] [--sortie fichier.jsonl]");
    return 2;
  }
  const skills = arg("--skills")?.split(",").map((s) => s.trim()).filter(Boolean);
  const sortie = arg("--sortie") ?? `essais/banc/p${projet}.jsonl`;

  const lignes = await db
    .select({
      id: agentTraces.id,
      skill: agentTraces.skill,
      modele: agentTraces.modele,
      projectId: agentTraces.projectId,
      messages: agentTraces.messages,
      sortieJson: agentTraces.json,
      tokensEntree: agentTraces.tokensEntree,
      tokensSortie: agentTraces.tokensSortie,
      dureeMs: agentTraces.dureeMs,
      systemeCaracteres: agentTraces.systemeCaracteres,
      variante: sql<string | null>`(select r.options->>'variante' from agent_runs r where r.trace_id = agent_traces.id limit 1)`,
    })
    .from(agentTraces)
    .where(and(eq(agentTraces.projectId, projet), eq(agentTraces.statut, "ok"), skills?.length ? inArray(agentTraces.skill, skills) : undefined))
    .orderBy(agentTraces.createdAt, agentTraces.id);

  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(
    sortie,
    lignes
      .map((l) =>
        JSON.stringify({
          id: l.id, skill: l.skill, modele: l.modele, project_id: l.projectId, systeme_caracteres: l.systemeCaracteres,
          messages: l.messages, sortie_json: l.sortieJson, tokens_entree: l.tokensEntree, tokens_sortie: l.tokensSortie,
          duree_ms: l.dureeMs, variante: l.variante,
        }),
      )
      .join("\n") + "\n",
  );
  const parSkill = new Map<string, number>();
  for (const l of lignes) parSkill.set(l.skill, (parSkill.get(l.skill) ?? 0) + 1);
  console.log(`${lignes.length} trace(s) du projet ${projet} → ${sortie} (${[...parSkill].map(([s, n]) => `${s} ×${n}`).join(", ")})`);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error(e);
  process.exit(1);
});
