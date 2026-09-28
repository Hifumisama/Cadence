import Link from "next/link";
import { getProject, getScenarioData } from "@/lib/queries";
import { notFound } from "next/navigation";
import { StatusBadge, statusNodeClass } from "@/components/ui/StatusBadge";
import { ScenarioGlobalsEditor } from "@/components/scenario/ScenarioGlobalsEditor";
import { NouveauPlanForm } from "@/components/scenario/NouveauPlanForm";
import { NouveauMouvementForm } from "@/components/scenario/NouveauMouvementForm";
import { SupprimerMouvementButton } from "@/components/scenario/SupprimerMouvementButton";

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

  const [projet, { mouvements, sansMouvement, prochainNumeroLibre }] = await Promise.all([
    getProject(pid),
    getScenarioData(eid),
  ]);
  if (!projet) notFound();

  const tousLesPlans = [...mouvements.flatMap((m) => m.plans), ...sansMouvement];
  const nbBrouillons = tousLesPlans.filter((p) => p.statut === "brouillon").length;
  const nbDeveloppes = tousLesPlans.length - nbBrouillons;

  const groupes = [
    ...mouvements.map((m) => ({
      id: m.id as number | null,
      titre: m.titre,
      range: `${String(m.planNumeroDebut).padStart(3, "0")} → ${String(m.planNumeroFin).padStart(3, "0")}`,
      fonction: m.fonction,
      duree: m.dureeApproxSecondes,
      plans: m.plans,
    })),
    ...(sansMouvement.length > 0
      ? [{ id: null, titre: "Sans mouvement", range: "", fonction: null, duree: null, plans: sansMouvement }]
      : []),
  ];

  return (
    <div>
      <div className="screen-hd">
        <div>
          <p className="eyebrow" style={{ margin: "0 0 6px" }}>
            Découpage narratif · point d&rsquo;entrée
          </p>
          <h1>Scénario</h1>
          <p>
            Chaque plan naît ici en brouillon. Il entre en production quand on le
            développe en fiche de plan.
          </p>
        </div>
      </div>

      <ScenarioGlobalsEditor
        projectId={pid}
        valeurs={{
          clauseStyle: projet.clauseStyle,
          scenarioArc: projet.scenarioArc,
          scenarioStyle: projet.scenarioStyle,
          scenarioContinuite: projet.scenarioContinuite,
          scenarioRimes: projet.scenarioRimes,
          scenarioPieges: projet.scenarioPieges,
        }}
      />

      <div className="tally">
        <div className="tally-item">
          <span className="v">{tousLesPlans.length}</span>
          <span className="k">Plans</span>
        </div>
        <div className="tally-item is-termine">
          <span className="v">{nbDeveloppes}</span>
          <span className="k">Développés</span>
        </div>
        <div className="tally-item">
          <span className="v" style={{ color: "var(--or)" }}>{nbBrouillons}</span>
          <span className="k">Brouillons</span>
        </div>
        <span className="tally-spacer" />
        <div className="tally-item">
          <span className="v" style={{ color: "var(--ink-2)" }}>{mouvements.length}</span>
          <span className="k">Mouvements</span>
        </div>
      </div>

      <div className="queue">
        <NouveauPlanForm
          projectId={pid}
          episodeId={eid}
          prochainNumeroLibre={prochainNumeroLibre}
          mouvementsOptions={mouvements.map((m) => ({
            id: m.id,
            titre: m.titre,
            planNumeroDebut: m.planNumeroDebut,
            planNumeroFin: m.planNumeroFin,
          }))}
        />
        <NouveauMouvementForm episodeId={eid} />
      </div>

      {groupes.map((g, idx) => (
        <div key={idx} className="mvt">
          <div className="mvt-top">
            {idx < mouvements.length ? <span className="mvt-roman">{ROMAINS[idx] ?? idx + 1}</span> : null}
            <span className="mvt-title">{g.titre}</span>
            <hr className="zellige-rule" />
            {g.range ? (
              <span className="mvt-range">
                {g.range}
                {g.duree ? ` · ~${g.duree} s` : ""}
              </span>
            ) : null}
            {g.id != null ? <SupprimerMouvementButton mouvementId={g.id} titre={g.titre} /> : null}
          </div>
          {g.fonction ? <p className="mvt-fn">{g.fonction}</p> : null}
          <div className="frise">
            {g.plans.map((plan) => (
              <Link
                key={plan.numero}
                href={`${base}/plans/${plan.numero}`}
                className={`shot ${statusNodeClass(plan.statut)}`}
              >
                <span className="node" />
                <span className="shot-no">{String(plan.numero).padStart(3, "0")}</span>
                <span className="shot-title">
                  {plan.titre}
                  <span className="shot-meta">
                    {plan.valeur ? <span>{plan.valeur}</span> : null}
                    {plan.decor ? <span>{plan.decor}</span> : null}
                  </span>
                </span>
                <span className="shot-right">
                  <StatusBadge statut={plan.statut} />
                </span>
              </Link>
            ))}
            {g.plans.length === 0 ? (
              <p className="tiny-note">Aucun plan dans ce mouvement pour l&rsquo;instant.</p>
            ) : null}
          </div>
        </div>
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
