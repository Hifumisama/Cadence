"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { lancerGenerationVoix } from "@/app/assets/generation-actions";
import type { GenerationVivante } from "@/components/assets/GenerationDialog";
import {
  CANDIDATS_GARDES,
  TEMPERATURE_VOIX_DEFAUT,
  TEMPERATURE_VOIX_MAX,
  TEMPERATURE_VOIX_MIN,
  raisonDemandeVoixInvalide,
} from "@/lib/asset-generation";
import type { GenreTache } from "@/lib/taches";
import { Icone } from "@/components/ui/Icone";

const DERRIERE: Record<GenreTache, string> = { image: "une image", video: "une vidéo", llm: "un agent" };
const ACTIFS = ["en_attente", "en_cours"];

/** Popup de génération de la VOIX DE RÉFÉRENCE d'un asset voix (Qwen3-TTS Voice Design, workflow
 * VOX_Generate_Voice_Simplified) : l'instruction de timbre, le texte lu et la créativité de la voix
 * (« température », 0,8 à 1,2). Même file, même suivi et mêmes candidats que les images et les sons ;
 * fermer la popup n'interrompt rien. Utiliser un candidat en fait la voix de référence de la fiche. */
export function GenerationVoixDialog({
  assetId,
  code,
  instructionInitiale,
  texteInitial,
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
  instructionInitiale: string;
  texteInitial: string;
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
  const [instruction, setInstruction] = useState(instructionInitiale);
  const [texte, setTexte] = useState(texteInitial);
  const [temperature, setTemperature] = useState(TEMPERATURE_VOIX_DEFAUT);
  const [vu, setVu] = useState<number | null>(candidatInitialId);
  const [lancee, setLancee] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lancement, startLancement] = useTransition();

  // L'instruction ou le texte de la fiche ont changé (candidat adopté, étape Voix modifiée) : on suit, sauf si
  // l'utilisateur a déjà écrit autre chose ici.
  const derniereInstruction = useRef(instructionInitiale);
  useEffect(() => {
    if (derniereInstruction.current === instructionInitiale) return;
    setInstruction((p) => (p === derniereInstruction.current ? instructionInitiale : p));
    derniereInstruction.current = instructionInitiale;
  }, [instructionInitiale]);
  const dernierTexte = useRef(texteInitial);
  useEffect(() => {
    if (dernierTexte.current === texteInitial) return;
    setTexte((p) => (p === dernierTexte.current ? texteInitial : p));
    dernierTexte.current = texteInitial;
  }, [texteInitial]);

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

  const bloque = raisonDemandeVoixInvalide({ instruction, texteReference: texte, temperature });

  const lancer = () => {
    if (bloque) return;
    startLancement(async () => {
      const r = await lancerGenerationVoix(assetId, { instruction, texteReference: texte, temperature });
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
      aria-labelledby="gdv-titre"
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="gd-head">
        <h2 id="gdv-titre">
          Générer la voix de référence <span className="num gd-code">{code}</span>
        </h2>
        <div className="gd-head-r">
          {simule ? <span className="tiny-note">Mode simulé : son factice (silence).</span> : null}
          <span className="num tiny-note">VOX_Generate_Voice_Simplified · Qwen3-TTS</span>
          <button type="button" className="gd-x" onClick={onFermer} aria-label="Fermer">
            <Icone nom="fermer" />
          </button>
        </div>
      </div>

      <div className="gd-body">
        <div className="gd-col">
          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="gdv-instruction">
              Instruction de la voix (en anglais)
            </label>
            <textarea
              id="gdv-instruction"
              className="field"
              rows={6}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ex. A calm native French speaker in her thirties, a low and even voice, measured pace."
            />
            <p className="tiny-note">Un paragraphe : identité, origine (langue native), prosodie, état. Elle devient l&rsquo;instruction de la voix quand tu utilises le résultat.</p>
          </div>

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="gdv-texte">
              Texte de référence
            </label>
            <textarea id="gdv-texte" className="field" rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} />
            <p className="tiny-note">Le texte lu par la voix : le même pour toutes les voix du projet, de préférence. Il doit correspondre au mot près à ce que dira la référence.</p>
          </div>

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="gdv-creativite">
              Créativité de la voix <span className="num">{temperature.toFixed(2)}</span>
            </label>
            <div className="gd-row">
              <span className="tiny-note">sage</span>
              <input
                id="gdv-creativite"
                type="range"
                min={TEMPERATURE_VOIX_MIN}
                max={TEMPERATURE_VOIX_MAX}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                aria-valuetext={`${temperature.toFixed(2)} sur ${TEMPERATURE_VOIX_MAX}`}
                style={{ flex: 1 }}
              />
              <span className="tiny-note">expressive</span>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setTemperature(TEMPERATURE_VOIX_DEFAUT)} disabled={temperature === TEMPERATURE_VOIX_DEFAUT}>
                {TEMPERATURE_VOIX_DEFAUT}
              </button>
            </div>
            <p className="tiny-note">
              Niveau de créativité de la voix (la « température » du modèle), de {TEMPERATURE_VOIX_MIN} à {TEMPERATURE_VOIX_MAX} ; {TEMPERATURE_VOIX_DEFAUT} par défaut. Plus bas, la voix reste régulière ; plus haut,
              elle varie davantage d&rsquo;un essai à l&rsquo;autre.
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
                        ? "Génération de la voix…"
                        : "Démarrage…"}
                  </span>
                </div>
                {actif.progression ? (
                  <progress className="gd-bar" value={actif.progression.valeur} max={actif.progression.max} aria-label="Progression de la génération" />
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
                    + {autres} autre{autres > 1 ? "s" : ""} en file pour cette voix
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
                <p className="tiny-note num">{courant.temperature != null ? `Créativité demandée : ${courant.temperature.toFixed(2)}` : "Voix générée"}</p>
                <div className="gd-row">
                  <button type="button" className="btn btn-primary" onClick={() => onAdopter(courant.id)} disabled={occupe}>
                    Utiliser comme référence
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onSupprimer(courant.id)} disabled={occupe}>
                    Supprimer
                  </button>
                </div>
                <p className="tiny-note">
                  Utiliser remplace la voix de référence, l&rsquo;instruction et le texte de la fiche, et repasse la voix « en cours ». Générer relance avec les réglages du formulaire et une
                  nouvelle seed.
                </p>
              </>
            ) : (
              <div className="gd-stage vide">
                <span className="tiny-note">Aucun résultat pour l&rsquo;instant. Vérifie l&rsquo;instruction et le texte, puis clique sur Générer.</span>
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
                      <span className="num tiny-note">{c.temperature != null ? c.temperature.toFixed(2) : "—"}</span>
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
          {bloque ?? `Prêt : créativité ${temperature.toFixed(2)}.`}
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
