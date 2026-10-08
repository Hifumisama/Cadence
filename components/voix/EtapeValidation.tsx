"use client";

import { useState, useTransition } from "react";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { deposerVideoTest, lancerTestVideo } from "@/app/voix/actions";
import { updateAssetStatut } from "@/app/assets/actions";
import { METHODE_TEST_VIDEO } from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { LIBELLE_ETAT_FICHE, etatFiche, promptTestVoix } from "@/lib/voix";
import { CandidatsTest } from "./CandidatsTest";
import { CopierBouton } from "./CopierBouton";
import { useEtapesVoix } from "./FicheVoixSlider";
import { useGenerationsVoix } from "./useGenerationsVoix";
import { ZoneDepot } from "./ZoneDepot";

type Option = { id: number; code: string; description: string | null };

const METHODES_TEST: string[] = [METHODE_TEST_VIDEO];
const estActif = (g: { statut: string }) => g.statut === "en_attente" || g.statut === "en_cours";

/** Étape 3 — la validation. On réécoute la voix de référence (la changer se fait à l'étape 2), on l'essaie sur un visage avec un TEST
 * VIDÉO en aperçu seulement (basse résolution, sans agrandissement : le rendu final se fait dans la fiche de plan), puis le geste
 * distinct et explicite « Valider la voix ». Le texte du test est présélectionné sur la réplique d'écoute de la fiche, mais libre.
 * Valider reste séparé de « Garder celle-ci » (étape 2) : garder une candidate repasse la fiche « à valider ». */
export function EtapeValidation({
  assetId,
  nomVoix,
  statut,
  referenceFichier,
  referenceSrc,
  decors,
  personnages,
  initial,
  refText,
  testVideoSrc,
  testVideoNom,
  generations,
  generationInitiale,
  simule,
}: {
  assetId: number;
  nomVoix: string;
  statut: string;
  referenceFichier: string | null;
  referenceSrc: string | null;
  decors: Option[];
  personnages: Option[];
  /** `texte` : le texte de test déjà écrit sur la fiche (vide = on suit la réplique d'écoute). */
  initial: { decorId: number | null; personnageId: number | null; texte: string };
  /** La réplique d'écoute de la fiche : le texte présélectionné du test. */
  refText: string;
  testVideoSrc: string | null;
  testVideoNom: string | null;
  generations: GenerationVue[];
  generationInitiale: string | null;
  simule: boolean;
}) {
  const { aller } = useEtapesVoix();
  const { vivantes, annuler } = useGenerationsVoix({ assetId, generations, generationInitiale, methodes: METHODES_TEST, etape: "validation" });
  const [decorId, setDecorId] = useState<number | null>(initial.decorId);
  const [personnageId, setPersonnageId] = useState<number | null>(initial.personnageId);
  // null = le champ suit la réplique d'écoute ; dès qu'on écrit autre chose, le texte est libre.
  const [texteLibre, setTexteLibre] = useState<string | null>(initial.texte.trim() && initial.texte.trim() !== refText.trim() ? initial.texte : null);
  const [pending, startTransition] = useTransition();
  const [lancement, startLancement] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  const texte = texteLibre ?? refText;
  const decor = decors.find((d) => d.id === decorId) ?? null;
  const perso = personnages.find((p) => p.id === personnageId) ?? null;
  const prompt = promptTestVoix({ texte, personnage: perso, decor, avecAudio: referenceSrc != null });
  const essais = vivantes;
  const enCours = essais.some(estActif);
  const sansReference = referenceSrc == null;
  const texteVide = texte.trim() === "";
  const etat = etatFiche({ fichier: referenceFichier, statut });
  const valide = etat === "validee";

  const lancer = () =>
    startLancement(async () => {
      const r = await lancerTestVideo(assetId, { decorId, personnageId, texte }, { avecReference: true });
      setRetour(r.ok ? { ok: true, texte: `Test vidéo ${r.position > 1 ? `ajouté à la file, position ${r.position}` : "lancé"}. Tu peux quitter la page : le suivi est dans l'icône du bandeau.` } : { ok: false, texte: r.erreur });
    });

  const adopter = (id: number) =>
    startTransition(async () => {
      const r = await adopterGeneration(id);
      setRetour(r.ok ? { ok: true, texte: "Vidéo de test adoptée." } : { ok: false, texte: r.erreur });
    });

  const supprimer = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
    });

  const changerStatut = (valider: boolean) =>
    startTransition(async () => {
      await updateAssetStatut(assetId, valider ? "valide" : "en_cours");
      setRetour(valider ? { ok: true, texte: `${nomVoix} est validée. Les répliques peuvent être produites.` } : null);
    });

  return (
    <div className="voix-fiche">
      {sansReference ? (
        <p className="tiny-note" id="why-val">
          Disponible dès qu&rsquo;une voix de référence est rattachée.{" "}
          <button type="button" className="lien-bouton" onClick={() => aller("reference", { focus: "action" })}>
            Créer la voix de référence (étape 2)
          </button>
        </p>
      ) : (
        <div className="ligne-ref">
          <audio controls src={referenceSrc} className="voix-audio-ref" aria-label="Voix de référence actuelle" />
          <button type="button" className="lien-bouton" onClick={() => aller("reference", { focus: "action" })}>
            Changer la voix de référence
          </button>
        </div>
      )}

      <div className="test-cols">
        <div className="field-group">
          <div className="field-group">
            <label htmlFor="v-txt">Texte du test</label>
            <textarea
              id="v-txt"
              className="field"
              rows={3}
              value={texte}
              onChange={(e) => setTexteLibre(e.target.value)}
              disabled={sansReference}
              placeholder="Une réplique hors épisode — on ne teste jamais avec une ligne du découpage."
            />
            <div className="row-actions">
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setTexteLibre(null)} disabled={sansReference || texteLibre == null}>
                Reprendre la réplique d&rsquo;écoute
              </button>
            </div>
            <p className="tiny-note">Présélectionné sur la réplique d&rsquo;écoute de la fiche. Écris n&rsquo;importe quel texte pour juger la voix sur autre chose.</p>
          </div>
          <div className="field-group">
            <label htmlFor="v-decor">Décor (optionnel)</label>
            <select id="v-decor" className="field" value={decorId ?? ""} onChange={(e) => setDecorId(e.target.value ? Number(e.target.value) : null)} disabled={sansReference}>
              <option value="">Fond neutre</option>
              {decors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="v-perso">Personnage à l&rsquo;image (optionnel)</label>
            <select id="v-perso" className="field" value={personnageId ?? ""} onChange={(e) => setPersonnageId(e.target.value ? Number(e.target.value) : null)} disabled={sansReference}>
              <option value="">Personnage générique</option>
              {personnages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${testVideoSrc ? "" : "btn-gold"}`}
              onClick={lancer}
              disabled={lancement || sansReference || texteVide}
              aria-describedby={sansReference ? "why-val" : undefined}
              title="Sortie basse résolution, sans interpolation ni agrandissement : pour juger la voix sur le visage"
            >
              {lancement ? "…" : testVideoSrc ? "Relancer l'aperçu" : "Lancer l'aperçu"}
            </button>
          </div>
          <p className="tiny-note">
            {enCours ? "Une vidéo est en cours : cela prend plusieurs minutes, et les images en file passent devant. " : ""}
            Aperçu uniquement : le rendu final se fait dans la fiche de plan.
          </p>
          {simule ? <p className="tiny-note">Mode simulé : la vidéo est un fichier factice.</p> : null}
        </div>

        <div className="field-group">
          <span className="lbl-voix">Test vidéo actuel</span>
          {testVideoSrc ? (
            <video controls src={testVideoSrc} className="test-video" />
          ) : (
            <p className="chip-none">{testVideoNom ? `Rendu introuvable sur le stockage (${testVideoNom}).` : "Entends la voix sur un visage avant de la valider."}</p>
          )}
          <CandidatsTest
            nature="video"
            generations={essais}
            occupe={pending}
            onAdopter={adopter}
            onSupprimer={supprimer}
            onAnnuler={annuler}
          />
          <ZoneDepot action={(fd) => deposerVideoTest(assetId, fd)} accept="video/*" compact>
            {testVideoNom ? "Remplacer le rendu — glisser une vidéo ici" : "Déposer un rendu fait ailleurs — glisser une vidéo ici, ou cliquer"}
          </ZoneDepot>
        </div>
      </div>

      <details className="test-prompt">
        <summary>Prompt vidéo du test</summary>
        <div className="voix-lbl-row" style={{ marginTop: "var(--sp-2)" }}>
          <span className="tiny-note">Composé depuis le décor, le personnage et le texte ci-dessus.</span>
          <CopierBouton texte={prompt} />
        </div>
        <pre className="test-prompt-txt num">{prompt}</pre>
      </details>

      <div className="sous-bloc">
        <div className="row-actions">
          <span className={`badge ${etat === "validee" ? "b-termine" : etat === "a_valider" ? "b-rejoue" : "b-attente"}`}>
            <i />
            {LIBELLE_ETAT_FICHE[etat]}
          </span>
          {valide ? (
            <button type="button" className="btn btn-ghost" onClick={() => changerStatut(false)} disabled={pending}>
              Repasser en « à valider »
            </button>
          ) : (
            <button type="button" className="btn btn-gold" onClick={() => changerStatut(true)} disabled={pending || sansReference} aria-describedby={sansReference ? "why-val" : undefined}>
              Valider la voix
            </button>
          )}
        </div>
        <p className="tiny-note">
          {valide
            ? "Changer la voix de référence repassera la fiche en « à valider »."
            : "Valider est un geste explicite, distinct du test et de « Garder celle-ci ». Changer la voix de référence repasse toujours la fiche en « à valider »."}
        </p>
      </div>

      {retour ? (
        <p className="tiny-note" role={retour.ok ? "status" : "alert"} style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
          {retour.texte}
        </p>
      ) : null}
      <p className="tiny-note">
        Visionner deux fois : d&rsquo;abord yeux fermés, puis avec l&rsquo;image. Si la voix plaît à l&rsquo;aveugle mais gêne à l&rsquo;image, c&rsquo;est l&rsquo;âge perçu ou l&rsquo;énergie, pas le timbre.
      </p>
    </div>
  );
}
