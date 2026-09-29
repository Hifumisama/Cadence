"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaKind } from "@/components/assets/AssetCard";

/** Nœud d'asset allégé pour la galerie de références — construit côté
 * serveur (il faut vérifier les fichiers sur le disque) puis passé tel quel
 * au client. `kind` = nature du média, qui décide de quel type de référence
 * (Picture/Video/Audio) l'asset peut remplir. */
export type NoeudPicker = {
  id: number;
  code: string;
  type: string;
  statut: string;
  description: string | null;
  kind: MediaKind;
  etat: "aucun" | "manquant" | "ok";
  src: string | null;
  derives: NoeudPicker[];
};

const LIBELLE_STATUT: Record<string, string> = { valide: "Validé", en_cours: "En cours", a_produire: "À produire" };
const CLASSE_STATUT: Record<string, string> = { valide: "b-termine", en_cours: "b-rejoue", a_produire: "b-attente" };

/** Un nœud est éligible s'il a la bonne nature de média (le master d'un
 * sujet peut être une image alors que l'un de ses dérivés est une vidéo). */
const eligible = (n: NoeudPicker, kind: MediaKind) => n.kind === kind;
const contientEligible = (n: NoeudPicker, kind: MediaKind): boolean =>
  eligible(n, kind) || n.derives.some((d) => contientEligible(d, kind));
const compteEligibles = (n: NoeudPicker, kind: MediaKind): number =>
  (eligible(n, kind) ? 1 : 0) + n.derives.reduce((acc, d) => acc + compteEligibles(d, kind), 0);

function Vignette({ noeud }: { noeud: NoeudPicker }) {
  const { kind, etat, src, code } = noeud;
  return (
    <div className={`asset-card-media${etat !== "ok" ? " is-vide" : ""}`}>
      {etat === "aucun" ? <span className="tiny-note">pas de fichier</span> : null}
      {etat === "manquant" ? <span className="tiny-note">introuvable</span> : null}
      {etat === "ok" && kind === "image" && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={code} loading="lazy" />
      ) : null}
      {etat === "ok" && kind === "video" && src ? (
        <video src={`${src}#t=0.001`} preload="metadata" muted playsInline />
      ) : null}
      {etat === "ok" && kind === "audio" ? (
        <span className="asset-card-note" aria-hidden="true">
          ♪
        </span>
      ) : null}
    </div>
  );
}

function PastilleStatut({ statut }: { statut: string }) {
  return (
    <span className={`badge ${CLASSE_STATUT[statut] ?? "b-attente"}`}>
      <i />
      {LIBELLE_STATUT[statut] ?? statut}
    </span>
  );
}

function NoeudChoix({
  noeud,
  kind,
  choisi,
  dejaPris,
  onChoisir,
}: {
  noeud: NoeudPicker;
  kind: MediaKind;
  choisi: number | null;
  dejaPris: Set<number>;
  onChoisir: (id: number) => void;
}) {
  const ok = eligible(noeud, kind);
  const pris = dejaPris.has(noeud.id);
  const enfants = noeud.derives.filter((d) => contientEligible(d, kind));
  return (
    <div className="picker-noeud">
      {ok ? (
        <button
          type="button"
          className={`picker-carte${choisi === noeud.id ? " is-choisi" : ""}`}
          disabled={pris}
          onClick={() => onChoisir(noeud.id)}
          title={noeud.description ?? undefined}
        >
          <Vignette noeud={noeud} />
          <span className="picker-carte-body">
            <span className="asset-code">{noeud.code}</span>
            {pris ? <span className="tiny-note">Déjà dans ce plan</span> : <PastilleStatut statut={noeud.statut} />}
          </span>
        </button>
      ) : (
        <span className="picker-passe tiny-note">{noeud.code}</span>
      )}
      {enfants.length > 0 ? (
        <div className="picker-enfants">
          {enfants.map((d) => (
            <NoeudChoix key={d.id} noeud={d} kind={kind} choisi={choisi} dejaPris={dejaPris} onChoisir={onChoisir} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Galerie de sélection d'une référence : la grille montre les MASTERS du
 * registre (un sujet = une carte) ; cliquer un master ouvre son arbre de
 * dérivés, où l'on choisit le master lui-même ou l'un de ses dérivés. Un
 * master sans dérivé éligible s'affiche seul, prêt à être sélectionné. */
export function AssetPickerModal({
  ouvert,
  titre,
  kind,
  masters,
  dejaPris,
  enCours,
  onFermer,
  onValider,
}: {
  ouvert: boolean;
  titre: string;
  kind: MediaKind;
  masters: NoeudPicker[];
  dejaPris: Set<number>;
  enCours: boolean;
  onFermer: () => void;
  onValider: (assetId: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [masterId, setMasterId] = useState<number | null>(null);
  const [choisi, setChoisi] = useState<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) {
      setMasterId(null);
      setChoisi(null);
      d.showModal();
    }
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  const candidats = masters.filter((m) => contientEligible(m, kind));
  const master = candidats.find((m) => m.id === masterId) ?? null;

  return (
    <dialog
      ref={ref}
      className="picker-dialog"
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="modal-hd">
        <h2>
          {master ? (
            <>
              <button type="button" className="picker-retour" onClick={() => setMasterId(null)}>
                ← Galerie
              </button>{" "}
              {master.code}
            </>
          ) : (
            titre
          )}
        </h2>
        <button type="button" className="modal-close" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
      </div>

      <div className="picker-body">
        {!master ? (
          candidats.length > 0 ? (
            <div className="picker-grille">
              {candidats.map((m) => {
                const nbDerives = compteEligibles(m, kind) - (eligible(m, kind) ? 1 : 0);
                const nbPris = [m, ...flatten(m)].filter((n) => dejaPris.has(n.id)).length;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="picker-carte"
                    onClick={() => {
                      setMasterId(m.id);
                      setChoisi(null);
                    }}
                    title={m.description ?? undefined}
                  >
                    <Vignette noeud={m} />
                    <span className="picker-carte-body">
                      <span className="asset-code">{m.code}</span>
                      <span className="subj-kids">
                        {nbDerives > 0 ? `${nbDerives} dérivé${nbDerives > 1 ? "s" : ""}` : "master seul"}
                        {nbPris > 0 ? ` · ${nbPris} dans le plan` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="tiny-note">Aucun asset de ce type dans le registre du projet.</p>
          )
        ) : (
          <NoeudChoix noeud={master} kind={kind} choisi={choisi} dejaPris={dejaPris} onChoisir={setChoisi} />
        )}
      </div>

      {master ? (
        <div className="picker-pied">
          <button
            type="button"
            className="btn btn-gold"
            disabled={choisi == null || enCours}
            onClick={() => choisi != null && onValider(choisi)}
          >
            {enCours ? "..." : "Ajouter au plan"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onFermer}>
            Annuler
          </button>
        </div>
      ) : null}
    </dialog>
  );
}

function flatten(n: NoeudPicker): NoeudPicker[] {
  return n.derives.flatMap((d) => [d, ...flatten(d)]);
}
