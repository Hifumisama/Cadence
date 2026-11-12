import { notFound } from "next/navigation";
import { getEpisode, getProject, getScenarioData } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/clips/queries-clip-sheet";
import { srcRendu } from "@/components/clip/Thumbnail";
import { intentAffichee } from "@/lib/clips/intent";
import { intentionsPerimees } from "@/lib/clips/stale-intention";
import { ajoutsEnCours } from "@/lib/clips/additions-in-progress";
import { VueLecture, type PlanLecture, type SceneLecture } from "@/components/screenplay/ReadingView";
import { romain } from "@/lib/clips/screenplay-view";

export const dynamic = "force-dynamic";

/** The screenplay: the film's text, continuous and in script format (scenes in order, then clips without a scene), to re-read and retouch. The work
 * strip (thumbnails, sheets, renders) is the Tournage page (`../tournage`). */
export default async function ScenarioPage({ params, searchParams }: { params: Promise<{ projectId: string; episodeId: string }>; searchParams: Promise<{ scene?: string }> }) {
  const { projectId, episodeId } = await params;
  const { scene } = await searchParams;
  const pid = Number(projectId);
  const eid = Number(episodeId);
  const base = `/p/${pid}/e/${eid}`;

  const [projet, episode, { scenes, sansScene }, intentions, pellicule, { ajout, ajoutScene }] = await Promise.all([getProject(pid), getEpisode(eid), getScenarioData(eid), intentionsPerimees(eid), getPelliculePlans(eid), ajoutsEnCours(eid)]);
  if (!projet || !episode || episode.projectId !== pid) notFound();
  // A clip's image: the video of its kept render, otherwise of its last finished render (the same as the Tournage film strip).
  const imageParPlan = new Map(pellicule.map((p) => [p.uuid, srcRendu(p.vignette)]));

  // A clip's start timing is the sum of the durations of those before it (scenes in order), as on the Scénario page.
  let cumul = 0;
  const lire = (plan: (typeof sansScene)[number]): PlanLecture => {
    const debut = cumul;
    cumul += plan.dureeMontageSecondes;
    return {
      id: plan.id,
      uuid: plan.uuid,
      position: plan.position,
      titre: plan.titre,
      texte: intentAffichee(plan.description),
      duree: plan.dureeMontageSecondes,
      debut,
      intentionChangee: intentions.get(plan.uuid) ?? null,
      href: `${base}/montage/${plan.uuid}`,
      src: imageParPlan.get(plan.uuid) ?? null,
    };
  };

  const lues: SceneLecture[] = scenes.map((sc, i) => {
    const plans = sc.plans.map(lire);
    return { cle: String(sc.id), titre: sc.titre, numero: romain(i + 1), fonction: sc.fonction, ambiance: sc.ambiance, duree: plans.reduce((n, p) => n + p.duree, 0), plans };
  });
  // « Sans scène » only appears if orphan clips remain (old films), so as not to make them invisible.
  if (sansScene.length > 0) {
    const plans = sansScene.map(lire);
    lues.push({ cle: "sans", titre: "Sans scène", numero: null, fonction: null, ambiance: null, duree: plans.reduce((n, p) => n + p.duree, 0), plans });
  }

  return <VueLecture projectId={pid} episodeId={eid} scenes={lues} sceneInitiale={scene ?? null} ajout={ajout} ajoutScene={ajoutScene} />;
}
