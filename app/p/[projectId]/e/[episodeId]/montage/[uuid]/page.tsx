import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { demandes, planPromptVersions } from "@/db/schema";
import { getPlansPerimes } from "@/lib/clips/stale-clips";
import { getAssetsRegistre, getPlanDetail, getProject, getScenesEpisode, type AssetRegistre } from "@/lib/queries";
import { getPelliculePlans } from "@/lib/clips/queries-clip-sheet";
import { infosMedia } from "@/lib/assets/assetMedia";
import { controlerStructure, DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, verifierCoherenceRefs, WORKFLOW_IMPORT_MANUEL } from "@/lib/clips/clip-checks";
import { demosMiseEnScene } from "@/lib/media";
import { getVoixDuPlan } from "@/lib/voice/queries-voice-clip";
import { essaiEnFile, essaiVoisin, etatPlan, LIBELLE_ETAT_PLAN, libelleEssai, planSuivant, texteConsigne, trierEssais } from "@/lib/clips/clip-sheet";
import { ReferencesCases, type RefVue } from "@/components/clip/ReferencesCheckboxes";
import type { NoeudPicker } from "@/components/clip/AssetPickerModal";
import { SuiviRendus } from "@/components/clip/RendersTracking";
import { PlanScenarioPanel } from "@/components/clip/ClipScreenplayPanel";
import { SupprimerPlanButton } from "@/components/clip/DeleteClipButton";
import { BrouillonProvider } from "@/components/clip/ClipDraft";
import { PromptBloc, type VersionPrompt } from "@/components/clip/PromptBlock";
import { ControlesEntete, type AlerteControle } from "@/components/clip/ChecksHeader";
import { PelliculePlans, type CadrePlan } from "@/components/clip/ClipsFilmstrip";
import { PlateauEssais, type EssaiCarte } from "@/components/clip/AttemptsBoard";
import { IntentionPlan } from "@/components/clip/ClipIntention";
import { iterationDuPlan, iterationEnAttenteDuPlan } from "@/lib/tasks/requests-db";
import { CartePrompt } from "@/components/clip/PromptCard";
import { TiroirPlan } from "@/components/clip/ClipDrawer";
import { srcRendu } from "@/components/clip/Thumbnail";
import { assemblerPrompt } from "@/lib/clips/prompt";
import { liaisonOuDefaut } from "@/lib/clips/clip-link";
import { libelleAsset } from "@/lib/assets/assetCode";
import { statutAsset } from "@/lib/assets/asset-state";
import { etatRaccord, raccordSansPlace } from "@/lib/clips/clip-continuity";
import { raccordActuel } from "@/lib/clips/queries-continuity";
import { choisirComparaison, choisirRendu, detailPerime, estLisible, estPerime, promptDiffere, type RenduVue } from "@/lib/renders/renders";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function versNoeudPicker(n: AssetRegistre): NoeudPicker {
  const { kind, etat, src } = infosMedia(n.type, n.fichier);
  return {
    id: n.id,
    code: n.code,
    libelle: libelleAsset(n),
    type: n.type,
    statut: n.statut,
    description: n.description,
    kind,
    etat,
    src,
  };
}

/** The clip sheet, as a « table de montage » (2026-10-12, mockup docs/maquettes/fiche-de-plan.html): at the top the progress towards the upscale,
 * in the centre the player and the attempts column, below the intent (« Qu'est-ce qu'on change ? »), on the right the tabs (references,
 * prompt, dialogue, settings, log) and, pinned at the bottom, the film strip of the episode's clips. See docs/FRICTIONS.md, same date. */
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

  const [assetsRegistre, scenesEpisode, audioRefs, pellicule, projet] = await Promise.all([
    getAssetsRegistre(pid),
    getScenesEpisode(eid),
    getVoixDuPlan(plan.id),
    getPelliculePlans(eid),
    getProject(pid),
  ]);

  // « Générer la fiche » already launched on this clip: the button follows it instead of offering to launch another.
  const [ficheEnCours] = await db
    .select({ id: demandes.id })
    .from(demandes)
    .where(and(eq(demandes.type, "fiche-plan"), eq(demandes.cibleType, "plan"), eq(demandes.cibleId, plan.id), eq(demandes.statut, "en_cours")));

  const sectionsPourControle = promptSections.map((s) => ({
    section: s.section,
    contenu: s.contenu,
  }));

  // Each linked line's audio IS the clip's <Audio N> ref: it counts as declared
  // without being in plan_refs, and need not be cited (validated sheets and the
  // sheet contract never cite voices).
  const { labelsOrphelins, refsNonCitees } = verifierCoherenceRefs(
    sectionsPourControle,
    refs.map((r) => ({ type: r.type, slot: r.slot })),
    audioRefs,
  );
  const structure = controlerStructure(sectionsPourControle, plan.dureeGenerationSecondes);

  // History is browsed through the URL (?rendu=… ?compare=…): clicking an attempt loads it in the player; two of them can be compared.
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
  const baseHref = `/p/${pid}/e/${eid}/montage/${uuid}`;
  const hrefRendus = (rendu: number | null, compare: number | null) => {
    const q = new URLSearchParams();
    if (rendu != null) q.set("rendu", String(rendu));
    if (compare != null) q.set("compare", String(compare));
    const texte = q.toString();
    return texte ? `${baseHref}?${texte}` : baseHref;
  };
  const aUneFiche = promptSections.some((s) => s.contenu.trim());

  // Continuity (match cut) (lib/clips/clip-continuity.ts): the previous clip's attempt whose image would be taken now, compared with the one the displayed attempt was started from.
  const raccordMaintenant = await raccordActuel(plan);
  // A clip in « suite » starts again from the previous clip's render: if that one is stale or has an iteration queued, a render made today will be provisional.
  const precedentChange = raccordMaintenant
    ? (await getPlansPerimes({ planIds: [raccordMaintenant.precedent.id] })).has(raccordMaintenant.precedent.id) || (await iterationEnAttenteDuPlan(raccordMaintenant.precedent.id)) != null
    : false;
  // Visual references the worker would count (images and videos that have their file): at the cap, a « suite » clip goes WITHOUT continuity (match cut).
  const refsVisuelles = refs.filter((r) => (r.type === "picture" || r.type === "video") && r.asset != null && r.asset.fichier).length;

  const scenarioInitial = {
    titre: plan.titre,
    description: plan.description ?? "",
    dureeSecondes: plan.dureeGenerationSecondes >= DUREE_GENERATION_MIN && plan.dureeGenerationSecondes <= DUREE_GENERATION_MAX ? plan.dureeGenerationSecondes : null,
    liaison: liaisonOuDefaut(plan.liaison),
    creativite: plan.creativite ?? "",
    styleCamera: plan.styleCamera ?? "",
  };

  // The staging demo videos (style choice window): read from disk, server side.
  const demos = demosMiseEnScene();
  const assetsPicker = assetsRegistre.map(versNoeudPicker);
  const refsVue: RefVue[] = refs.map((r) => ({
    id: r.id,
    type: r.type,
    slot: r.slot,
    asset: r.asset
      ? {
          id: r.asset.id,
          code: r.asset.code,
          libelle: libelleAsset(r.asset),
          statut: statutAsset(r.asset),
          ...infosMedia(r.asset.type, r.asset.fichier),
        }
      : null,
  }));

  const scene = scenesEpisode.find((sc) => sc.id === plan.sceneId);
  // Creativity and staging style for Open H3 IR: the clip's, otherwise its scene's, otherwise the project's (lib/h3ir/settings.ts).
  const reglagesProjet = { creativite: projet?.creativite ?? null, styleCamera: projet?.styleCamera ?? null };
  const reglagesScene = scene ? { creativite: scene.creativite, styleCamera: scene.styleCamera } : null;
  // A clip is a draft as long as it has neither a written sheet nor an attempt: a status still "brouillon" on a clip that already has a prompt or renders does not hide them.
  const estBrouillon = plan.statut === "brouillon" && !aUneFiche && jobHistory.length === 0;
  const plansHref = `/p/${pid}/e/${eid}/montage`;
  // --- the clip's state and the episode's progress -----------------------------------------------------------------------
  const etat = etatPlan({ nbEssais: jobHistory.length, pretUpscaleAt: plan.pretUpscaleAt });
  const lienPlan = (u: string) => `/p/${pid}/e/${eid}/montage/${u}`;
  const cadres: CadrePlan[] = pellicule.map((p) => ({ uuid: p.uuid, position: p.position, titre: p.titre, etat: p.etat, src: srcRendu(p.vignette), href: lienPlan(p.uuid) }));
  const suivant = planSuivant(pellicule, uuid);

  // --- attempts: from the most recent (top of the column) to the oldest ------------------------------------------------
  const essaisTries = trierEssais(jobHistory);
  const lisibles = rendusVus.filter(estLisible);
  const numeroDernierLisible = lisibles.reduce((m, r) => Math.max(m, r.numeroRendu), 0);
  const genreDe = (r: RenduVue) => (r.importe ? "import" : r.activerUpscale ? "final" : "aperçu");
  const enFile = jobHistory.filter((j) => essaiEnFile(j.statut)).sort((a, b) => b.numeroRendu - a.numeroRendu)[0];
  // The attempt IN PROGRESS has its own view in the player (the « en cours » veil and its progress): when it is picked in the column (?rendu=<its id>), or by default
  // (no attempt requested) while an attempt is running. Another requested attempt is watched normally, without the veil (user feedback, batch E of 2026-11-08).
  const idDemande = Number(renduParam) || null;
  const jobDemande = idDemande != null ? jobHistory.find((j) => j.id === idDemande) : undefined;
  const vueEnCours = jobDemande && essaiEnFile(jobDemande.statut) ? jobDemande : idDemande == null ? enFile : undefined;
  const autreB = (idA: number) => (comparaison && comparaison.id !== idA ? comparaison.id : null);
  const essais: EssaiCarte[] = essaisTries.map((j) => {
    const r = rendusVus.find((x) => x.id === j.id)!;
    const lisible = estLisible(r);
    const estA = vueEnCours ? vueEnCours.id === j.id : principal?.id === j.id;
    const tourne = essaiEnFile(j.statut);
    return {
      id: j.id,
      numero: j.numeroRendu,
      statut: j.statut,
      src: lisible ? srcRendu(j.cheminSortie) : null,
      genre: genreDe(r),
      seedCourte: j.seedUtilisee ? j.seedUtilisee.slice(0, 4) : null,
      retenu: etat === "pret" && plan.renduRetenuId === j.id,
      enCours: tourne,
      echoue: j.statut === "echoue",
      estA,
      estB: !vueEnCours && comparaison?.id === j.id,
      hrefA: tourne ? hrefRendus(j.id, null) : hrefRendus(j.id, autreB(j.id)),
      hrefB: lisible && !estA && principal && !vueEnCours ? hrefRendus(principal.id, comparaison?.id === j.id ? null : j.id) : null,
      consigne: texteConsigne({ consigne: j.consigne, importe: r.importe }),
    };
  });
  const voisinRecent = principal ? essaiVoisin(lisibles, principal.id, "plus-recent") : null;
  const voisinAncien = principal ? essaiVoisin(lisibles, principal.id, "plus-ancien") : null;
  const autreLisible = principal ? trierEssais(lisibles).find((r) => r.id !== principal.id) : undefined;
  const hrefComparer = !comparaison && principal && autreLisible ? hrefRendus(principal.id, autreLisible.id) : null;
  const hrefQuitter = comparaison && principal ? hrefRendus(principal.id, null) : null;
  const principalJob = principal ? jobHistory.find((j) => j.id === principal.id) : undefined;
  // What the server knows about the attempt in progress; the board then reads its progress LIVE from the tasks (useTaches), without reloading the page.
  const suiviEnCours = vueEnCours ?? enFile;
  // The clip's iteration (in progress or queued): its instruction is visible from the start, before the attempt even exists.
  const iteration = await iterationDuPlan(plan.id);
  const enCours = suiviEnCours
    ? {
        jobId: suiviEnCours.id,
        numero: suiviEnCours.numeroRendu,
        statut: suiviEnCours.statut,
        etape: suiviEnCours.statut === "en_attente" ? "en file" : (suiviEnCours.etapeLibelle ?? null),
        pourcent: suiviEnCours.progressionValeur != null && suiviEnCours.progressionMax ? Math.round((100 * suiviEnCours.progressionValeur) / suiviEnCours.progressionMax) : null,
        affiche: vueEnCours != null,
        href: hrefRendus(suiviEnCours.id, null),
        consigne: suiviEnCours.consigne?.trim() || (iteration?.statut === "en_cours" ? iteration.consigne : null),
      }
    : null;
  // Arrows ▲ ▼: the attempt in progress is placed above the most recent of the readable attempts.
  const plusRecentLisible = trierEssais(lisibles)[0];
  const hrefPlusRecent = vueEnCours
    ? null
    : voisinRecent
      ? hrefRendus(voisinRecent.id, autreB(voisinRecent.id))
      : enFile && principal && principal.id === plusRecentLisible?.id
        ? hrefRendus(enFile.id, null)
        : null;
  const hrefPlusAncien = vueEnCours ? (plusRecentLisible ? hrefRendus(plusRecentLisible.id, null) : null) : voisinAncien ? hrefRendus(voisinAncien.id, autreB(voisinAncien.id)) : null;

  const versionsPrompt = await db.select().from(planPromptVersions).where(eq(planPromptVersions.planId, plan.id)).orderBy(desc(planPromptVersions.id)).limit(30);
  const historiquePrompt: VersionPrompt[] = versionsPrompt.map((v) => ({ id: v.id, texte: v.texte, source: v.source, quand: v.createdAt.toLocaleString("fr-FR") }));

  // The excerpt of the prompt card: the sheet's summary, failing that the detailed description.
  const sectionTexte = (nom: string) => promptSections.find((x) => x.section === nom)?.contenu.trim() ?? "";
  const extraitPrompt = (sectionTexte("summary") || sectionTexte("detailed_description")).slice(0, 320);

  const perime = (await getPlansPerimes({ planIds: [plan.id] })).get(plan.id);
  // Stale clip: « Relancer » redoes the attempt with the sheet, the references and today's continuity (match cut), same seed (so nothing else changes apart from what has moved), in the
  // mode of its last completed render (a final stays final).
  const dernierTermine = jobHistory.filter((j) => j.statut === "termine").sort((a, b) => b.numeroRendu - a.numeroRendu)[0];
  // Only the clip's text has changed: relaunching would give the same render (the prompt is not rewritten). We offer to iterate from the attempt, which retouches its prompt.
  const seulementTexte = !!perime && perime.codes.length === 0 && perime.raisons.length === 1 && perime.raisons[0] === "intention";
  const relancePerime =
    perime && estPerime(perime)
      ? seulementTexte
        ? {
            libelle: "Itérer à partir de cet essai",
            detail: "Le texte du plan a changé mais pas son prompt : relancer redonnerait le même rendu. Un clic reporte la différence de texte dans le prompt de l'essai, sans rien changer d'autre.",
            mode: "iterer" as const,
          }
        : {
            libelle: perime.raisons.includes("raccord") ? "Raccrocher au plan précédent" : "Relancer (plan périmé)",
            detail: `${detailPerime(perime)} Même seed, ${dernierTermine?.activerUpscale ? "rendu final" : "prévisualisation"}. Le prompt n'est pas réécrit.`,
            mode: (dernierTermine?.activerUpscale ? "final" : "previsualiser") as "final" | "previsualiser",
          }
      : null;

  // Checks folded into the title badge: references, structure, dialogue.
  const alertes: AlerteControle[] = [
    ...(perime
      ? [
          {
            cle: "refs-perimees",
            niveau: "warn" as const,
            titre: "Rendu périmé",
            detail: detailPerime(perime),
            ancre: perime.codes.length > 0 ? "fp-refs" : "fp-prompt",
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
    // A reference whose asset has no image (yet): the render would go without it (an asset created by a correction has no image straight away).
    ...refsVue
      .filter((r) => r.type === "picture" && r.asset != null && r.asset.etat !== "ok")
      .map(
        (r): AlerteControle => ({
          cle: `sans-image-${r.id}`,
          niveau: "warn",
          titre: "Référence sans image",
          detail: `<Picture ${r.slot}> (${r.asset!.code}) n'a pas encore d'image : le rendu partirait sans elle. Génère-la depuis le registre avant de lancer.`,
          ancre: "fp-refs",
        }),
      ),
    // A clip that follows the previous one receives its last image as a reference: with the cap reached, the generation goes without continuity (match cut).
    ...(raccordMaintenant?.source && raccordSansPlace(refsVisuelles)
      ? [
          {
            cle: "raccord-sans-place",
            niveau: "warn" as const,
            titre: "Pas de place pour le raccord",
            detail: `Ce plan enchaîne sur « ${raccordMaintenant.precedent.titre} » mais ses ${refsVisuelles} références occupent tous les emplacements : il sera généré SANS la dernière image du plan précédent. Retire une référence (décris-la dans le prompt) pour la libérer.`,
            ancre: "fp-refs",
          },
        ]
      : []),
    ...structure.map(
      (p, i): AlerteControle => ({
        cle: `struct-${p.type}-${i}`,
        niveau: "warn",
        titre: p.type === "duree_invalide" ? "Durée de rendu" : "Découpage en shots",
        detail: p.message,
        ancre: "fp-prompt",
      }),
    ),
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
      <span className="tm-plus">
        <SupprimerPlanButton planId={plan.id} position={position} plansHref={plansHref} />
      </span>
      {plan.numerosSource && plan.numerosSource.length > 1 ? <span className="tm-sous">Fusion des plans {plan.numerosSource.join(" + ")}</span> : null}
    </header>
  );

  return (
    <div className="tm">
      <SuiviRendus planUuid={plan.uuid} jobs={jobHistory.map((j) => ({ id: j.id, statut: j.statut }))} />

      {estBrouillon ? (
        <div className="tm-brouillon">
          {titre}
          <p className="tiny-note">Cette fiche n&rsquo;est pas encore développée : complète le scénario du plan, puis développe-le : l&rsquo;agent écrit la fiche (prompt vidéo, références) en arrière-plan.</p>
          <PlanScenarioPanel planId={plan.id} projectId={pid} planUuid={plan.uuid} brouillon initial={scenarioInitial} demandeEnCours={ficheEnCours?.id ?? null} reglagesProjet={reglagesProjet} reglagesScene={reglagesScene} dureeGeneration={plan.dureeGenerationSecondes} premierPlan={position === 1} demos={demos} />
        </div>
      ) : (
        <BrouillonProvider planId={plan.id} serveur={serveur} prochainRendu={jobHistory.reduce((m, j) => Math.max(m, j.numeroRendu), 0) + 1}>
          <div className="tm-scene">
            <main className="tm-centre">
              {titre}
              <PlanScenarioPanel
                planId={plan.id}
                projectId={pid}
                planUuid={plan.uuid}
                brouillon={false}
                initial={scenarioInitial}
                dureeGeneration={plan.dureeGenerationSecondes}
                musique={plan.timecodeMusique}
                reglagesProjet={reglagesProjet}
                reglagesScene={reglagesScene}
                premierPlan={position === 1}
                demos={demos}
              />
              <TiroirPlan
                panneaux={{
                  prompt: (
                    <PromptBloc
                      planId={plan.id}
                      promptComplet={promptCourant}
                      historique={historiquePrompt}
                      peutLancer={etat !== "pret" && !enFile}
                      essai={
                        principal && principalJob
                          ? {
                              numero: principal.numeroRendu,
                              prompt: principalJob.promptUtilise,
                              promptChange: promptDiffere(promptCourant, principalJob.promptUtilise),
                              description:
                                principalJob.descriptionUtilisee && principalJob.descriptionUtilisee.trim() !== (plan.description ?? "").trim() ? principalJob.descriptionUtilisee : null,
                            }
                          : null
                      }
                    />
                  ),
                }}
              />
              <div className="tm-poste">
                <div className="tm-poste-gauche">
              <PlateauEssais
                planId={plan.id}
                essais={essais}
                principal={
                  principal && principalJob && !vueEnCours
                    ? {
                        id: principal.id,
                        enFile: essaiEnFile(principalJob.statut),
                        libelle: libelleEssai(principal.numeroRendu, principalJob.depuisNumeroRendu),
                        consigne: texteConsigne({ consigne: principalJob.consigne, importe: principal.importe }),
                        notes: principalJob.alertesIteration ?? [],
                        src: srcRendu(principal.cheminSortie),
                        numero: principal.numeroRendu,
                      }
                    : null
                }
                comparaison={comparaison?.cheminSortie && !vueEnCours ? { src: srcRendu(comparaison.cheminSortie)!, numero: comparaison.numeroRendu } : null}
                hrefPlusRecent={hrefPlusRecent}
                hrefPlusAncien={hrefPlusAncien}
                hrefComparer={vueEnCours ? null : hrefComparer}
                hrefQuitter={vueEnCours ? null : hrefQuitter}
                enCours={enCours}
                peutVarier={etat !== "pret" && !enFile}
                relancePerime={relancePerime}
              >
                {principal && principalJob && !vueEnCours ? (
                  (() => {
                    const r = etatRaccord({ liaison: plan.liaison, utilise: principalJob.raccordJobId, actuel: raccordMaintenant?.source ?? null, precedentTitre: raccordMaintenant?.precedent.titre ?? null, refsVisuelles });
                    return r ? (
                      <p className="tiny-note tm-raccord" style={r.perime ? { color: "var(--gold, #c9a227)" } : undefined}>
                        {r.texte}
                      </p>
                    ) : null;
                  })()
                ) : null}
              </PlateauEssais>
              {raccordMaintenant && precedentChange ? (
                <p className="tiny-note tm-raccord" style={{ color: "var(--gold, #c9a227)" }}>
                  « {raccordMaintenant.precedent.titre} », le plan qui précède, est périmé ou a une itération en file : un rendu de ce plan partirait de son rendu actuel et serait
                  provisoire. Il sera marqué « raccord à refaire » dès que le précédent aura un nouveau rendu.
                </p>
              ) : null}
                </div>
                <aside className="tm-poste-droite" aria-label="Références">
                  <ReferencesCases planId={plan.id} projectId={pid} refs={refsVue} assets={assetsPicker} />
                  <CartePrompt extrait={extraitPrompt} nbMots={promptCourant.trim() ? promptCourant.trim().split(/\s+/).length : 0} nbVersions={historiquePrompt.length} />
                </aside>
              </div>

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
                enAttente={iteration?.statut === "en_attente" ? { demandeId: iteration.demandeId, consigne: iteration.consigne } : null}
                iterationEnCours={iteration?.statut === "en_cours" ? { consigne: iteration.consigne, etape: iteration.etape } : null}
              />
            </main>

          </div>
        </BrouillonProvider>
      )}

      <PelliculePlans plans={cadres} courant={uuid} />
    </div>
  );
}
