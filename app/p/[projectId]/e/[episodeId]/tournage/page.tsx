import { getEpisode, getEtatPlans, getProject, getScenarioData } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/clips/queries-clip-sheet";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { demandes, plans } from "@/db/schema";
import { demosMiseEnScene } from "@/lib/media";
import { VueScenario } from "@/components/screenplay/ScreenplayView";
import { srcRendu } from "@/components/clip/Thumbnail";
import { intentionsPerimees } from "@/lib/clips/stale-intention";
import { ajoutsEnCours } from "@/lib/clips/additions-in-progress";
import type { PlanVue, SceneVue } from "@/lib/clips/screenplay-view";

export const dynamic = "force-dynamic";

/** The shoot: the work strip (scenes, clips as thumbnails, sheet and render states, additions and moves). It was the « Scénario » page before
 * that one became the text to read (`../scenario`, 2026-11-10). */
export default async function TournagePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; episodeId: string }>;
  searchParams: Promise<{ scene?: string }>;
}) {
  const { projectId, episodeId } = await params;
  const { scene } = await searchParams;
  const pid = Number(projectId);
  const eid = Number(episodeId);
  const base = `/p/${pid}/e/${eid}`;

  const [projet, episode, { scenes, sansScene }, pellicule, etat, intentions, { ajout, ajoutScene }, fichesEnCours] = await Promise.all([
    getProject(pid),
    getEpisode(eid),
    getScenarioData(eid),
    getPelliculePlans(eid),
    getEtatPlans(eid),
    // Clips whose text has changed since their sheet or their last render (« texte modifié » marker).
    intentionsPerimees(eid),
    // A clip or scene being written (« Ajouter un plan », « Nouvelle scène »): the page keeps its place for it, as a ghost card.
    ajoutsEnCours(eid),
    // « Générer la fiche » in progress on the film's clips: their button follows it.
    db
      .select({ id: demandes.id, planUuid: plans.uuid })
      .from(demandes)
      .innerJoin(plans, and(eq(demandes.cibleType, "plan"), eq(plans.id, demandes.cibleId)))
      .where(and(eq(demandes.type, "fiche-plan"), eq(demandes.statut, "en_cours"), eq(plans.episodeId, eid))),
  ]);
  const ficheParPlan = new Map(fichesEnCours.map((f) => [f.planUuid, f.id]));
  if (!projet || !episode || episode.projectId !== pid) notFound();

  // Derived state and thumbnail of each clip (kept render), by uuid.
  const parUuid = new Map(pellicule.map((p) => [p.uuid, p]));

  // Scenes in order, then clips without a scene: a clip's start timing is the sum of the durations of those before it.
  let cumul = 0;
  const versVue = (plan: (typeof sansScene)[number]): PlanVue => {
    const debut = cumul;
    cumul += plan.dureeMontageSecondes;
    const p = parUuid.get(plan.uuid);
    return {
      id: plan.id,
      uuid: plan.uuid,
      position: plan.position,
      titre: plan.titre,
      description: plan.description,
      statut: plan.statut,
      duree: plan.dureeMontageSecondes,
      debut,
      etat: p?.etat ?? "brouillon",
      src: srcRendu(p?.vignette),
      href: `${base}/montage/${plan.uuid}`,
      ficheEnCours: ficheParPlan.get(plan.uuid) ?? null,
      intentionChangee: intentions.get(plan.uuid) ?? null,
    };
  };

  const groupes: SceneVue[] = scenes.map((sc) => {
    const plans = sc.plans.map(versVue);
    return { id: sc.id, titre: sc.titre, fonction: sc.fonction, ambiance: sc.ambiance, creativite: sc.creativite, styleCamera: sc.styleCamera, duree: plans.reduce((acc, p) => acc + p.duree, 0), plans };
  });
  // A clip belongs to a scene: « Sans scène » only appears if orphan clips remain (old films), so as not to make them invisible.
  if (sansScene.length > 0) {
    const plans = sansScene.map(versVue);
    groupes.push({ id: null, titre: "Sans scène", fonction: null, ambiance: null, creativite: null, styleCamera: null, duree: plans.reduce((acc, p) => acc + p.duree, 0), plans });
  }

  // The state of the clip sheets: one line in the screenplay bar (its gesture, « Écrire les N fiches », opens a popup).
  const fiches = {
    nbPlans: etat.nbPlans,
    nbDeveloppes: etat.nbDeveloppes,
  };

  return <VueScenario projectId={pid} episodeId={eid} reglagesProjet={{ creativite: projet?.creativite ?? null, styleCamera: projet?.styleCamera ?? null }} demos={demosMiseEnScene()} groupes={groupes} sceneInitiale={scene ?? null} ajout={ajout} ajoutScene={ajoutScene} fiches={fiches} />;
}
