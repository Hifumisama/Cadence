"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { lancerGenerationAudio } from "@/app/assets/generation-actions";
import type { GenerationVivante } from "@/components/assets/GenerationDialog";
import {
  CANDIDATS_GARDES,
  DUREE_AUDIO_DEFAUT,
  DUREE_AUDIO_MAX,
  DUREE_AUDIO_MIN,
  formaterDuree,
  raisonDemandeAudioInvalide,
} from "@/lib/asset-generation";
import type { GenreTache } from "@/lib/taches";

const DERRIERE: Record<GenreTache, string> = { image: "une image", video: "une vidéo", llm: "un agent" };
const ACTIFS = ["en_attente", "en_cours"];
const DUREES_RAPIDES = [2, 4, 8, 15];

/** Popup de génération AUDIO d'un asset sfx (Stable Audio 3, workflow
 * SFX_Generate_Sounds) : un prompt court en anglais et une durée, qui est un
 * paramètre séparé du texte. Même file, même suivi et mêmes candidats que les
 * images ; fermer la popup n'interrompt rien. */
export function GenerationAudioDialog({
  assetId,
  code,
  promptInitial,
  dureeInitiale,
  generations,
  candidatInitialId,
  ouvert,
  onFermer,
  onAdopter,
  onSupprimer,
  onAnnuler,
  occupe,
  retour,
  simule,
}: {
  assetId: number;
  code: string;
  promptInitial: string;
  /** Durée retenue de l'asset (ou suggérée), null si aucune. */
  dureeInitiale: number | null;
  generations: GenerationVivante[];
  candidatInitialId: number | null;
  ouvert: boolean;
  onFermer: () => void;
  onAdopter: (id: number) => void;
  onSupprimer: (id: number) => void;
  onAnnuler: (g: GenerationVivante) => void;
  occupe: boolean;
  retour: { ok: boolean; texte: string } | null;
  simule: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState(promptInitial);
  const [duree, setDuree] = useState(String(dureeInitiale ?? DUREE_AUDIO_DEFAUT));
  const [vu, setVu] = useState<number | null>(candidatInitialId);
  const [lancee, setLancee] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lancement, startLancement] = useTransition();

  // Le prompt ou la durée de la fiche ont changé (un candidat a été adopté) : on
  // suit, sauf si l'utilisateur a déjà écrit autre chose.
  const dernierPrompt = useRef(promptInitial);
  useEffect(() => {
    if (dernierPrompt.current === promptInitial) return;
    setPrompt((p) => (p === dernierPrompt.current ? promptInitial : p));
    dernierPrompt.current = promptInitial;
  }, [promptInitial]);
  const derniereDuree = useRef(dureeInitiale);
  useEffect(() => {
    if (derniereDuree.current === dureeInitiale) return;
    setDuree((d) => (d === String(derniereDuree.current ?? DUREE_AUDIO_DEFAUT) ? String(dureeInitiale ?? DUREE_AUDIO_DEFAUT) : d));
    derniereDuree.current = dureeInitiale;
  }, [dureeInitiale]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  const actives = generations.filter((g) => ACTIFS.includes(g.statut));
  const actif = actives.find((g) => g.statut === "en_cours") ?? actives[actives.length - 1] ?? null;
  const autres = actives.length - (actif ? 1 : 0);
  useEffect(() => {
    if (!actif) setLancee(null);
  }, [actif]);

  const terminees = generations.filter((g) => g.statut === "termine" && g.src);
  const courant = terminees.find((g) => g.id === vu) ?? terminees[0] ?? null;
  const derniere = generations[0] ?? null;
  const echec = !actif && derniere?.statut === "echoue" ? derniere : null;
  const annulee = !actif && derniere?.statut === "annulee";
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  useEffect(() => setConfirmerAnnulation(false), [actif?.id, actif?.statut]);

  const dureeNombre = Number(duree.replace(",", "."));
  const bloque = raisonDemandeAudioInvalide({ prompt, dureeSecondes: duree.trim() === "" ? Number.NaN : dureeNombre });

  const lancer = () => {
    if (bloque) return;
    startLancement(async () => {
      const r = await lancerGenerationAudio(assetId, { prompt, dureeSecondes: dureeNombre });
      setErreur(r.ok ? null : r.erreur);
      if (r.ok) {
        setLancee(r.position > 1 ? `Ajoutée à la file, position ${r.position}.` : "Génération lancée.");
        setVu(null);
      }
    });
  };

  return (
    <dialog
      ref={ref}
      className="gd"
      aria-labelledby="gda-titre"
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="gd-head">
        <h2 id="gda-titre">
          Générer un son <span className="num gd-code">{code}</span>
        </h2>
        <div className="gd-head-r">
          {simule ? <span className="tiny-note">Mode simulé : son factice (silence).</span> : null}
          <span className="num tiny-note">SFX_Generate_Sounds · Stable Audio 3</span>
          <button type="button" className="gd-x" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </div>
      </div>

      <div className="gd-body">
        <div className="gd-col">
          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="gda-prompt">
              Prompt (description du son, en anglais)
            </label>
            <textarea
              id="gda-prompt"
              className="field"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex. Heavy oak door creaking open slowly, echoing through a stone interior."
            />
            <p className="tiny-note">
              Une ou deux phrases denses : la source, la matière, l&rsquo;espace, l&rsquo;évolution dans le temps. Pas de paroles, pas de musique, pas de
              négation. Il devient le prompt de l&rsquo;asset quand tu utilises le résultat.
            </p>
          </div>

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="gda-duree">
              Durée (secondes)
            </label>
            <div className="gd-row">
              <input
                id="gda-duree"
                className="field gd-duree"
                type="number"
                inputMode="decimal"
                min={DUREE_AUDIO_MIN}
                max={DUREE_AUDIO_MAX}
                step={0.5}
                value={duree}
                onChange={(e) => setDuree(e.target.value)}
              />
              <div className="gd-seg gd-seg-durees" role="group" aria-label="Durées usuelles">
                {DUREES_RAPIDES.map((d) => (
                  <button key={d} type="button" aria-pressed={dureeNombre === d} onClick={() => setDuree(String(d))}>
                    {d} s
                  </button>
                ))}
              </div>
            </div>
            <p className="tiny-note">
              Réglage du workflow, séparé du texte. Un impact : 1 à 3 s ; un bruitage de scène : 3 à 6 s ; une ambiance : 6 à 15 s (un plan dure 4 à 15 s).
            </p>
          </div>
        </div>

        <div className="gd-col gd-scene">
          <div className="gd-grp">
            <span className="gd-lbl">{actif ? (actif.statut === "en_cours" ? "Génération en cours" : "En file") : "Résultat"}</span>
            {actif ? (
              <>
                <div className="gd-stage">
                  <span className="tiny-note">
                    {actif.statut === "en_attente"
                      ? `En file${actif.position ? ` · n°${actif.position}` : ""}${actif.derriere ? ` · derrière ${DERRIERE[actif.derriere]}` : ""}`
                      : actif.progression
                        ? "Génération du son…"
                        : "Démarrage…"}
                  </span>
                </div>
                {actif.progression ? (
                  <>
                    <progress className="gd-bar" value={actif.progression.valeur} max={actif.progression.max} aria-label="Progression de la génération" />
                    <div className="gd-prog num">
                      <span>
                        {actif.progression.etape ? `${actif.progression.etape} · ` : ""}
                        étape {actif.progression.valeur}/{actif.progression.max}
                      </span>
                    </div>
                  </>
                ) : (
                  <progress className="gd-bar" aria-label="Génération en cours" />
                )}
                {lancee ? (
                  <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>
                    {lancee}
                  </p>
                ) : null}
                {actif.annulationDemandee ? (
                  <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>
                    Annulation demandée… ComfyUI est en train de s&rsquo;arrêter.
                  </p>
                ) : confirmerAnnulation ? (
                  <div className="gd-row" role="group" aria-label="Confirmer l'annulation">
                    <button
                      type="button"
                      className="btn btn-ghost btn-mini"
                      onClick={() => {
                        setConfirmerAnnulation(false);
                        onAnnuler(actif);
                      }}
                    >
                      Oui, annuler la génération
                    </button>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => setConfirmerAnnulation(false)}>
                      Non
                    </button>
                  </div>
                ) : (
                  <div className="gd-row">
                    <button
                      type="button"
                      className="btn btn-ghost btn-mini"
                      onClick={() => (actif.statut === "en_cours" ? setConfirmerAnnulation(true) : onAnnuler(actif))}
                    >
                      {actif.statut === "en_cours" ? "Annuler cette génération" : "Retirer de la file"}
                    </button>
                  </div>
                )}
                {autres > 0 ? (
                  <p className="tiny-note num">
                    + {autres} autre{autres > 1 ? "s" : ""} en file pour cet asset
                  </p>
                ) : null}
                <p className="tiny-note">Tu peux fermer cette fenêtre : la génération continue, et le suivi est dans l&rsquo;icône du bandeau.</p>
              </>
            ) : courant ? (
              <>
                <div className="gd-stage gd-son-scene">
                  {/* Le nom du fichier change à chaque candidat : l'élément est recréé. */}
                  <audio key={courant.id} controls preload="metadata" src={courant.src!} className="gd-lecteur" />
                </div>
                <p className="tiny-note num">{courant.dureeSecondes != null ? `Durée demandée : ${formaterDuree(courant.dureeSecondes)}` : "Son généré"}</p>
                <div className="gd-row">
                  <button type="button" className="btn btn-primary" onClick={() => onAdopter(courant.id)} disabled={occupe}>
                    Utiliser
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onSupprimer(courant.id)} disabled={occupe}>
                    Supprimer
                  </button>
                </div>
                <p className="tiny-note">
                  Utiliser remplace le son, le prompt et la durée de l&rsquo;asset, et le repasse « en cours ». Générer relance avec les réglages du formulaire et
                  une nouvelle seed.
                </p>
              </>
            ) : (
              <div className="gd-stage vide">
                <span className="tiny-note">Aucun résultat pour l&rsquo;instant. Remplis le formulaire puis clique sur Générer.</span>
              </div>
            )}
            {retour ? (
              <p className="tiny-note" role={retour.ok ? "status" : "alert"} style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
                {retour.texte}
              </p>
            ) : null}
            {annulee ? <p className="tiny-note">Dernière génération annulée.</p> : null}
            {echec ? (
              <p className="tiny-note gd-echec" role="alert">
                Dernière génération échouée{echec.erreur ? ` : ${echec.erreur.slice(0, 160)}` : "."}
              </p>
            ) : null}
          </div>

          <div className="gd-grp">
            <div className="gd-row gd-row-between">
              <span className="gd-lbl">Candidats</span>
              <span className="num tiny-note">
                {terminees.length}/{CANDIDATS_GARDES}
              </span>
            </div>
            {terminees.length > 0 ? (
              <ul className="gd-sons">
                {terminees.map((c, i) => (
                  <li key={c.id} className={!actif && courant?.id === c.id ? "on" : ""}>
                    <button type="button" onClick={() => setVu(c.id)} aria-pressed={!actif && courant?.id === c.id} aria-label={`Candidat ${i + 1}`}>
                      <span className="num">n°{i + 1}</span>
                      <span className="num tiny-note">{c.dureeSecondes != null ? formaterDuree(c.dureeSecondes) : "—"}</span>
                    </button>
                    <audio controls preload="none" src={c.src!} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tiny-note">Aucun candidat pour l&rsquo;instant.</p>
            )}
          </div>
        </div>
      </div>

      <div className="gd-foot">
        <span className={`gd-raison${bloque ? " bloque" : ""}`} role="status">
          {bloque ?? `Prêt : son de ${formaterDuree(dureeNombre)}.`}
          {erreur ? <span className="gd-erreur" role="alert"> {erreur}</span> : null}
        </span>
        <div className="gd-row">
          <button type="button" className="btn btn-ghost" onClick={onFermer}>
            Fermer
          </button>
          <button type="button" className="btn btn-gold" onClick={lancer} disabled={bloque != null || lancement}>
            {lancement ? "…" : actif ? "Ajouter à la file" : "Générer"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
