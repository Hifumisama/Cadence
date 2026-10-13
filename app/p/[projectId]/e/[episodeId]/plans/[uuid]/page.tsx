import { notFound } from "next/navigation";
import { getPlansPerimes } from "@/lib/plans-perimes";
import { getAssetsTree, getPlanDetail, getScenesEpisode, type AssetNode } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/queries-fiche-plan";
import { infosMedia } from "@/lib/assetMedia";
import { getAllParams } from "@/lib/params";
import { calculerStatutDuree, controlerStructure, estProblemeBloquant, phraseVoix, resumerProblemesDialogues, verifierCoherenceRefs, WORKFLOW_IMPORT_MANUEL } from "@/lib/plan-checks";
import { getDialoguesPlan, getOptionsLocuteur, getPrisesGenerees } from "@/lib/queries-repliques";
import { avanceeUpscale, compterAPrevisualiser, essaiEnFile, essaiVoisin, etatPlan, LIBELLE_ETAT_PLAN, libelleEssai, planSuivant, texteConsigne, trierEssais } from "@/lib/fiche-plan";
import { ImporterVideoForm } from "@/components/plan/ImporterVideoForm";
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
import { ActionsRendu } from "@/components/plan/ActionsRendu";
import { BarreFiche } from "@/components/plan/BarreFiche";
import { PelliculePlans, type CadrePlan } from "@/components/plan/PelliculePlans";
import { PlateauEssais, type EssaiCarte } from "@/components/plan/PlateauEssais";
import { IntentionPlan } from "@/components/plan/IntentionPlan";
import { OngletsPlan } from "@/components/plan/OngletsPlan";
import { JournalEssais, type LigneJournal } from "@/components/plan/JournalEssais";
import { srcRendu } from "@/components/plan/Vignette";
import { assemblerPrompt } from "@/lib/prompt";
import { choisirComparaison, choisirRendu, detailPerime, estLisible, promptDiffere, raisonNonRetenable, type RenduVue } from "@/lib/rendus";

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

/** La fiche d'un plan, en « table de montage » (2026-10-12, maquette docs/maquettes/fiche-de-plan.html) : en haut l'avancée vers l'upscale,
 * au centre le lecteur et la colonne des essais, dessous l'intention (« Qu'est-ce qu'on change ? »), à droite les onglets (références,
 * prompt, dialogues, réglages, journal) et, collée en bas, la pellicule des plans de l'épisode. Voir docs/FRICTIONS.md, même date. */
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

  const [parametresGlobaux, mastersRegistre, scenesEpisode, dialoguesPlan, optionsLocuteur, pellicule] = await Promise.all([
    getAllParams(),
    getAssetsTree(pid),
    getScenesEpisode(eid),
    getDialoguesPlan(pid, plan.id, eid),
    getOptionsLocuteur(pid),
    getPelliculePlans(eid),
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

  // L'historique se parcourt par l'URL (?rendu=… ?compare=…) : cliquer un essai le charge dans le lecteur, on peut en comparer deux.
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
  const promptCourant = assemblerPrompt(promptSections);
  const baseHref = `/p/${pid}/e/${eid}/plans/${uuid}`;
  const hrefRendus = (rendu: number | null, compare: number | null) => {
    const q = new URLSearchParams();
    if (rendu != null) q.set("rendu", String(rendu));
    if (compare != null) q.set("compare", String(compare));
    const texte = q.toString();
    return texte ? `${baseHref}?${texte}` : baseHref;
  };
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
  const demandeAgent = {
    projectId: pid,
    portee: "plan" as const,
    cible: { uuid },
    profondeur: "courte" as const,
    libelle: `Plan ${String(position).padStart(2, "0")} · ${plan.titre}`,
    episodeId: eid,
    planUuid: uuid,
  };

  // --- l'état du plan et l'avancée de l'épisode -----------------------------------------------------------------------
  const etat = etatPlan({ nbEssais: jobHistory.length, pretUpscaleAt: plan.pretUpscaleAt });
  const avance = avanceeUpscale(pellicule.map((p) => p.etat));
  const nbManquants = compterAPrevisualiser(pellicule.map((p) => ({ statut: p.statutFiche, nbTermines: p.nbTermines, nbEnFile: p.nbEnFile })));
  const lienPlan = (u: string) => `/p/${pid}/e/${eid}/plans/${u}`;
  const cadres: CadrePlan[] = pellicule.map((p) => ({ uuid: p.uuid, position: p.position, titre: p.titre, etat: p.etat, src: srcRendu(p.vignette), href: lienPlan(p.uuid) }));
  const suivant = planSuivant(pellicule, uuid);
  const hrefRealisateur = `/p/${pid}/realisateur/${eid}?plan=${uuid}`;

  // --- les essais : du plus récent (haut de la colonne) au plus ancien ------------------------------------------------
  const essaisTries = trierEssais(jobHistory);
  const lisibles = rendusVus.filter(estLisible);
  const numeroDernierLisible = lisibles.reduce((m, r) => Math.max(m, r.numeroRendu), 0);
  const genreDe = (r: RenduVue) => (r.importe ? "import" : r.activerUpscale ? "final" : "aperçu");
  const autreB = (idA: number) => (comparaison && comparaison.id !== idA ? comparaison.id : null);
  const essais: EssaiCarte[] = essaisTries.map((j) => {
    const r = rendusVus.find((x) => x.id === j.id)!;
    const lisible = estLisible(r);
    const estA = principal?.id === j.id;
    return {
      id: j.id,
      numero: j.numeroRendu,
      statut: j.statut,
      src: lisible ? srcRendu(j.cheminSortie) : null,
      genre: genreDe(r),
      seedCourte: j.seedUtilisee ? j.seedUtilisee.slice(0, 4) : null,
      retenu: etat === "pret" && plan.renduRetenuId === j.id,
      enCours: essaiEnFile(j.statut),
      echoue: j.statut === "echoue",
      estA,
      estB: comparaison?.id === j.id,
      hrefA: hrefRendus(j.id, autreB(j.id)),
      hrefB: lisible && !estA && principal ? hrefRendus(principal.id, comparaison?.id === j.id ? null : j.id) : null,
    };
  });
  const voisinRecent = principal ? essaiVoisin(lisibles, principal.id, "plus-recent") : null;
  const voisinAncien = principal ? essaiVoisin(lisibles, principal.id, "plus-ancien") : null;
  const autreLisible = principal ? trierEssais(lisibles).find((r) => r.id !== principal.id) : undefined;
  const hrefComparer = !comparaison && principal && autreLisible ? hrefRendus(principal.id, autreLisible.id) : null;
  const hrefQuitter = comparaison && principal ? hrefRendus(principal.id, null) : null;
  const principalJob = principal ? jobHistory.find((j) => j.id === principal.id) : undefined;
  const retenable = principal ? raisonNonRetenable(principal) == null : false;
  const enFile = jobHistory.filter((j) => essaiEnFile(j.statut)).sort((a, b) => b.numeroRendu - a.numeroRendu)[0];
  const enCours = enFile
    ? {
        numero: enFile.numeroRendu,
        etape: enFile.statut === "en_attente" ? "en file" : (enFile.etapeLibelle ?? null),
        pourcent: enFile.progressionValeur != null && enFile.progressionMax ? Math.round((100 * enFile.progressionValeur) / enFile.progressionMax) : null,
      }
    : null;

  const journal: LigneJournal[] = essaisTries.map((j) => {
    const r = rendusVus.find((x) => x.id === j.id)!;
    return {
      id: j.id,
      numero: j.numeroRendu,
      depuisNumero: j.depuisNumeroRendu,
      consigne: texteConsigne({ consigne: j.consigne, importe: r.importe }),
      notes: j.alertesIteration ?? [],
      quand: (j.finishedAt ?? j.createdAt).toLocaleString("fr-FR"),
      src: estLisible(r) ? srcRendu(j.cheminSortie) : null,
      genre: genreDe(r),
      retenu: etat === "pret" && plan.renduRetenuId === j.id,
      enFile: essaiEnFile(j.statut),
      echoue: j.statut === "echoue",
      hrefVoir: hrefRendus(j.id, null),
    };
  });

  const perime = (await getPlansPerimes({ planIds: [plan.id] })).get(plan.id);

  // Contrôles repliés dans la pastille du titre : références, structure, dialogues.
  const alertes: AlerteControle[] = [
    ...(perime
      ? [
          {
            cle: "refs-perimees",
            niveau: "warn" as const,
            titre: "Rendu périmé",
            detail: detailPerime(perime),
            ancre: perime.codes.length > 0 ? "fp-refs" : perime.raisons.includes("prompt") ? "fp-prompt" : "fp-console",
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
        ancre: "fp-prompt",
      }),
    ),
    ...(controle.peutGenerer
      ? []
      : [
          {
            cle: "dialogues",
            niveau: "warn" as const,
            titre: "Dialogues à corriger",
            detail: resumerProblemesDialogues(controle.problemes.filter(estProblemeBloquant)),
            ancre: "fp-dialogues",
          },
        ]),
    // Ce qui n'empêche pas de générer : une réplique absente du prompt, et l'audio (sans prise, la voix est estimée par le modèle).
    ...(controle.problemes.some((p) => !estProblemeBloquant(p))
      ? [
          {
            cle: "dialogues-a-verifier",
            niveau: "info" as const,
            titre: controle.problemes.some((p) => p.type === "sans_audio" && !p.master) ? "Voix estimée" : "Dialogues à vérifier",
            detail: `${resumerProblemesDialogues(controle.problemes.filter((p) => !estProblemeBloquant(p)))}${phraseVoix(controle.problemes) ? ` : ${phraseVoix(controle.problemes)}` : ""}.`,
            ancre: "fp-dialogues",
          },
        ]
      : []),
    ...refsNonCitees.map(
      (l): AlerteControle => ({
        cle: `noncite-${l}`,
        niveau: "info",
        titre: "Référence déclarée mais jamais citée",
        detail: `<${l.replace(":", " ")}> n'apparaît dans aucune section du prompt.`,
        ancre: "fp-refs",
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

  const titre = (
    <header className="tm-titre">
      {scene ? <span className="tm-scn">{scene.titre}</span> : null}
      <span className="tm-no num">{String(position).padStart(2, "0")}</span>
      <h1>{plan.titre}</h1>
      <span className={`tm-pastille is-${etat}`}>
        <i />
        {LIBELLE_ETAT_PLAN[etat]}
      </span>
      {!estBrouillon ? <ControlesEntete alertes={alertes} /> : null}
      <details className="fp-plus tm-plus">
        <summary className="btn btn-ghost btn-sm" aria-label="Autres actions">
          ⋯
        </summary>
        <div className="fp-plus-pop">
          {!estBrouillon ? <ImporterVideoForm planId={plan.id} /> : null}
          <SupprimerPlanButton planId={plan.id} position={position} plansHref={plansHref} />
        </div>
      </details>
      {plan.numerosSource && plan.numerosSource.length > 1 ? <span className="tm-sous">Fusion des plans {plan.numerosSource.join(" + ")}</span> : plan.acte ? <span className="tm-sous">{plan.acte}</span> : null}
    </header>
  );

  return (
    <div className="tm">
      <SuiviRendus planUuid={plan.uuid} jobs={jobHistory.map((j) => ({ id: j.id, statut: j.statut }))} />
      <BarreFiche episodeId={eid} prets={avance.prets} total={avance.total} nbManquants={nbManquants} hrefRealisateur={hrefRealisateur} />

      {estBrouillon ? (
        <div className="tm-brouillon">
          {titre}
          <p className="tiny-note">Cette fiche n&rsquo;est pas encore développée : complète le scénario du plan, puis développe-le en fiche de plan.</p>
          <PlanScenarioPanel planId={plan.id} brouillon initial={scenarioInitial} />
        </div>
      ) : (
        <BrouillonProvider planId={plan.id} serveur={serveur} prochainRendu={jobHistory.reduce((m, j) => Math.max(m, j.numeroRendu), 0) + 1}>
          <div className="tm-scene">
            <main className="tm-centre">
              {titre}
              <PlateauEssais
                essais={essais}
                principal={
                  principal && principalJob
                    ? {
                        libelle: libelleEssai(principal.numeroRendu, principalJob.depuisNumeroRendu),
                        consigne: texteConsigne({ consigne: principalJob.consigne, importe: principal.importe }),
                        notes: principalJob.alertesIteration ?? [],
                        src: srcRendu(principal.cheminSortie),
                        numero: principal.numeroRendu,
                      }
                    : null
                }
                comparaison={comparaison?.cheminSortie ? { src: srcRendu(comparaison.cheminSortie)!, numero: comparaison.numeroRendu } : null}
                hrefPlusRecent={voisinRecent ? hrefRendus(voisinRecent.id, autreB(voisinRecent.id)) : null}
                hrefPlusAncien={voisinAncien ? hrefRendus(voisinAncien.id, autreB(voisinAncien.id)) : null}
                hrefComparer={hrefComparer}
                hrefQuitter={hrefQuitter}
                enCours={enCours}
              >
                {principal && principalJob && (retenable || principalJob.promptUtilise || principalJob.descriptionUtilisee) ? (
                  <div className="tm-sous-legende">
                    {retenable ? (
                      <details className="tm-details">
                        <summary className="tm-lien">Actions sur l&rsquo;essai n°{principal.numeroRendu}</summary>
                        <ActionsRendu
                          planId={plan.id}
                          jobId={principalJob.id}
                          promptChange={promptDiffere(promptCourant, principalJob.promptUtilise)}
                          aUnPrompt={!!principalJob.promptUtilise}
                          estSeedDuPlan={!!principalJob.seedUtilisee && principalJob.seedUtilisee === plan.seed}
                        />
                      </details>
                    ) : null}
                    {principalJob.descriptionUtilisee && principalJob.descriptionUtilisee.trim() !== (plan.description ?? "").trim() ? (
                      <details className="tm-details">
                        <summary className="tm-lien">Description du plan pour cet essai (différente de l&rsquo;actuelle)</summary>
                        <pre className="tiny-note" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                          {principalJob.descriptionUtilisee}
                        </pre>
                      </details>
                    ) : null}
                    {principalJob.promptUtilise ? (
                      <details className="tm-details">
                        <summary className="tm-lien">Prompt envoyé pour cet essai</summary>
                        <pre className="tiny-note" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                          {principalJob.promptUtilise}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </PlateauEssais>

              <IntentionPlan
                projectId={pid}
                planId={plan.id}
                planUuid={plan.uuid}
                base={principal ? { id: principal.id, numero: principal.numeroRendu, estDernier: principal.numeroRendu === numeroDernierLisible } : null}
                etat={etat}
                enCours={!!enFile}
                nbEssais={jobHistory.length}
                hrefSuivant={suivant ? lienPlan(suivant.uuid) : null}
                hrefApresLancement={baseHref}
              />
            </main>

            <OngletsPlan
              compteurs={{ refs: refsVue.length, dialogues: liaisons.length, journal: jobHistory.length }}
              panneaux={{
                refs: <RefsPanel planId={plan.id} refs={refsVue} masters={mastersPicker} />,
                prompt: <PromptBloc planId={plan.id} declarees={declarees} demandeAgent={demandeAgent} aUneFiche={aUneFiche} />,
                dialogues: (
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
                ),
                reglages: (
                  <>
                    <ConsoleRendu timecodeMusique={plan.timecodeMusique} />
                    <PlanScenarioPanel planId={plan.id} brouillon={false} initial={scenarioInitial} />
                  </>
                ),
                journal: <JournalEssais planId={plan.id} lignes={journal} />,
              }}
            />
          </div>
        </BrouillonProvider>
      )}

      <PelliculePlans plans={cadres} courant={uuid} />
    </div>
  );
}
