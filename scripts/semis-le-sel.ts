import { db } from "../db";
import { assets, briefs, episodes, jobs, planDialogues, planPromptSections, plans, projects, repliques, scenes, seasons } from "../db/schema";
import { briefVide } from "../lib/agents/brief";
import { LIGNES_LE_SEL } from "../lib/agents/revision/fixture-le-sel";

/** L'épisode « Le sel » de la maquette (lib/agents/revision/fixture-le-sel.ts), en vraie base. */
export async function semerLeSel(nom: string) {
  const [projet] = await db.insert(projects).values({ nom, type: "serie" }).returning();
  const [saison] = await db.insert(seasons).values({ projectId: projet!.id, numero: 1, titre: "Saison 1" }).returning();
  const [episode] = await db.insert(episodes).values({ seasonId: saison!.id, numero: 1, titre: "Le sel", resume: "Maya quitte le port." }).returning();
  await db.insert(briefs).values({ projectId: projet!.id, statut: "valide", source: "conversation", contenu: { ...briefVide(nom), dureeEpisodeSecondes: 120 }, statuts: {} });
  const lesScenes = await db.insert(scenes).values(LIGNES_LE_SEL.scenes.map((s, i) => ({ episodeId: episode!.id, ordre: i, titre: s.titre }))).returning();
  const sceneDe = new Map(LIGNES_LE_SEL.scenes.map((s, i) => [s.id, lesScenes[i]!.id]));
  const lesPlans = await db
    .insert(plans)
    .values(
      LIGNES_LE_SEL.plans.map((p, i) => ({
        projectId: projet!.id,
        episodeId: episode!.id,
        ordre: i,
        titre: p.titre,
        sceneId: sceneDe.get(p.sceneId!)!,
        dureeMontageSecondes: p.duree,
        dureeGenerationSecondes: p.duree,
        statut: p.statut as "brouillon" | "termine",
      })),
    )
    .returning();
  const planDe = (uuidFixture: string) => lesPlans[LIGNES_LE_SEL.plans.findIndex((p) => p.uuid === uuidFixture)]!;
  for (const [i, p] of LIGNES_LE_SEL.plans.entries()) {
    if (p.aFiche) await db.insert(planPromptSections).values({ planId: lesPlans[i]!.id, section: "summary", ordre: 1, contenu: "Fiche écrite." });
    if (p.statut === "termine") await db.insert(jobs).values({ planId: lesPlans[i]!.id, statut: "termine", workflowFichier: "e2e", cheminSortie: `plans/${lesPlans[i]!.id}/e2e.mp4`, finishedAt: new Date() });
  }
  await db.insert(assets).values([
    { projectId: projet!.id, code: "CHAR_maya", type: "personnage", description: "Maya" },
    { projectId: projet!.id, code: "CHAR_pecheur", type: "personnage", description: "Le pêcheur" },
  ]);
  const lesReps = await db
    .insert(repliques)
    .values(LIGNES_LE_SEL.repliques.map((r) => ({ projectId: projet!.id, episodeId: episode!.id, ordre: r.ordre, texte: r.texte, locuteurTexte: r.locuteur === "CHAR_maya" ? "Maya" : "Pêcheur" })))
    .returning();
  for (const [i, r] of LIGNES_LE_SEL.repliques.entries()) {
    for (const li of r.liaisons) await db.insert(planDialogues).values({ planId: planDe(li.planUuid).id, repliqueId: lesReps[i]!.id, slot: li.slot });
  }
  // Une fiche écrite cite les répliques de son plan mot pour mot (balises <d>) : c'est ce que la mise à jour du dialogue retrouve.
  for (const [i, p] of LIGNES_LE_SEL.plans.entries()) {
    if (!p.aFiche) continue;
    const dites = LIGNES_LE_SEL.repliques.filter((r) => r.liaisons.some((li) => li.planUuid === p.uuid));
    const dialogues = dites.map((r) => `<d>[Français] ${r.texte}</d>`).join(" ");
    await db.insert(planPromptSections).values({ planId: lesPlans[i]!.id, section: "detailed_description", ordre: 4, contenu: dialogues ? `${p.titre}. A character says ${dialogues} then the shot holds.` : `${p.titre}. The shot holds.` });
  }
  return { projectId: projet!.id, episodeId: episode!.id };
}
