import { getEpisode, getEtatPlans, getProject, getScenarioData } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/queries-fiche-plan";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { demandes } from "@/db/schema";
import { VueScenario } from "@/components/scenario/VueScenario";
import { srcRendu } from "@/components/plan/Vignette";
import type { ContexteAjoutPlan, ContexteAjoutScene } from "@/lib/demandes";
import type { AjoutEnCours, AjoutSceneEnCours, PlanVue, SceneVue } from "@/lib/scenario-vue";

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

  const [projet, episode, { scenes, sansScene }, pellicule, etat, enCours] = await Promise.all([
    getProject(pid),
    getEpisode(eid),
    getScenarioData(eid),
    getPelliculePlans(eid),
    getEtatPlans(eid),
    // Un plan ou une scène en cours d'écriture (« Ajouter un plan », « Nouvelle scène ») : la page lui garde sa place, sous forme de carte fantôme.
    db.select().from(demandes).where(and(inArray(demandes.type, ["ajout-plan", "ajout-scene"]), eq(demandes.cibleType, "episode"), eq(demandes.cibleId, eid), eq(demandes.statut, "en_cours"))),
  ]);
  if (!projet || !episode || episode.projectId !== pid) notFound();
  const ajoutPlanEnCours = enCours.find((d) => d.type === "ajout-plan");
  const ajoutSceneEnCours = enCours.find((d) => d.type === "ajout-scene");
  const ctxAjout = ajoutPlanEnCours ? (ajoutPlanEnCours.contexte as ContexteAjoutPlan) : null;
  const ajout: AjoutEnCours | null = ajoutPlanEnCours && ctxAjout ? { id: ajoutPlanEnCours.id, sceneId: ctxAjout.sceneId, position: ctxAjout.position, consigne: ctxAjout.consigne } : null;
  const ctxScene = ajoutSceneEnCours ? (ajoutSceneEnCours.contexte as ContexteAjoutScene) : null;
  const ajoutScene: AjoutSceneEnCours | null = ajoutSceneEnCours && ctxScene ? { id: ajoutSceneEnCours.id, place: ctxScene.place, consigne: ctxScene.consigne } : null;

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
  // Un plan appartient à une scène : « Sans scène » n'apparaît que s'il reste des plans orphelins (anciens films), pour ne pas les rendre invisibles.
  if (sansScene.length > 0) {
    const plans = sansScene.map(versVue);
    groupes.push({ id: null, titre: "Sans scène", fonction: null, genre: null, ambiance: null, duree: plans.reduce((acc, p) => acc + p.duree, 0), plans });
  }

  // L'état des fiches de plan et son geste (« Écrire les N fiches ») : une ligne dans la barre du scénario.
  const fiches = {
    nbPlans: etat.nbPlans,
    nbDeveloppes: etat.nbDeveloppes,
    demande: { projectId: pid, portee: "episode" as const, cible: { id: eid }, profondeur: "courte" as const, libelle: projet.nom, episodeId: eid, vue: "fiches" as const },
  };

  return <VueScenario projectId={pid} episodeId={eid} groupes={groupes} sceneInitiale={scene ?? null} ajout={ajout} ajoutScene={ajoutScene} fiches={fiches} />;
}
