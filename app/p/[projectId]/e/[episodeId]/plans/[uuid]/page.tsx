import { getPlansPerimes } from "@/lib/plans-perimes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, getPlanDetail, getScenesEpisode, type AssetNode } from "@/lib/queries";
import { infosMedia } from "@/lib/assetMedia";
import { getAllParams } from "@/lib/params";
import { calculerStatutDuree, controlerStructure, resumerProblemesDialogues, verifierCoherenceRefs } from "@/lib/plan-checks";
import { getDialoguesPlan, getOptionsLocuteur, getPrisesGenerees } from "@/lib/queries-repliques";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { ImporterVideoForm } from "@/components/plan/ImporterVideoForm";
import { WORKFLOW_IMPORT_MANUEL } from "@/lib/plan-checks";
import { RefsPanel, type RefVue } from "@/components/plan/RefsPanel";
import type { NoeudPicker } from "@/components/plan/AssetPickerModal";
import { DialoguesPanel } from "@/components/plan/DialoguesPanel";
import { SuiviRendus } from "@/components/plan/SuiviRendus";
import { PlanScenarioPanel } from "@/components/plan/PlanScenarioPanel";
import { SupprimerPlanButton } from "@/components/plan/SupprimerPlanButton";
import { BrouillonProvider } from "@/components/plan/BrouillonPlan";
import { ConsoleRendu } from "@/components/plan/ConsoleRendu";
import { PromptBloc } from "@/components/plan/PromptBloc";
import { ControlesEntete, type AlerteControle } from "@/components/plan/ControlesEntete";
import { Pellicule, type PriseVue } from "@/components/plan/Pellicule";
import { Braises } from "@/components/plan/Braises";
import { ActionsRendu } from "@/components/plan/ActionsRendu";
import { LecteursRendus } from "@/components/plan/LecteursRendus";
import { assemblerPrompt } from "@/lib/prompt";
import { choisirComparaison, choisirRendu, estLisible, promptDiffere, raisonNonRetenable, type RenduVue } from "@/lib/rendus";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const prisesGenerees = await getPrisesGenerees(liaisons.map((l) => l.id));

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
  const posLabel = `Plan ${String(position).padStart(2, "0")} · ${plan.titre}`;
  const demandeAgent = {
    projectId: pid,
    portee: "plan" as const,
    cible: { uuid },
    profondeur: "courte" as const,
    libelle: posLabel,
    episodeId: eid,
    planUuid: uuid,
  };

  // Pellicule : le plus ancien rendu à gauche. A = le rendu du lecteur, B = celui qu'on lui compare.
  const numeroDernier = jobHistory.reduce((m, j) => Math.max(m, j.numeroRendu), 0);
  const lisibles = rendusVus.filter(estLisible);
  const prises: PriseVue[] = [...jobHistory]
    .sort((x, y) => x.numeroRendu - y.numeroRendu)
    .map((j) => {
      const rendu = rendusVus.find((r) => r.id === j.id)!;
      const lisible = estLisible(rendu);
      const estA = principal?.id === j.id;
      return {
        id: j.id,
        numeroRendu: j.numeroRendu,
        statut: j.statut,
        src: lisible && j.cheminSortie ? `/api/media/${j.cheminSortie}` : null,
        genre: rendu.importe ? "import" : rendu.activerUpscale ? "final" : "aperçu",
        rejeu: j.tentative,
        seedCourte: j.seedUtilisee ? j.seedUtilisee.slice(0, 4) : null,
        hrefA: hrefRendus(j.id, comparaison && comparaison.id !== j.id ? comparaison.id : null),
        hrefB: lisible && !estA && principal ? hrefRendus(principal.id, comparaison?.id === j.id ? null : j.id) : null,
        estA,
        estB: comparaison?.id === j.id,
      };
    });
  const autreLisible = principal ? [...lisibles].reverse().find((r) => r.id !== principal.id) : undefined;
  const hrefComparer = !comparaison && principal && autreLisible ? hrefRendus(principal.id, autreLisible.id) : null;
  const hrefQuitter = comparaison && principal ? hrefRendus(principal.id, null) : null;
  const principalJob = principal ? jobHistory.find((j) => j.id === principal.id) : undefined;
  const retenable = principal ? raisonNonRetenable(principal) == null : false;

  const perime = (await getPlansPerimes({ planIds: [plan.id] })).get(plan.id);

  // Contrôles repliés dans l'en-tête : références, structure, dialogues.
  const alertes: AlerteControle[] = [
    ...(perime
      ? [
          {
            cle: "refs-perimees",
            niveau: "warn" as const,
            titre: "Rendu périmé",
            detail: `${perime.codes.join(", ")} ${perime.codes.length > 1 ? "ont changé" : "a changé"} depuis le dernier rendu : relance pour en tenir compte.`,
            ancre: "fp-refs",
          },
        ]
      : []),
    ...labelsOrphelins.map(
      (l): AlerteControle => ({
        cle: `orph-${l}`,
        niveau: "warn",
        titre: "Référence citée mais non déclarée",
        detail: `<${l.replace(":", " ")}> est cité dans le prompt mais absent des références du plan.`,
        ancre: "fp-refs",
      }),
    ),
    ...structure.map(
      (p, i): AlerteControle => ({
        cle: `struct-${p.type}-${i}`,
        niveau: "warn",
        titre: p.type === "duree_invalide" ? "Durée de génération" : "Découpage en shots",
        detail: p.message,
      }),
    ),
    ...(controle.ok
      ? []
      : [
          {
            cle: "dialogues",
            niveau: "warn" as const,
            titre: "Dialogues à corriger",
            detail: resumerProblemesDialogues(controle.problemes),
            ancre: "fp-dialogues",
          },
        ]),
    ...refsNonCitees.map(
      (l): AlerteControle => ({
        cle: `noncite-${l}`,
        niveau: "info",
        titre: "Référence déclarée mais jamais citée",
        detail: `<${l.replace(":", " ")}> n'apparaît dans aucune section du prompt.`,
      }),
    ),
  ];

  const declarees = [
    ...refs.map((r) => `${r.type === "picture" ? "Picture" : r.type === "video" ? "Video" : "Audio"} ${r.slot}`),
    ...audioRefs.map((r) => `Audio ${r.slot}`),
  ];
  const serveur = {
    sections: Object.fromEntries(promptSections.map((s) => [s.section, s.contenu])),
    duree: plan.dureeGenerationSecondes,
    fps: plan.fps,
    seed: plan.seed,
  };

  return (
    <div className="fp">
      <div className="fp-bar">
        <div className="pivot-no">
          <small>Plan</small>
          {String(position).padStart(2, "0")}
        </div>
        <div className="fp-ident">
          {scene ? <p className="eyebrow fiche-scene">{scene.titre}</p> : null}
          <h1>{plan.titre}</h1>
          <p className="sub">
            {plan.numerosSource && plan.numerosSource.length > 1 ? `Fusion des plans ${plan.numerosSource.join(" + ")}` : plan.acte ?? ""}
          </p>
        </div>
        <div className="fp-etat-plan">
          <StatusBadge statut={plan.statut} />
          {!estBrouillon ? <ControlesEntete alertes={alertes} /> : null}
          <details className="fp-plus">
            <summary className="btn btn-ghost btn-sm" aria-label="Autres actions">
              ⋯
            </summary>
            <div className="fp-plus-pop">
              {!estBrouillon ? <ImporterVideoForm planId={plan.id} /> : null}
              <SupprimerPlanButton planId={plan.id} position={position} plansHref={plansHref} />
            </div>
          </details>
        </div>
        <SuiviRendus planUuid={plan.uuid} jobs={jobHistory.map((j) => ({ id: j.id, statut: j.statut }))} />
      </div>

      {estBrouillon ? (
        <div style={{ marginTop: "var(--sp-5)", maxWidth: 760 }}>
          <PlanScenarioPanel planId={plan.id} brouillon initial={scenarioInitial} />
        </div>
      ) : (
        <BrouillonProvider planId={plan.id} serveur={serveur} prochainRendu={numeroDernier + 1}>
          {/* Rappel du scénario dans l'en-tête : lecture seule, « Modifier » ouvre le formulaire. */}
          <div className="fp-rappel">
            <PlanScenarioPanel planId={plan.id} brouillon={false} initial={scenarioInitial} />
          </div>

          <div className="fp-grille">
            <div className="fp-gauche">
              <section className="preview">
                <div className="preview-frame">
                  {principal?.cheminSortie ? (
                    <LecteursRendus
                      principal={{ src: `/api/media/${principal.cheminSortie}`, titre: libelleRendu(principal) }}
                      comparaison={comparaison?.cheminSortie ? { src: `/api/media/${comparaison.cheminSortie}`, titre: libelleRendu(comparaison) } : null}
                      hrefSansComparaison={hrefRendus(principal.id, null)}
                    />
                  ) : (
                    <>
                      <Braises />
                      <p className="preview-empty">Aucune génération terminée pour ce plan.</p>
                    </>
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
                      <span className="num">{jobAffiche.finishedAt ? new Date(jobAffiche.finishedAt).toLocaleString("fr-FR") : "—"}</span>
                    </span>
                    {jobAffiche.seedUtilisee ? (
                      <span>
                        seed <span className="num">{jobAffiche.seedUtilisee}</span>
                      </span>
                    ) : null}
                    <span className="file">{jobAffiche.cheminSortie}</span>
                  </div>
                ) : null}
                <Pellicule prises={prises} hrefComparer={hrefComparer} hrefQuitter={hrefQuitter} />
                {(aUnRendu && aUneFiche) || (principal && principalJob && (retenable || principalJob.promptUtilise)) ? (
                  <div className="fp-sous-lecteur">
                    {aUnRendu && aUneFiche ? (
                      <BoutonAgent
                        demande={{ ...demandeAgent, vue: "iteration" }}
                        libelle="Corriger après visionnage"
                        className="btn btn-primary btn-sm"
                        titre="Tu as regardé le rendu : dis ce que tu as vu, l'agent compare le rendu au prompt et propose le plus petit changement"
                      />
                    ) : null}
                    {principal && principalJob && retenable ? (
                      <details className="fp-actions-rendu">
                        <summary className="fp-lien">Actions sur le rendu n°{principal.numeroRendu}</summary>
                        <ActionsRendu
                          planId={plan.id}
                          jobId={principalJob.id}
                          promptChange={promptDiffere(promptCourant, principalJob.promptUtilise)}
                          aUnPrompt={!!principalJob.promptUtilise}
                          estSeedDuPlan={!!principalJob.seedUtilisee && principalJob.seedUtilisee === plan.seed}
                        />
                      </details>
                    ) : null}
                    {principalJob?.promptUtilise ? (
                      <details className="fp-actions-rendu">
                        <summary className="fp-lien">Prompt envoyé pour ce rendu</summary>
                        <pre className="tiny-note" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                          {principalJob.promptUtilise}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <ConsoleRendu timecodeMusique={plan.timecodeMusique} />
            </div>

            <div className="fp-droite">
              <RefsPanel planId={plan.id} refs={refsVue} masters={mastersPicker} />
              <div className="fp-duo">
                <PromptBloc planId={plan.id} declarees={declarees} demandeAgent={demandeAgent} aUneFiche={aUneFiche} />
                <div id="fp-dialogues" className="fp-dialogues">
                  <DialoguesPanel
                    planId={plan.id}
                    planUuid={plan.uuid}
                    prises={prisesGenerees}
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
              </div>
            </div>
          </div>
        </BrouillonProvider>
      )}
    </div>
  );
}
