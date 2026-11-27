/** The ONLY file of the lab that reads the database, in a read-only transaction: it freezes the scene-writing calls of some projects into a
 * dataset file. Run once per dataset; an existing dataset is never overwritten (the database moves on, the dataset must not). */

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { agentTraces, episodes, jobs, plans, scenes } from "../../db/schema";
import { MEDIA_ROOT } from "../../lib/media";
import { gitState, datasetPath } from "./files";
import type { Case, Dataset, ReviewCorrection, SceneInput, SceneOutput, StoredScene } from "./types";

/** Scenes added by earlier benches inside the real projects: not part of the film. */
const BENCH_SCENE = /^banc\b/i;

function measuredSeconds(path: string | null): number | null {
  if (!path) return null;
  const file = resolve(MEDIA_ROOT, path);
  if (!existsSync(file)) return null;
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
    const seconds = Number(out.trim());
    return Number.isFinite(seconds) ? Math.round(seconds * 100) / 100 : null;
  } catch {
    return null;
  }
}

const firstJson = (messages: unknown): unknown => {
  const content = (messages as { content?: unknown }[])[0]?.content;
  return typeof content === "string" ? JSON.parse(content) : null;
};

export async function exportDataset(name: string, projects: number[]): Promise<string> {
  const target = datasetPath(name);
  if (existsSync(target)) throw new Error(`Le jeu « ${name} » existe déjà (${target}) : un jeu figé ne s'écrase pas. Choisis un autre nom.`);

  const cases = await db.transaction(
    async (tx) => {
      const traces = await tx
        .select()
        .from(agentTraces)
        .where(and(inArray(agentTraces.projectId, projects), eq(agentTraces.statut, "ok"), inArray(agentTraces.skill, ["scenario-scene", "relecture-scenario"])))
        .orderBy(asc(agentTraces.id));
      const result: Case[] = [];
      for (const trace of traces.filter((t) => t.skill === "scenario-scene")) {
        const project = trace.projectId!;
        const input = firstJson(trace.messages) as SceneInput | null;
        if (!input?.scene) continue;
        const rank = Number.parseInt(input.scene.position, 10);

        const rows = await tx
          .select({ id: scenes.id, title: scenes.titre, treatment: scenes.traitement })
          .from(scenes)
          .innerJoin(episodes, eq(episodes.id, scenes.episodeId))
          .where(eq(episodes.projectId, project))
          .orderBy(asc(episodes.numero), asc(scenes.ordre), asc(scenes.id));
        // Matched by rank, not by title: a scene may have been renamed since.
        const row = rows.filter((r) => !BENCH_SCENE.test(r.title))[rank - 1];

        let stored: StoredScene | null = null;
        if (row) {
          const list = await tx.select().from(plans).where(eq(plans.sceneId, row.id)).orderBy(asc(plans.ordre), asc(plans.id));
          const storedPlans: StoredScene["plans"] = [];
          for (const p of list) {
            const renders = await tx.select().from(jobs).where(and(eq(jobs.planId, p.id), eq(jobs.statut, "termine"))).orderBy(desc(jobs.id));
            storedPlans.push({
              title: p.titre,
              description: p.description ?? "",
              link: p.liaison,
              storedSeconds: p.dureeGenerationSecondes,
              askedSeconds: renders[0]?.dureeUtilisee ?? null,
              measuredSeconds: measuredSeconds(renders[0]?.cheminSortie ?? null),
              successfulRenders: renders.length,
            });
          }
          const treatment = row.treatment as { dureeCibleSecondes?: number } | null;
          stored = { sceneId: row.id, title: row.title, targetSeconds: treatment?.dureeCibleSecondes ?? null, plans: storedPlans };
        }

        // The first review after this call, in the same project: it cites plans by handle, each attached to a scene title.
        const reviewTrace = traces.find((t) => t.skill === "relecture-scenario" && t.projectId === project && t.id > trace.id);
        let review: ReviewCorrection[] | null = null;
        if (reviewTrace) {
          const seen = firstJson(reviewTrace.messages) as { scenes?: { titre: string }[]; plans?: { plan: string; scene: string }[] } | null;
          const title = seen?.scenes?.[rank - 1]?.titre;
          const handles = new Set((seen?.plans ?? []).filter((p) => p.scene === title).map((p) => p.plan));
          const answer = reviewTrace.json as { corrections?: { plan?: string; type: string; critere: string; motif: string }[] } | null;
          review = (answer?.corrections ?? [])
            .filter((c) => c.plan && handles.has(c.plan))
            .map((c) => ({ handle: c.plan!, type: c.type, criterion: c.critere, reason: c.motif }));
        }

        result.push({
          id: `${project}-s${rank}-t${trace.id}`,
          project,
          sceneRank: rank,
          sceneTitle: input.scene.titre,
          input,
          historical: {
            traceId: trace.id,
            createdAt: trace.createdAt.toISOString(),
            model: trace.modele,
            systemHash: trace.systemeEmpreinte,
            reasoningChars: trace.reflexion?.length ?? 0,
            resends: trace.renvois,
            validationErrors: (trace.erreursValidation as string[] | null) ?? null,
            tokensIn: trace.tokensEntree,
            tokensOut: trace.tokensSortie,
            durationMs: trace.dureeMs,
            rawOutput: trace.sortieBrute,
            output: trace.json as SceneOutput,
          },
          stored,
          review,
        });
      }
      return result;
    },
    { accessMode: "read only" },
  );

  if (cases.length === 0) throw new Error(`Aucun appel scenario-scene réussi pour les projets ${projects.join(", ")}.`);
  const dataset: Dataset = { name, skill: "scenario-scene", exportedAt: new Date().toISOString(), commit: gitState().commit, cases };
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(dataset, null, 2)}\n`, { flag: "wx" });
  return `${cases.length} cas exportés dans ${target}`;
}
