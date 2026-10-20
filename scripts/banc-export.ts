import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, agentTraces } from "../db/schema";
import { versMessages } from "../lib/llm/executer";

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

  // Les appels terminés SANS trace (la trace n'a pas pu s'écrire) se rejouent quand même : l'entrée de l'appel est ce que le worker
  // envoie au skill (worker/agents/preparation.ts la prend telle quelle hors iteration-plan), et le résultat est gardé
  // dans la tâche. Les jetons, la durée du serveur et la taille du prompt système d'origine sont alors inconnus.
  const sansTrace = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.projectId, projet), eq(agentRuns.statut, "termine"), isNull(agentRuns.traceId), skills?.length ? inArray(agentRuns.skill, skills) : undefined))
    .orderBy(agentRuns.id);
  const depuisRuns = sansTrace
    .filter((r) => !["iteration-plan"].includes(r.skill))
    .map((r) => ({
      id: r.id, skill: r.skill, modele: "(sans trace)", projectId: r.projectId, systemeCaracteres: 0,
      messages: versMessages(r.entree as string | object), sortieJson: r.resultat, tokensEntree: 0, tokensSortie: 0,
      dureeMs: r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : 0,
      variante: ((r.options ?? {}) as { variante?: string }).variante ?? null,
    }));
  const toutes = [...lignes, ...depuisRuns];

  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(
    sortie,
    toutes
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
  for (const l of toutes) parSkill.set(l.skill, (parSkill.get(l.skill) ?? 0) + 1);
  console.log(`${lignes.length} trace(s) + ${depuisRuns.length} appel(s) sans trace du projet ${projet} → ${sortie} (${[...parSkill].map(([s, n]) => `${s} ×${n}`).join(", ")})`);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error(e);
  process.exit(1);
});
