import { notFound } from "next/navigation";
import { getAssetsTree, getPlanDetail, getScenesEpisode, type AssetNode } from "@/lib/queries";
import { infosMedia } from "@/lib/assetMedia";
import { getAllParams } from "@/lib/params";
import { calculerStatutDuree, controlerStructure, verifierCoherenceRefs } from "@/lib/plan-checks";
import { getDialoguesPlan, getOptionsLocuteur } from "@/lib/queries-repliques";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PromptSectionEditor } from "@/components/plan/PromptSectionEditor";
import { PromptImportColle } from "@/components/plan/PromptImportColle";
import { ImporterVideoForm } from "@/components/plan/ImporterVideoForm";
import { WORKFLOW_IMPORT_MANUEL } from "@/lib/plan-checks";
import { RefsPanel, type RefVue } from "@/components/plan/RefsPanel";
import type { NoeudPicker } from "@/components/plan/AssetPickerModal";
import { PlanParamsEditor } from "@/components/plan/PlanParamsEditor";
import { DialoguesPanel } from "@/components/plan/DialoguesPanel";
import { ChecksPanel } from "@/components/plan/ChecksPanel";
import { RelaunchButton } from "@/components/plan/RelaunchButton";
import { PlanScenarioPanel } from "@/components/plan/PlanScenarioPanel";
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

function versNoeudPicker(n: AssetNode): NoeudPicker {
  const { kind, etat, src } = infosMedia(n.type, n.fichier);
  return {
    id: n.id,
    code: n.code,
    type: n.type,
    statut: n.statut,
    description: n.description,
    kind,
    etat,
    src,
    derives: n.derives.map(versNoeudPicker),
  };
}

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

  const { plan, position, promptSections, refs, jobHistory } = detail;

  const [parametresGlobaux, mastersRegistre, scenesEpisode, dialoguesPlan, optionsLocuteur] = await Promise.all([
    getAllParams(),
    getAssetsTree(pid),
    getScenesEpisode(eid),
    getDialoguesPlan(pid, plan.id, eid),
    getOptionsLocuteur(pid),
  ]);
  const { liaisons, disponibles, controle, audioRefs } = dialoguesPlan;

  const sectionsPourControle = promptSections.map((s) => ({
    section: s.section,
    contenu: s.contenu,
  }));

  // L'audio de chaque réplique liée EST la ref <Audio N> du plan : elle compte
  // comme déclarée sans être dans plan_refs.
  const { labelsOrphelins, refsNonCitees } = verifierCoherenceRefs(sectionsPourControle, [
    ...refs.map((r) => ({ type: r.type, slot: r.slot })),
    ...audioRefs,
  ]);
  const structure = controlerStructure(sectionsPourControle, plan.dureeGenerationSecondes);
  const { statut: statutDuree, totalSecondes } = calculerStatutDuree(
    liaisons.map((l) => ({ dureeSecondes: l.dureeSecondes })),
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

  const mastersPicker = mastersRegistre.map(versNoeudPicker);
  const refsVue: RefVue[] = refs.map((r) => ({
    id: r.id,
    type: r.type,
    slot: r.slot,
    asset: r.asset
      ? {
          id: r.asset.id,
          code: r.asset.code,
          statut: r.asset.statut,
          ...infosMedia(r.asset.type, r.asset.fichier),
        }
      : null,
  }));

  const scene = scenesEpisode.find((sc) => sc.id === plan.sceneId);
  const estBrouillon = plan.statut === "brouillon";
  const plansHref = `/p/${pid}/e/${eid}/plans`;

  return (
    <div>
      <div className="fiche-hd">
        <div className="fiche-pivot">
          <div className="pivot-no">
            <small>Plan</small>
            {String(position).padStart(2, "0")}
          </div>
          <div>
            {scene ? <p className="eyebrow fiche-scene">{scene.titre}</p> : null}
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
          <SupprimerPlanButton planId={plan.id} position={position} plansHref={plansHref} />
        </div>
        {!estBrouillon && plan.description ? (
          <p className="fiche-desc">{plan.description}</p>
        ) : null}
      </div>

      {estBrouillon ? (
        <div style={{ marginTop: "var(--sp-5)", maxWidth: 760 }}>
          <PlanScenarioPanel
            planId={plan.id}
            brouillon
            initial={scenarioInitial}
          />
        </div>
      ) : (
      <div className="cols">
        <div className="col">
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
                  {dernierJobTermine.workflowFichier === WORKFLOW_IMPORT_MANUEL
                    ? "Plan déjà tourné · importé"
                    : "Dernière génération"}{" "}
                  ·{" "}
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
            <div style={{ padding: "var(--sp-2) var(--sp-3)" }}>
              <ImporterVideoForm planId={plan.id} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-hd">
              <h2>Prompt vidéo</h2>
              <span className="eyebrow">6 sections · format MiniMax H3</span>
            </div>
            <div className="panel-bd">
              <PromptImportColle planId={plan.id} />
              <div className="sections">
                {SECTIONS_ORDRE.map((section) => {
                  const contenu = sectionsParNom.get(section)?.contenu ?? "";
                  return (
                    <PromptSectionEditor
                      // Contenu dans la clé : un collage (PromptImportColle)
                      // écrase les sections côté serveur, il faut donc
                      // remonter l'éditeur pour resynchroniser son état local
                      // — sinon le textarea reste affiché sur l'ancien texte.
                      key={`${section}:${contenu}`}
                      planId={plan.id}
                      section={section}
                      initialContenu={contenu}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          <DialoguesPanel
            planId={plan.id}
            projectId={pid}
            episodeId={eid}
            liaisons={liaisons}
            disponibles={disponibles}
            options={optionsLocuteur}
            controle={controle}
            statutDuree={statutDuree}
            totalSecondes={totalSecondes}
            plafondSecondes={Number(parametresGlobaux.duree_plafond_secondes)}
          />
        </div>

        <aside className="col">
          <PlanParamsEditor
            planId={plan.id}
            fpsInitial={plan.fps}
            dureeInitiale={plan.dureeGenerationSecondes}
            timecodeMusique={plan.timecodeMusique}
            seed={plan.seed}
          />

          <section className="panel">
            <div className="panel-hd">
              <h2>Contrôles automatiques</h2>
            </div>
            <ChecksPanel labelsOrphelins={labelsOrphelins} refsNonCitees={refsNonCitees} structure={structure} />
          </section>

          <RefsPanel
            planId={plan.id}
            refs={refsVue}
            masters={mastersPicker}
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
                      {job.workflowFichier === WORKFLOW_IMPORT_MANUEL
                        ? "import manuel"
                        : job.activerUpscale
                          ? "rendu final"
                          : "prévisualisation"}
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
