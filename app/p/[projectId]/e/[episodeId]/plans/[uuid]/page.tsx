import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, getPlanDetail, getScenesEpisode, type AssetNode } from "@/lib/queries";
import { infosMedia } from "@/lib/assetMedia";
import { getAllParams } from "@/lib/params";
import { calculerStatutDuree, controlerStructure, verifierCoherenceRefs } from "@/lib/plan-checks";
import { getDialoguesPlan, getOptionsLocuteur } from "@/lib/queries-repliques";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
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
import { SuiviRendus } from "@/components/plan/SuiviRendus";
import { PlanScenarioPanel } from "@/components/plan/PlanScenarioPanel";
import { SupprimerPlanButton } from "@/components/plan/SupprimerPlanButton";
import { ActionsRendu } from "@/components/plan/ActionsRendu";
import { LecteursRendus } from "@/components/plan/LecteursRendus";
import { assemblerPrompt } from "@/lib/prompt";
import { choisirComparaison, choisirRendu, estLisible, promptDiffere, raisonNonRetenable, type RenduVue } from "@/lib/rendus";

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
  searchParams,
}: {
  params: Promise<{ projectId: string; episodeId: string; uuid: string }>;
  searchParams: Promise<{ rendu?: string; compare?: string }>;
}) {
  const { projectId, episodeId, uuid } = await params;
  const { rendu: renduParam, compare: compareParam } = await searchParams;
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
  // comme déclarée sans être dans plan_refs, et n'a pas à être citée (les
  // fiches validées et le contrat de plan-h3 ne citent jamais les voix).
  const { labelsOrphelins, refsNonCitees } = verifierCoherenceRefs(
    sectionsPourControle,
    refs.map((r) => ({ type: r.type, slot: r.slot })),
    audioRefs,
  );
  const structure = controlerStructure(sectionsPourControle, plan.dureeGenerationSecondes);
  const { statut: statutDuree, totalSecondes } = calculerStatutDuree(
    liaisons.map((l) => ({ dureeSecondes: l.dureeSecondes })),
    Number(parametresGlobaux.duree_plafond_secondes),
    Number(parametresGlobaux.marge_respiration_secondes),
  );

  const dernierJobTermine = jobHistory.find((j) => j.statut === "termine");
  // L'historique se parcourt par l'URL (?rendu=… ?compare=…) : cliquer un rendu le charge dans le lecteur, on peut en comparer deux.
  const rendusVus: RenduVue[] = jobHistory.map((j) => ({
    id: j.id,
    numeroRendu: j.numeroRendu,
    statut: j.statut,
    cheminSortie: j.cheminSortie,
    seedUtilisee: j.seedUtilisee,
    dureeUtilisee: j.dureeUtilisee,
    promptUtilise: j.promptUtilise,
    activerUpscale: j.activerUpscale,
    importe: j.workflowFichier === WORKFLOW_IMPORT_MANUEL,
  }));
  const principal = choisirRendu(rendusVus, Number(renduParam) || null);
  const comparaison = choisirComparaison(rendusVus, Number(compareParam) || null, principal);
  const jobAffiche = (principal && jobHistory.find((j) => j.id === principal.id)) || dernierJobTermine;
  const promptCourant = assemblerPrompt(promptSections);
  const baseHref = `/p/${pid}/e/${eid}/plans/${uuid}`;
  const hrefRendus = (rendu: number | null, compare: number | null) => {
    const q = new URLSearchParams();
    if (rendu != null) q.set("rendu", String(rendu));
    if (compare != null) q.set("compare", String(compare));
    const texte = q.toString();
    return texte ? `${baseHref}?${texte}` : baseHref;
  };
  const libelleRendu = (r: RenduVue) => `rendu n°${r.numeroRendu} · ${r.importe ? "import manuel" : r.activerUpscale ? "rendu final" : "prévisualisation"}`;
  // Un rendu exploitable par la correction après visionnage : terminé ET avec son fichier.
  const aUnRendu = jobHistory.some((j) => j.statut === "termine" && !!j.cheminSortie);
  const aUneFiche = promptSections.some((s) => s.contenu.trim());

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
          <BoutonAgent
            demande={{
              projectId: pid,
              portee: "plan",
              cible: { uuid },
              profondeur: "courte",
              libelle: `Plan ${String(position).padStart(2, "0")} · ${plan.titre}`,
              episodeId: eid,
              planUuid: uuid,
            }}
            titre="Demander à l'agent : modifier ce plan, ou en ajouter un après lui"
          />
          {/* Routage par état du plan (2026-10-02) : sans fiche ou sans rendu → plan-h3 (écrire / réécrire la
              fiche) ; avec un rendu → la correction après visionnage (iteration-plan) est le geste normal, la
              réécriture complète reste possible, avec un avertissement. */}
          {aUnRendu && aUneFiche ? (
            <BoutonAgent
              demande={{
                projectId: pid,
                portee: "plan",
                cible: { uuid },
                profondeur: "courte",
                libelle: `Plan ${String(position).padStart(2, "0")} · ${plan.titre}`,
                episodeId: eid,
                planUuid: uuid,
                vue: "iteration",
              }}
              libelle="Corriger après visionnage"
              className="btn btn-primary btn-sm"
              titre="Tu as regardé le rendu : dis ce que tu as vu, l'agent compare le rendu au prompt et propose le plus petit changement"
            />
          ) : null}
          <BoutonAgent
            demande={{
              projectId: pid,
              portee: "plan",
              cible: { uuid },
              profondeur: "courte",
              libelle: `Plan ${String(position).padStart(2, "0")} · ${plan.titre}`,
              episodeId: eid,
              planUuid: uuid,
              vue: "fiches",
            }}
            libelle={aUneFiche ? "Réécrire la fiche" : "Écrire la fiche"}
            titre={
              aUnRendu
                ? "Ce plan a un rendu : préfère « Corriger après visionnage ». Réécrire la fiche remplace tout (sections et références)."
                : "L'agent écrit le prompt vidéo de ce plan (six sections, références, durée) ; tu relis avant qu'il soit écrit"
            }
          />
          {!estBrouillon ? <RelaunchButton planId={plan.id} /> : null}
          <SuiviRendus planUuid={plan.uuid} jobs={jobHistory.map((j) => ({ id: j.id, statut: j.statut }))} />
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
              {principal?.cheminSortie ? (
                <LecteursRendus
                  principal={{ src: `/api/media/${principal.cheminSortie}`, titre: libelleRendu(principal) }}
                  comparaison={comparaison?.cheminSortie ? { src: `/api/media/${comparaison.cheminSortie}`, titre: libelleRendu(comparaison) } : null}
                  hrefSansComparaison={hrefRendus(principal.id, null)}
                />
              ) : (
                <p className="preview-empty">Aucune génération terminée pour ce plan.</p>
              )}
            </div>
            {jobAffiche ? (
              <div className="preview-bar">
                <span>
                  {jobAffiche.workflowFichier === WORKFLOW_IMPORT_MANUEL
                    ? "Plan déjà tourné · importé"
                    : jobAffiche.id === dernierJobTermine?.id
                      ? "Dernière génération"
                      : `Rendu n°${jobAffiche.numeroRendu}`}{" "}
                  ·{" "}
                  <span className="num">
                    {jobAffiche.finishedAt
                      ? new Date(jobAffiche.finishedAt).toLocaleString("fr-FR")
                      : "—"}
                  </span>
                </span>
                {jobAffiche.seedUtilisee ? (
                  <span>
                    seed <span className="num">{jobAffiche.seedUtilisee}</span>
                  </span>
                ) : null}
                <span className="file">{jobAffiche.cheminSortie}</span>
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
                {jobHistory.map((job, k) => {
                  const rendu = rendusVus[k]!;
                  const lisible = estLisible(rendu);
                  const estPrincipal = principal?.id === job.id;
                  const estComparaison = comparaison?.id === job.id;
                  const retenable = raisonNonRetenable(rendu) == null;
                  return (
                    <div
                      key={job.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        fontSize: 12.5,
                        padding: "6px 8px",
                        borderLeft: `2px solid ${estPrincipal ? "var(--or)" : estComparaison ? "var(--ecarlate-glow)" : "transparent"}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <StatusBadge statut={job.statut} />
                        <span style={{ color: "var(--ink-3)" }}>
                          rendu n°{job.numeroRendu}
                          {job.tentative > 1 ? ` · rejeu ${job.tentative}` : ""}
                        </span>
                        {estPrincipal ? <span className="eyebrow">A · affiché</span> : null}
                        {estComparaison ? <span className="eyebrow">B · comparé</span> : null}
                        <span className="eyebrow" style={{ marginLeft: "auto" }}>
                          {job.workflowFichier === WORKFLOW_IMPORT_MANUEL
                            ? "import manuel"
                            : job.activerUpscale
                              ? "rendu final"
                              : "prévisualisation"}
                        </span>
                      </div>
                      {job.workflowFichier !== WORKFLOW_IMPORT_MANUEL && (job.seedUtilisee || job.dureeUtilisee) ? (
                        <span className="tiny-note num">
                          {job.seedUtilisee ? `seed ${job.seedUtilisee}` : ""}
                          {job.seedUtilisee && job.dureeUtilisee ? " · " : ""}
                          {job.dureeUtilisee ? `${job.dureeUtilisee} s` : ""}
                          {job.seedUtilisee && job.seedUtilisee === plan.seed ? " · seed du plan" : ""}
                        </span>
                      ) : null}
                      {lisible ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!estPrincipal ? (
                            <Link className="btn btn-ghost btn-sm" href={hrefRendus(job.id, comparaison?.id ?? null)} scroll={false}>
                              Voir
                            </Link>
                          ) : null}
                          {!estPrincipal && principal ? (
                            <Link className="btn btn-ghost btn-sm" href={hrefRendus(principal.id, estComparaison ? null : job.id)} scroll={false}>
                              {estComparaison ? "Retirer de la comparaison" : "Comparer avec A"}
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                      {retenable ? (
                        <ActionsRendu
                          planId={plan.id}
                          jobId={job.id}
                          promptChange={promptDiffere(promptCourant, job.promptUtilise)}
                          aUnPrompt={!!job.promptUtilise}
                          estSeedDuPlan={!!job.seedUtilisee && job.seedUtilisee === plan.seed}
                        />
                      ) : null}
                      {job.promptUtilise ? (
                        <details>
                          <summary className="tiny-note" style={{ cursor: "pointer" }}>
                            Prompt envoyé
                          </summary>
                          <pre className="tiny-note" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                            {job.promptUtilise}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
      )}
    </div>
  );
}
