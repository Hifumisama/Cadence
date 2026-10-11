// Pose le prompt produit par l'agent plan-h3 (rapport d'essai) comme plan « F » du banc A/B, pour le rendre et le comparer.
//   npx tsx --env-file=.env scripts/ab-agent-plan.mts <rapport.md> "<titre>" <ordre> "<notes>"
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assets, planPromptSections, planRefs, plans, projects } from "../db/schema";
import { decouperSections, ORDRE_SECTIONS } from "../lib/prompt";

const [rapport, titre, ordre, notes] = process.argv.slice(2);
const md = readFileSync(rapport!, "utf8");
const bloc = md.match(/\*\*Prompt assemblé\*\*\s+```text\n([\s\S]*?)\n```/)?.[1];
if (!bloc) throw new Error("Prompt assemblé introuvable dans le rapport");
const sections = decouperSections(bloc);
// Ordre des images dans le prompt de l'agent : <Picture N> = N-ième référence de sa liste.
const ordreAgent = (process.argv[6] ?? "CHAR_maya_sheet,CHAR_tenanciere,PROP_dague_maya,VFX_flammes,DEC_couloir_auberge,DEC_toits_auberge").split(",");
const [projet] = await db.select().from(projects).where(eq(projects.nom, "Banc A/B — H3 et Singularity"));
const [modele] = await db.select().from(plans).where(and(eq(plans.projectId, projet!.id), eq(plans.titre, "E — Combat total (15 s)")));
const tous = await db.select().from(assets).where(eq(assets.projectId, projet!.id));
const idDe = (c: string) => tous.find((a) => a.code === c)!.id;
const r = await db.transaction(async (tx) => {
  const [p] = await tx.insert(plans).values({
    projectId: projet!.id, episodeId: modele!.episodeId, sceneId: modele!.sceneId, ordre: Number(ordre), titre: titre!,
    description: modele!.description, dureeMontageSecondes: 15, dureeGenerationSecondes: 15, fps: 24, seed: modele!.seed, statut: "en_attente", notes: notes!,
  }).returning();
  await tx.insert(planRefs).values(ordreAgent.map((c, i) => ({ planId: p!.id, type: "picture" as const, slot: i + 1, assetId: idDe(c), role: c })));
  await tx.insert(planPromptSections).values(ORDRE_SECTIONS.map((s, i) => ({ planId: p!.id, section: s, ordre: i + 1, contenu: sections[s] })));
  return { planId: p!.id, uuid: p!.uuid };
});
console.log(JSON.stringify(r));
process.exit(0);
