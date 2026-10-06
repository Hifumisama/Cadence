"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { deposerAudioTest, deposerVideoTest, enregistrerTest, lancerTestAudio, lancerTestVideo, retirerAudioTest } from "@/app/voix/actions";
import type { GenerationVivante } from "@/components/assets/GenerationDialog";
import { useTaches } from "@/components/taches/TachesProvider";
import { METHODE_TEST_AUDIO, METHODE_TEST_VIDEO } from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { cleImage, estActive, pageEstPerimee, tachesDeAsset } from "@/lib/taches";
import { promptTestVoix } from "@/lib/voix";
import { CandidatsTest } from "./CandidatsTest";
import { CopierBouton } from "./CopierBouton";
import { ZoneDepot } from "./ZoneDepot";

type Option = { id: number; code: string; description: string | null };

/** Étape 3 — test : la voix sur un visage. Un décor (optionnel), un personnage (optionnel), le texte à tester (prérempli avec le
 * texte de référence de la voix) ; le prompt vidéo dédié se compose tout seul. Deux générations, dans la même file que les
 * images : l'AUDIO de test (la voix de référence clonée dit le texte), puis la VIDÉO de test — une prévisualisation rapide pour
 * juger, puis le rendu final. Chaque essai est un candidat à écouter ou à regarder, qu'on utilise ou qu'on jette. Un audio ou
 * un rendu fait ailleurs se dépose toujours à la main. */
export function EtapeTest({
  assetId,
  decors,
  personnages,
  initial,
  refText,
  referenceSrc,
  testAudioSrc,
  testAudioNom,
  testVideoSrc,
  testVideoNom,
  generations,
  generationInitiale,
  simule,
}: {
  assetId: number;
  decors: Option[];
  personnages: Option[];
  initial: { decorId: number | null; personnageId: number | null; texte: string };
  /** Le texte de référence de la voix : proposé tant qu'aucun texte de test n'est écrit. */
  refText: string;
  referenceSrc: string | null;
  testAudioSrc: string | null;
  testAudioNom: string | null;
  testVideoSrc: string | null;
  testVideoNom: string | null;
  /** TOUTES les générations de la voix (référence, audio de test, vidéo de test) : la page sait ainsi quand elle est en retard. */
  generations: GenerationVue[];
  generationInitiale: string | null;
  simule: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { taches, pret, marquerVuLocal, annuler } = useTaches();
  const [decorId, setDecorId] = useState<number | null>(initial.decorId);
  const [personnageId, setPersonnageId] = useState<number | null>(initial.personnageId);
  const [texte, setTexte] = useState(initial.texte);
  const [pending, startTransition] = useTransition();
  const [lancement, startLancement] = useTransition();
  const [etat, setEtat] = useState<"idle" | "ok" | "err">("idle");
  const [erreur, setErreur] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const modifie = decorId !== initial.decorId || personnageId !== initial.personnageId || texte.trim() !== initial.texte.trim();

  const decor = decors.find((d) => d.id === decorId) ?? null;
  const perso = personnages.find((p) => p.id === personnageId) ?? null;
  const audioSrc = testAudioSrc ?? referenceSrc;
  const prompt = promptTestVoix({ texte, personnage: perso, decor, avecAudio: audioSrc != null });
  const texteDeReference = refText.trim() !== "" && texte.trim() === refText.trim();

  // Arrivée depuis l'indicateur du bandeau (`?generation=`) : on marque l'essai vu et on retire le paramètre, une seule fois.
  const traite = useRef(false);
  useEffect(() => {
    if (traite.current || !generationInitiale) return;
    const cible = generations.find((g) => g.uuid === generationInitiale);
    if (!cible) return;
    traite.current = true;
    marquerVuLocal([cleImage(cible.uuid)]);
    router.replace(`${pathname}?etape=test`, { scroll: false });
  }, [generationInitiale, generations, marquerVuLocal, router, pathname]);

  // La page ne se recharge que lorsqu'une génération de CETTE voix change d'état (démarre, finit, échoue, vient d'un autre onglet).
  const tachesAsset = useMemo(() => tachesDeAsset(taches, assetId), [taches, assetId]);
  const dernierRefresh = useRef(0);
  useEffect(() => {
    if (!pret || !pageEstPerimee(tachesAsset, generations)) return;
    if (Date.now() - dernierRefresh.current < 2000) return;
    dernierRefresh.current = Date.now();
    router.refresh();
  }, [pret, tachesAsset, generations, router]);

  const vivantes = useMemo<GenerationVivante[]>(
    () =>
      generations.map((g) => {
        const live = tachesAsset.find((x) => x.cle === cleImage(g.uuid));
        if (!live || !estActive(live)) return { ...g, position: null, derriere: null };
        return {
          ...g,
          statut: live.statut,
          progression: live.progression ?? g.progression,
          position: live.positionFile,
          derriere: live.derriere,
          annulationDemandee: live.annulationDemandee,
        };
      }),
    [generations, tachesAsset],
  );
  const essaisAudio = vivantes.filter((g) => g.methode === METHODE_TEST_AUDIO);
  const essaisVideo = vivantes.filter((g) => g.methode === METHODE_TEST_VIDEO);
  const videoEnCours = essaisVideo.some(estActif);

  const enregistrer = () =>
    startTransition(async () => {
      try {
        const r = await enregistrerTest(assetId, { decorId, personnageId, texte });
        if (r.ok) {
          setErreur(null);
          setEtat("ok");
          setTimeout(() => setEtat("idle"), 1500);
        } else {
          setErreur(r.erreur);
          setEtat("err");
        }
      } catch {
        setErreur(null);
        setEtat("err");
      }
    });

  const lancerAudio = () =>
    startLancement(async () => {
      const r = await lancerTestAudio(assetId, { decorId, personnageId, texte });
      setRetour(r.ok ? { ok: true, texte: r.position > 1 ? `Audio ajouté à la file, position ${r.position}.` : "Audio lancé." } : { ok: false, texte: r.erreur });
    });

  const lancerVideo = (upscale: boolean) =>
    startLancement(async () => {
      const r = await lancerTestVideo(assetId, { decorId, personnageId, texte, upscale });
      setRetour(
        r.ok
          ? { ok: true, texte: `${upscale ? "Rendu final" : "Prévisualisation"} ${r.position > 1 ? `ajouté à la file, position ${r.position}` : "lancé"}.` }
          : { ok: false, texte: r.erreur },
      );
    });

  const adopter = (id: number, quoi: string) =>
    startTransition(async () => {
      const r = await adopterGeneration(id);
      setRetour(r.ok ? { ok: true, texte: `${quoi} adopté.` } : { ok: false, texte: r.erreur });
    });

  const supprimer = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
    });

  const raisonSansAudio = referenceSrc == null ? "Il faut d'abord une voix de référence (étape 2) : c'est elle qui est clonée." : null;
  const raisonSansSon = audioSrc == null ? "Pas d'audio à tester : génère l'audio de test, ou dépose la voix de référence (étape 2)." : null;
  const texteVide = texte.trim() === "";

  return (
    <div className="voix-fiche">
      <div className="form-grid">
        <div className="field-group">
          <label>Décor (optionnel)</label>
          <select className="field" value={decorId ?? ""} onChange={(e) => setDecorId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— fond neutre</option>
            {decors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label>Personnage (optionnel)</label>
          <select className="field" value={personnageId ?? ""} onChange={(e) => setPersonnageId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— personnage générique</option>
            {personnages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group wide">
          <label>Texte à tester</label>
          <textarea
            className="field"
            rows={2}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Une réplique hors épisode — on ne teste jamais avec une ligne du découpage."
          />
          <p className="tiny-note voix-warn-mot">
            {texteDeReference ? "Le texte de référence de la voix, proposé par défaut. " : ""}
            Le même texte, <b>au mot près</b>, que celui de l&rsquo;audio de test — sinon les lèvres bougent sur un autre phrasé. Générer l&rsquo;audio puis la vidéo avec ce texte garantit l&rsquo;accord.
          </p>
        </div>
      </div>
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        {etat === "err" ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur ?? "Échec de l'enregistrement."}</span> : null}
        <button className="btn btn-gold" type="button" onClick={enregistrer} disabled={pending || !modifie}>
          {pending ? "…" : etat === "ok" ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
      {simule ? <p className="tiny-note">Mode simulé : l&rsquo;audio est un son factice, la vidéo un fichier factice.</p> : null}

      <div className="test-cols">
        <div className="field-group">
          <label>Audio de test</label>
          {audioSrc ? <audio controls src={audioSrc} className="voix-audio-ref" /> : <p className="chip-none">Aucun audio : génère-le, ou dépose la référence à l&rsquo;étape 2.</p>}
          <p className="tiny-note">{testAudioSrc ? `Audio de test en place (${testAudioNom}).` : referenceSrc ? "C'est la voix de référence qui sert — génère un audio de test pour la remplacer." : ""}</p>
          <div className="test-actions">
            <button type="button" className="btn btn-primary" onClick={lancerAudio} disabled={lancement || raisonSansAudio != null || texteVide} title={raisonSansAudio ?? (texteVide ? "Écris le texte à tester" : "La voix de référence, clonée, dit le texte (VOX_Generate_Replique_Simplified)")}>
              {lancement ? "…" : "Générer l'audio de test"}
            </button>
            {testAudioSrc ? (
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => startTransition(async () => { await retirerAudioTest(assetId); })} disabled={pending}>
                Retirer l&rsquo;audio de test
              </button>
            ) : null}
          </div>
          <CandidatsTest
            nature="audio"
            generations={essaisAudio}
            occupe={pending}
            onAdopter={(id) => adopter(id, "Audio de test")}
            onSupprimer={supprimer}
            onAnnuler={(g) => annuler(cleImage(g.uuid))}
          />
          <ZoneDepot action={(fd) => deposerAudioTest(assetId, fd)} accept="audio/*" compact>
            Déposer un audio ici, ou cliquer
          </ZoneDepot>
        </div>

        <div className="field-group">
          <label>Vidéo de test</label>
          {testVideoSrc ? (
            <video controls src={testVideoSrc} className="test-video" />
          ) : (
            <p className="chip-none">{testVideoNom ? `Rendu introuvable sur le stockage (${testVideoNom}).` : "Aucune vidéo de test."}</p>
          )}
          <div className="test-actions">
            <button type="button" className="btn btn-primary" onClick={() => lancerVideo(false)} disabled={lancement || raisonSansSon != null || texteVide} title={raisonSansSon ?? "Sortie basse résolution, sans interpolation : pour juger vite la voix sur le visage"}>
              {lancement ? "…" : "Prévisualiser"}
            </button>
            <button type="button" className="btn btn-gold" onClick={() => lancerVideo(true)} disabled={lancement || raisonSansSon != null || texteVide} title={raisonSansSon ?? "Rendu complet, avec interpolation et agrandissement : une fois la prévisualisation validée"}>
              {lancement ? "…" : "Rendu final"}
            </button>
          </div>
          <p className="tiny-note">
            {videoEnCours ? "Une vidéo est en cours : une vidéo prend plusieurs minutes, et les images en file passent devant. " : ""}
            La prévisualisation suffit pour juger la voix ; le rendu final une fois qu&rsquo;elle convient.
          </p>
          <CandidatsTest
            nature="video"
            generations={essaisVideo}
            occupe={pending}
            onAdopter={(id) => adopter(id, "Vidéo de test")}
            onSupprimer={supprimer}
            onAnnuler={(g) => annuler(cleImage(g.uuid))}
            libelleMode={(g) => (g.upscale == null ? null : g.upscale ? "Rendu final" : "Prévisualisation")}
          />
          <ZoneDepot action={(fd) => deposerVideoTest(assetId, fd)} accept="video/*" compact>
            {testVideoNom ? "Remplacer le rendu — glisser une vidéo ici" : "Déposer le rendu — glisser une vidéo ici, ou cliquer"}
          </ZoneDepot>
        </div>
      </div>

      {retour ? (
        <p className="tiny-note" role={retour.ok ? "status" : "alert"} style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
          {retour.texte}
        </p>
      ) : null}

      <details className="test-prompt">
        <summary>Prompt vidéo du test</summary>
        <div className="voix-lbl-row" style={{ marginTop: "var(--sp-2)" }}>
          <span className="tiny-note">Composé depuis le décor, le personnage et le texte ci-dessus.</span>
          <CopierBouton texte={prompt} />
        </div>
        <pre className="test-prompt-txt num">{prompt}</pre>
      </details>

      <p className="tiny-note">
        Visionner deux fois : d&rsquo;abord yeux fermés, puis avec l&rsquo;image. Si la voix plaît à l&rsquo;aveugle mais gêne à l&rsquo;image,
        c&rsquo;est l&rsquo;âge perçu ou l&rsquo;énergie, pas le timbre.
      </p>
    </div>
  );
}

const estActif = (g: { statut: string }) => g.statut === "en_attente" || g.statut === "en_cours";
