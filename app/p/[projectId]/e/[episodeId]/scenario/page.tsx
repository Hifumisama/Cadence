import { getEpisodeWithSeason, getProject, getScenarioData } from "@/lib/queries";
import { notFound } from "next/navigation";
import { StatusBadge, statusNodeClass } from "@/components/ui/StatusBadge";
import { NouveauPlanForm } from "@/components/scenario/NouveauPlanForm";
import { NouveauSceneForm } from "@/components/scenario/NouveauSceneForm";
import { SupprimerSceneButton } from "@/components/scenario/SupprimerSceneButton";
import { BasculeScene, ControleAccordeon, CorpsScene, PlanShotLink, PoigneeScene, ZoneScene } from "@/components/scenario/GlisserDeposer";
import { ModifierSceneButton } from "@/components/scenario/ModifierSceneButton";

export const dynamic = "force-dynamic";

const ROMAINS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ projectId: string; episodeId: string }>;
}) {
  const { projectId, episodeId } = await params;
  const pid = Number(projectId);
  const eid = Number(episodeId);
  const base = `/p/${pid}/e/${eid}`;

  const [projet, episodeInfo, { scenes, sansScene }] = await Promise.all([
    getProject(pid),
    getEpisodeWithSeason(eid),
    getScenarioData(eid),
  ]);
  if (!projet || !episodeInfo) notFound();

  const tousLesPlans = [...scenes.flatMap((sc) => sc.plans), ...sansScene];

  const groupes = [
    ...scenes.map((sc) => ({
      id: sc.id as number | null,
      titre: sc.titre,
      range: sc.plans.length > 0 ? `${sc.plans.length} plan${sc.plans.length > 1 ? "s" : ""}` : "",
      fonction: sc.fonction,
      duree: sc.dureeSecondes,
      plans: sc.plans,
    })),
    // Toujours présent dès qu'il existe une scène : c'est la zone où déposer
    // un plan pour le détacher.
    ...(sansScene.length > 0 || scenes.length > 0
      ? [{ id: null, titre: "Sans scène", range: "", fonction: null, duree: null, plans: sansScene }]
      : []),
  ];

  return (
    <div>
      <div className="queue">
        <NouveauPlanForm
          projectId={pid}
          episodeId={eid}
          scenesOptions={scenes.map((sc) => ({ id: sc.id, titre: sc.titre }))}
        />
        <NouveauSceneForm episodeId={eid} />
        {scenes.length > 0 ? <ControleAccordeon /> : null}
      </div>

      {groupes.map((g, idx) => (
        <ZoneScene key={idx} sceneId={g.id} suivantSceneId={idx < scenes.length - 1 ? scenes[idx + 1]!.id : null}>
          <div className="scene-top">
            <BasculeScene titre={g.titre} />
            {g.id != null ? <PoigneeScene sceneId={g.id} /> : null}
            {idx < scenes.length ? <span className="scene-roman">{ROMAINS[idx] ?? idx + 1}</span> : null}
            <span className="scene-title">{g.titre}</span>
            <hr className="zellige-rule" />
            {g.range ? (
              <span className="scene-range">
                {g.range}
                {g.duree ? ` · ~${g.duree} s` : ""}
              </span>
            ) : null}
            {g.id != null ? (
              <ModifierSceneButton sceneId={g.id} titre={g.titre} fonction={g.fonction ?? ""} />
            ) : null}
            {g.id != null ? <SupprimerSceneButton sceneId={g.id} titre={g.titre} /> : null}
          </div>
          <CorpsScene>
          {g.fonction ? <p className="scene-fn">{g.fonction}</p> : null}
          <div className="frise">
            {g.plans.map((plan, i) => (
              <PlanShotLink
                key={plan.id}
                planId={plan.id}
                sceneId={g.id}
                suivantId={g.plans[i + 1]?.id ?? null}
                href={`${base}/plans/${plan.uuid}`}
                className={`shot ${statusNodeClass(plan.statut)}`}
              >
                <span className="node" />
                <span className="shot-no">{String(plan.position).padStart(2, "0")}</span>
                <span className="shot-title">
                  {plan.titre}
                  {plan.description ? <span className="shot-desc">{plan.description}</span> : null}
                </span>
                <span className="shot-right">
                  <span className="shot-duree num" title="Durée de montage">
                    {plan.dureeMontageSecondes} s
                  </span>
                  {/* Brouillon = état par défaut d'un plan du scénario : on ne le répète pas 13 fois. */}
                  {plan.statut !== "brouillon" ? <StatusBadge statut={plan.statut} /> : null}
                </span>
              </PlanShotLink>
            ))}
            {g.plans.length === 0 ? (
              <p className="tiny-note">Aucun plan — glisse-en un ici.</p>
            ) : null}
          </div>
          </CorpsScene>
        </ZoneScene>
      ))}

      {tousLesPlans.length === 0 ? (
        <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
          Aucun plan en base. Lancer <code>npm run db:import</code> pour importer
          l&rsquo;épisode 1 depuis le markdown existant, ou créer un plan à la main
          ci-dessus.
        </p>
      ) : null}
    </div>
  );
}
