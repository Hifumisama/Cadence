import { notFound } from "next/navigation";
import { getAllAssets, getPlanDetail, getScenesEpisode } from "@/lib/queries";
import { getAllParams } from "@/lib/params";
import {
  calculerStatutDuree,
  verifierCoherenceRefs,
  verifierInvariantVerbatim,
} from "@/lib/plan-checks";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PromptSectionEditor } from "@/components/plan/PromptSectionEditor";
import { RefsPanel } from "@/components/plan/RefsPanel";
import { PlanParamsEditor } from "@/components/plan/PlanParamsEditor";
import { DialogueTable } from "@/components/plan/DialogueTable";
import { ChecksPanel } from "@/components/plan/ChecksPanel";
import { RelaunchButton } from "@/components/plan/RelaunchButton";
import { PlanScenarioPanel } from "@/components/plan/PlanScenarioPanel";
import { PlanSceneSelect } from "@/components/scenario/ScenePlanControls";
import { SupprimerPlanButton } from "@/components/plan/SupprimerPlanButton";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECTIONS_ORDRE = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
];

export default async function PlanPage({
  params,
}: {
  params: Promise<{ projectId: string; episodeId: string; uuid: string }>;
}) {
  const { projectId, episodeId, uuid } = await params;
  const pid = Number(projectId);
  const eid = Number(episodeId);
  if (!UUID_RE.test(uuid)) notFound();
  const detail = await getPlanDetail(uuid, eid);
  if (!detail) notFound();

  const { plan, position, promptSections, refs, dialogues, jobHistory } = detail;

  const [parametresGlobaux, tousLesAssets, scenesEpisode] = await Promise.all([
    getAllParams(),
    getAllAssets(pid),
    getScenesEpisode(eid),
  ]);

  const sectionsPourControle = promptSections.map((s) => ({
    section: s.section,
    contenu: s.contenu,
  }));

  const { labelsOrphelins, refsNonCitees } = verifierCoherenceRefs(
    sectionsPourControle,
    refs.map((r) => ({ type: r.type, slot: r.slot })),
  );
  const verbatimResults = verifierInvariantVerbatim(
    sectionsPourControle,
    dialogues.map((d) => ({ replique: d.replique, dureeSecondes: d.dureeSecondes })),
  );
  const { statut: statutDuree, totalSecondes } = calculerStatutDuree(
    dialogues.map((d) => ({ replique: d.replique, dureeSecondes: d.dureeSecondes })),
    Number(parametresGlobaux.duree_plafond_secondes),
    Number(parametresGlobaux.marge_respiration_secondes),
  );

  const dernierJobTermine = jobHistory.find((j) => j.statut === "termine");

  const sectionsParNom = new Map(promptSections.map((s) => [s.section, s]));

  const scenarioInitial = {
    titre: plan.titre,
    description: plan.description ?? "",
    dureeMontageSecondes: plan.dureeMontageSecondes,
  };

  const estBrouillon = plan.statut === "brouillon";
  const shotsHref = `/p/${pid}/e/${eid}/shots`;

  return (
    <div>
      <div className="fiche-hd">
        <div className="fiche-pivot">
          <div className="pivot-no">
            <small>Plan</small>
            {String(position).padStart(2, "0")}
          </div>
          <div>
            <h1>{plan.titre}</h1>
            <p className="sub">
              {plan.numerosSource && plan.numerosSource.length > 1
                ? `Fusion des plans ${plan.numerosSource.join(" + ")}`
                : plan.acte ?? ""}
            </p>
          </div>
        </div>
        <div className="fiche-actions">
          <StatusBadge statut={plan.statut} />
          {!estBrouillon ? <RelaunchButton planId={plan.id} /> : null}
          <SupprimerPlanButton planId={plan.id} position={position} shotsHref={shotsHref} />
        </div>
      </div>

      {estBrouillon ? (
        <div style={{ marginTop: "var(--sp-5)", maxWidth: 760 }}>
          <PlanSceneSelect planId={plan.id} sceneId={plan.sceneId} scenes={scenesEpisode} />
          <PlanScenarioPanel
            planId={plan.id}
            brouillon
            initial={scenarioInitial}
          />
        </div>
      ) : (
      <div className="cols">
        <div className="col">
          <PlanSceneSelect planId={plan.id} sceneId={plan.sceneId} scenes={scenesEpisode} />
          <PlanScenarioPanel
            planId={plan.id}
            brouillon={false}
            initial={scenarioInitial}
          />
          <section className="preview">
            <div className="preview-frame">
              {dernierJobTermine?.cheminSortie ? (
                <video
                  controls
                  style={{ width: "100%", height: "100%" }}
                  src={`/api/media/${dernierJobTermine.cheminSortie}`}
                />
              ) : (
                <p className="preview-empty">Aucune génération terminée pour ce plan.</p>
              )}
            </div>
            {dernierJobTermine ? (
              <div className="preview-bar">
                <span>
                  Dernière génération ·{" "}
                  <span className="num">
                    {dernierJobTermine.finishedAt
                      ? new Date(dernierJobTermine.finishedAt).toLocaleString("fr-FR")
                      : "—"}
                  </span>
                </span>
                {dernierJobTermine.seedUtilisee ? (
                  <span>
                    seed <span className="num">{dernierJobTermine.seedUtilisee}</span>
                  </span>
                ) : null}
                <span className="file">{dernierJobTermine.cheminSortie}</span>
              </div>
            ) : null}
          </section>

          <PlanParamsEditor
            planId={plan.id}
            fpsInitial={plan.fps}
            dureeInitiale={plan.dureeGenerationSecondes}
            timecodeMusique={plan.timecodeMusique}
            seed={plan.seed}
          />

          <section className="panel">
            <div className="panel-hd">
              <h2>Prompt vidéo</h2>
              <span className="eyebrow">6 sections · format MiniMax H3</span>
            </div>
            <div className="panel-bd">
              <div className="sections">
                {SECTIONS_ORDRE.map((section) => (
                  <PromptSectionEditor
                    key={section}
                    planId={plan.id}
                    section={section}
                    initialContenu={sectionsParNom.get(section)?.contenu ?? ""}
                  />
                ))}
              </div>
            </div>
          </section>

          <DialogueTable
            dialogues={dialogues}
            statutDuree={statutDuree}
            totalSecondes={totalSecondes}
            plafondSecondes={Number(parametresGlobaux.duree_plafond_secondes)}
          />
        </div>

        <aside className="col">
          <section className="panel">
            <div className="panel-hd">
              <h2>Contrôles automatiques</h2>
            </div>
            <ChecksPanel
              labelsOrphelins={labelsOrphelins}
              refsNonCitees={refsNonCitees}
              repliquesNonTrouvees={verbatimResults
                .filter((r) => !r.trouvee)
                .map((r) => r.replique)}
            />
          </section>

          <RefsPanel
            planId={plan.id}
            refs={refs}
            assets={tousLesAssets}
          />

          {jobHistory.length > 0 ? (
            <section className="panel">
              <div className="panel-hd">
                <h2>Historique</h2>
                <span className="eyebrow">Pas de versionnage d&rsquo;assets</span>
              </div>
              <div className="panel-bd" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {jobHistory.map((job) => (
                  <div
                    key={job.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}
                  >
                    <StatusBadge statut={job.statut} />
                    <span style={{ color: "var(--ink-3)" }}>tentative {job.tentative}</span>
                    <span className="eyebrow" style={{ marginLeft: "auto" }}>
                      {job.activerUpscale ? "rendu final" : "prévisualisation"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
      )}
    </div>
  );
}
