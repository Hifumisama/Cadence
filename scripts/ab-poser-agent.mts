// Pose le prompt produit par l'agent plan-h3 (rapport d'essai) comme plan d'un projet de banc, pour le rendre et le comparer.
//   npx tsx --env-file=.env scripts/ab-poser-agent.mts <rapport.md> "<nom du projet>" "<titre>" "<notes>" [codes d'asset dans l'ordre des <Picture N>]
// L'ordre par défaut est celui du banc de gestes : feu, terre, décor neutre.
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assets, planPromptSections, planRefs, plans, projects } from "../db/schema";
import { decouperSections, ORDRE_SECTIONS } from "../lib/prompt";

const [rapport, nomProjet, titre, notes, ordreAssets] = process.argv.slice(2);
if (!rapport || !nomProjet || !titre) throw new Error('Usage : <rapport.md> "<projet>" "<titre>" "<notes>" [codes]');
const bloc = readFileSync(rapport, "utf8").match(/\*\*Prompt assemblé\*\*\s+```text\n([\s\S]*?)\n```/)?.[1];
if (!bloc) throw new Error("Prompt assemblé introuvable dans le rapport");
const sections = decouperSections(bloc);
const codes = (ordreAssets ?? "CHAR_maitre_du_feu,CHAR_maitre_de_la_terre,DEC_decor_neutre").split(",");
const [projet] = await db.select().from(projects).where(eq(projects.nom, nomProjet));
if (!projet) throw new Error(`Projet introuvable : ${nomProjet}`);
const lignes = await db.select().from(assets).where(eq(assets.projectId, projet.id));
const idDe = (c: string) => { const a = lignes.find((x) => x.code === c); if (!a) throw new Error(`Asset introuvable : ${c}`); return a.id; };
const existants = await db.select().from(plans).where(eq(plans.projectId, projet.id));
if (existants.some((p) => p.titre === titre)) throw new Error("Ce plan existe déjà — rien n'a été écrit.");
const modele = existants.find((p) => p.titre.startsWith("AG ")) ?? existants[0]!;
const r = await db.transaction(async (tx) => {
  const [p] = await tx.insert(plans).values({
    projectId: projet.id, episodeId: modele.episodeId, sceneId: modele.sceneId, ordre: Math.max(...existants.map((x) => x.ordre)) + 1, titre,
    description: modele.description, dureeMontageSecondes: modele.dureeGenerationSecondes, dureeGenerationSecondes: modele.dureeGenerationSecondes, fps: 24, seed: modele.seed, statut: "en_attente", notes: notes ?? "",
  }).returning();
  await tx.insert(planRefs).values(codes.map((c, i) => ({ planId: p!.id, type: "picture" as const, slot: i + 1, assetId: idDe(c) })));
  await tx.insert(planPromptSections).values(ORDRE_SECTIONS.map((s, i) => ({ planId: p!.id, section: s, ordre: i + 1, contenu: sections[s] })));
  return { uuid: p!.uuid, caracteres: Object.values(sections).join("").length };
});
console.log(JSON.stringify(r));
process.exit(0);
