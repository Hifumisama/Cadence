"use client";

import "./voix.css";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { enregistrerVoixPersonnage, lancerMasterVoix, proposerRepliqueBase, supprimerMasterVoix } from "@/app/voix/master-actions";
import { METHODE_MASTER_VOIX } from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { useGenerationsVoix } from "./useGenerationsVoix";

const METHODES = [METHODE_MASTER_VOIX];
const ACTIFS = ["en_attente", "en_cours"];

/** Le bloc « Voix » de la fiche d'un personnage : la voix voulue (texte libre, ou laissée au modèle), la réplique du test, puis la vidéo
 * de test H3 dont on garde la voix nettoyée (le master). Rien ne bloque : sans master, le modèle vidéo invente la voix du personnage à
 * chaque plan. Les champs se retiennent en quittant la case ; les essais restent là jusqu'à ce qu'on les garde ou les retire. */
export function BlocVoix({
  personnageId,
  nom,
  initial,
  master,
  generations,
  generationInitiale,
}: {
  personnageId: number;
  nom: string;
  initial: { description: string; repliqueBase: string };
  master: { src: string | null; videoSrc: string | null; portraitSrc: string | null };
  generations: GenerationVue[];
  generationInitiale: string | null;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initial.description);
  const [replique, setReplique] = useState(initial.repliqueBase);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, startTransition] = useTransition();
  const [idee, setIdee] = useState(false);
  const { vivantes, annuler } = useGenerationsVoix({ assetId: personnageId, generations, generationInitiale, methodes: METHODES, surveiller: true });

  const enregistrer = () => void enregistrerVoixPersonnage(personnageId, { description, repliqueBase: replique });

  const demanderIdee = async () => {
    setIdee(true);
    setRetour(null);
    const r = await proposerRepliqueBase(personnageId, description);
    setIdee(false);
    if (r.ok) {
      setReplique(r.texte);
      void enregistrerVoixPersonnage(personnageId, { description, repliqueBase: r.texte });
    } else setRetour({ ok: false, texte: r.erreur });
  };

  const generer = () =>
    startTransition(async () => {
      setRetour(null);
      const r = await lancerMasterVoix(personnageId, { description, repliqueBase: replique });
      if (r.ok) {
        setRetour({ ok: true, texte: r.position > 1 ? `En file, n°${r.position}.` : "Lancé : le suivi est dans l'icône du bandeau, tu peux quitter la page." });
        router.refresh();
      } else setRetour({ ok: false, texte: r.erreur });
    });

  const agir = (f: () => Promise<{ ok: true } | { ok: false; erreur: string }>, message: string) =>
    startTransition(async () => {
      const r = await f();
      setRetour(r.ok ? { ok: true, texte: message } : { ok: false, texte: r.erreur });
      if (r.ok) router.refresh();
    });

  const aDejaGenere = master.src || vivantes.some((g) => g.statut === "termine");

  return (
    <div className="bv">
      <div className="bv-haut">
        <div className="bv-plateau">
          <div className="bv-ecran">
            {master.videoSrc ? (
              <video controls playsInline preload="metadata" src={master.videoSrc} poster={master.portraitSrc ?? undefined} />
            ) : (
              <>
                {master.portraitSrc ? <img src={master.portraitSrc} alt="" className="bv-ecran-portrait" /> : null}
                <p className="bv-ecran-vide">{master.src ? "Pas de vidéo de test conservée" : "Pas encore de vidéo de test"}</p>
              </>
            )}
          </div>
          {master.src ? (
            <div className="bv-voix-nette">
              <span className="bv-etiquette">Voix nettoyée · le master</span>
              <audio controls preload="none" src={master.src} />
              <button type="button" className="btn btn-ghost btn-mini" disabled={occupe} onClick={() => agir(() => supprimerMasterVoix(personnageId), "Master retiré.")}>
                Retirer le master
              </button>
            </div>
          ) : (
            <p className="bv-aide">Sans master, le modèle vidéo invente la voix de {nom} à chaque plan.</p>
          )}
        </div>

        <div className="bv-champs">
          <label className="bv-champ">
            <span className="bv-etiquette">La voix voulue</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={enregistrer}
              placeholder="Timbre, âge, accent, état d'esprit… Vide : le modèle choisit."
            />
          </label>
          <label className="bv-champ">
            <span className="bv-etiquette">La réplique du test</span>
            <textarea rows={4} value={replique} onChange={(e) => setReplique(e.target.value)} onBlur={enregistrer} placeholder="Deux ou trois phrases dans la langue du projet, qui montrent le caractère de la voix." />
          </label>
          <div className="bv-actions">
            <button type="button" className="btn btn-primary" onClick={generer} disabled={occupe || !replique.trim()}>
              {aDejaGenere ? "Générer une autre voix" : "Générer la voix"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={demanderIdee} disabled={idee}>
              {idee ? "L’IA écrit…" : replique.trim() ? "Une autre réplique" : "Une réplique de l’IA"}
            </button>
          </div>
          {retour ? (
            <p className={`bv-retour ${retour.ok ? "is-ok" : "is-erreur"}`} role={retour.ok ? "status" : "alert"}>
              {retour.texte}
            </p>
          ) : null}
        </div>
      </div>

      {vivantes.length > 0 ? (
        <>
          <h3 className="bv-etiquette bv-titre-essais">Les essais</h3>
          <ul className="bv-essais">
            {vivantes.map((g, i) => {
              const actif = ACTIFS.includes(g.statut);
              const etat =
                g.statut === "en_attente"
                  ? `En file${g.position ? ` · n°${g.position}` : ""}`
                  : g.statut === "en_cours"
                    ? (g.progression?.etape ?? "En cours…")
                    : g.statut === "annulee"
                      ? "Annulé"
                      : g.statut === "echoue"
                        ? "Échoué"
                        : "Prêt";
              return (
                <li key={g.id} className={`bv-essai st-${g.statut}`}>
                  <div className="bv-essai-ecran">
                    {g.statut === "termine" && g.videoSrc ? (
                      <video controls playsInline preload="metadata" src={g.videoSrc} poster={master.portraitSrc ?? undefined} />
                    ) : actif ? (
                      <div className="bv-essai-attente">
                        {g.progression ? <progress className="gd-bar" value={g.progression.valeur} max={g.progression.max} aria-label="Progression" /> : <progress className="gd-bar" aria-label="Génération en cours" />}
                      </div>
                    ) : g.statut === "echoue" ? (
                      <p className="bv-essai-echec" role="alert">
                        {g.erreur ? g.erreur.slice(0, 220) : "Échec sans message."}
                      </p>
                    ) : (
                      <p className="bv-essai-vide">{g.statut === "termine" ? "Pas de vidéo" : etat}</p>
                    )}
                  </div>
                  <div className="bv-essai-pied">
                    <div className="bv-essai-titre">
                      <b>Essai n°{vivantes.length - i}</b>
                      <span>{etat}</span>
                    </div>
                    {g.statut === "termine" && g.src ? <audio controls preload="none" src={g.src} /> : null}
                    <div className="bv-essai-actions">
                      {actif ? (
                        <button type="button" className="btn btn-ghost btn-mini" onClick={() => annuler(g)} disabled={g.annulationDemandee}>
                          {g.annulationDemandee ? "Annulation demandée…" : g.statut === "en_cours" ? "Annuler" : "Retirer de la file"}
                        </button>
                      ) : (
                        <>
                          {g.statut === "termine" && g.src ? (
                            <button type="button" className="btn btn-primary btn-mini" disabled={occupe} onClick={() => agir(() => adopterGeneration(g.id), `C’est la voix de ${nom} : le master est posé.`)}>
                              Garder cette voix
                            </button>
                          ) : null}
                          <button type="button" className="btn btn-ghost btn-mini" disabled={occupe} onClick={() => agir(() => supprimerGeneration(g.id), "Essai retiré.")}>
                            {g.statut === "termine" ? "Supprimer" : "Retirer"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
