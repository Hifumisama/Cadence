import { getEpisode, getEtatPlans, getProject, getScenarioData } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/plans/queries-fiche-plan";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { demandes, plans } from "@/db/schema";
import { demosMiseEnScene } from "@/lib/media";
import { VueScenario } from "@/components/scenario/VueScenario";
import { srcRendu } from "@/components/plan/Vignette";
import { intentionsPerimees } from "@/lib/plans/intention-perimee";
import { ajoutsEnCours } from "@/lib/plans/ajouts-en-cours";
import type { PlanVue, SceneVue } from "@/lib/plans/scenario-vue";

export const dynamic = "force-dynamic";

/** Le tournage : la frise de travail (scènes, plans en vignettes, états de fiche et de rendu, ajouts et déplacements). C'était la page « Scénario » avant que
 * celle-ci devienne le texte à lire (`../scenario`, 2026-11-10). */
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
    // Les plans dont le texte a changé depuis leur fiche ou leur dernier rendu (repère « texte modifié »).
    intentionsPerimees(eid),
    // Un plan ou une scène en cours d'écriture (« Ajouter un plan », « Nouvelle scène ») : la page lui garde sa place, sous forme de carte fantôme.
    ajoutsEnCours(eid),
    // « Générer la fiche » en cours sur les plans du film : leur bouton la suit.
    db
      .select({ id: demandes.id, planUuid: plans.uuid })
      .from(demandes)
      .innerJoin(plans, and(eq(demandes.cibleType, "plan"), eq(plans.id, demandes.cibleId)))
      .where(and(eq(demandes.type, "fiche-plan"), eq(demandes.statut, "en_cours"), eq(plans.episodeId, eid))),
  ]);
  const ficheParPlan = new Map(fichesEnCours.map((f) => [f.planUuid, f.id]));
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
      href: `${base}/montage/${plan.uuid}`,
      ficheEnCours: ficheParPlan.get(plan.uuid) ?? null,
      intentionChangee: intentions.get(plan.uuid) ?? null,
    };
  };

  const groupes: SceneVue[] = scenes.map((sc) => {
    const plans = sc.plans.map(versVue);
    return { id: sc.id, titre: sc.titre, fonction: sc.fonction, ambiance: sc.ambiance, creativite: sc.creativite, styleCamera: sc.styleCamera, duree: plans.reduce((acc, p) => acc + p.duree, 0), plans };
  });
  // Un plan appartient à une scène : « Sans scène » n'apparaît que s'il reste des plans orphelins (anciens films), pour ne pas les rendre invisibles.
  if (sansScene.length > 0) {
    const plans = sansScene.map(versVue);
    groupes.push({ id: null, titre: "Sans scène", fonction: null, ambiance: null, creativite: null, styleCamera: null, duree: plans.reduce((acc, p) => acc + p.duree, 0), plans });
  }

  // L'état des fiches de plan : une ligne dans la barre du scénario (son geste, « Écrire les N fiches », ouvre une popup).
  const fiches = {
    nbPlans: etat.nbPlans,
    nbDeveloppes: etat.nbDeveloppes,
  };

  return <VueScenario projectId={pid} episodeId={eid} reglagesProjet={{ creativite: projet?.creativite ?? null, styleCamera: projet?.styleCamera ?? null }} demos={demosMiseEnScene()} groupes={groupes} sceneInitiale={scene ?? null} ajout={ajout} ajoutScene={ajoutScene} fiches={fiches} />;
}
