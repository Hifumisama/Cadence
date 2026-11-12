import { notFound } from "next/navigation";
import { getEpisode, getProject, getScenarioData } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/plans/queries-fiche-plan";
import { srcRendu } from "@/components/plan/Vignette";
import { intentAffichee } from "@/lib/plans/intent";
import { intentionsPerimees } from "@/lib/plans/intention-perimee";
import { ajoutsEnCours } from "@/lib/plans/ajouts-en-cours";
import { VueLecture, type PlanLecture, type SceneLecture } from "@/components/scenario/VueLecture";
import { romain } from "@/lib/plans/scenario-vue";

export const dynamic = "force-dynamic";

/** Le scénario : le texte du film, en continu et au format de script (scènes dans l'ordre, puis les plans sans scène), à relire et à retoucher. La frise de
 * travail (vignettes, fiches, rendus) est la page Tournage (`../tournage`). */
export default async function ScenarioPage({ params, searchParams }: { params: Promise<{ projectId: string; episodeId: string }>; searchParams: Promise<{ scene?: string }> }) {
  const { projectId, episodeId } = await params;
  const { scene } = await searchParams;
  const pid = Number(projectId);
  const eid = Number(episodeId);
  const base = `/p/${pid}/e/${eid}`;

  const [projet, episode, { scenes, sansScene }, intentions, pellicule, { ajout, ajoutScene }] = await Promise.all([getProject(pid), getEpisode(eid), getScenarioData(eid), intentionsPerimees(eid), getPelliculePlans(eid), ajoutsEnCours(eid)]);
  if (!projet || !episode || episode.projectId !== pid) notFound();
  // L'image d'un plan : la vidéo de son rendu retenu, sinon de son dernier rendu terminé (la même que la pellicule du Tournage).
  const imageParPlan = new Map(pellicule.map((p) => [p.uuid, srcRendu(p.vignette)]));

  // Le minutage de départ d'un plan est la somme des durées de ceux qui le précèdent (scènes dans l'ordre), comme sur la page Scénario.
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
  // « Sans scène » n'apparaît que s'il reste des plans orphelins (anciens films), pour ne pas les rendre invisibles.
  if (sansScene.length > 0) {
    const plans = sansScene.map(lire);
    lues.push({ cle: "sans", titre: "Sans scène", numero: null, fonction: null, ambiance: null, duree: plans.reduce((n, p) => n + p.duree, 0), plans });
  }

  return <VueLecture projectId={pid} episodeId={eid} scenes={lues} sceneInitiale={scene ?? null} ajout={ajout} ajoutScene={ajoutScene} />;
}
