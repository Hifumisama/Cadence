import { getEpisode, getProject, getScenarioData } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/queries-fiche-plan";
import { notFound } from "next/navigation";
import { VueScenario } from "@/components/scenario/VueScenario";
import { srcRendu } from "@/components/plan/Vignette";
import type { PlanVue, SceneVue } from "@/lib/scenario-vue";

export const dynamic = "force-dynamic";

export default async function ScenarioPage({
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

  const [projet, episode, { scenes, sansScene }, pellicule] = await Promise.all([
    getProject(pid),
    getEpisode(eid),
    getScenarioData(eid),
    getPelliculePlans(eid),
  ]);
  if (!projet || !episode || episode.projectId !== pid) notFound();

  // État dérivé et vignette de chaque plan (rendu retenu), par uuid.
  const parUuid = new Map(pellicule.map((p) => [p.uuid, p]));

  // Les scènes dans l'ordre, puis les plans sans scène : le minutage de départ d'un plan est la somme des durées de ceux qui le précèdent.
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
      href: `${base}/plans/${plan.uuid}`,
    };
  };

  const groupes: SceneVue[] = scenes.map((sc) => {
    const plans = sc.plans.map(versVue);
    return { id: sc.id, titre: sc.titre, fonction: sc.fonction, genre: sc.genre, ambiance: sc.ambiance, duree: plans.reduce((acc, p) => acc + p.duree, 0), plans };
  });
  // Présent dès qu'il existe une scène : c'est la zone où déposer un plan pour le détacher.
  if (sansScene.length > 0 || scenes.length > 0) {
    const plans = sansScene.map(versVue);
    groupes.push({ id: null, titre: "Sans scène", fonction: null, genre: null, ambiance: null, duree: plans.reduce((acc, p) => acc + p.duree, 0), plans });
  }

  return <VueScenario projectId={pid} episodeId={eid} groupes={groupes} sceneInitiale={scene ?? null} />;
}
