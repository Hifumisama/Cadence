"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaKind } from "@/components/assets/AssetCard";
import { urlMiniature } from "@/lib/miniatures";
import { Icone } from "@/components/ui/Icone";

/** Asset allégé pour la galerie de références — construit côté serveur (il faut vérifier les fichiers sur le disque) puis passé tel
 * quel au client. `kind` = nature du média, qui décide de quel type de référence (Picture/Video/Audio) l'asset peut remplir. */
export type NoeudPicker = {
  id: number;
  code: string;
  libelle: string;
  type: string;
  statut: string;
  description: string | null;
  kind: MediaKind;
  etat: "aucun" | "manquant" | "ok";
  src: string | null;
};

const LIBELLE_STATUT: Record<string, string> = { valide: "Validé", en_cours: "En cours", a_produire: "À produire" };
const CLASSE_STATUT: Record<string, string> = { valide: "b-termine", en_cours: "b-rejoue", a_produire: "b-attente" };

function Vignette({ noeud }: { noeud: NoeudPicker }) {
  const { kind, etat, src, libelle: code } = noeud;
  return (
    <div className={`asset-card-media${etat !== "ok" ? " is-vide" : ""}`}>
      {etat === "aucun" ? <span className="tiny-note">pas de fichier</span> : null}
      {etat === "manquant" ? <span className="tiny-note">introuvable</span> : null}
      {etat === "ok" && kind === "image" && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlMiniature(src, 384)} alt={code} loading="lazy" decoding="async" />
      ) : null}
      {etat === "ok" && kind === "video" && src ? (
        <video src={`${src}#t=0.001`} preload="metadata" muted playsInline />
      ) : null}
      {etat === "ok" && kind === "audio" ? (
        <span className="asset-card-note" aria-hidden="true">
          <Icone nom="musique" taille={28} />
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

/** Galerie de sélection d'une référence : une carte par asset du registre qui a la bonne nature de média (le registre est plat).
 * On choisit une carte, puis « Ajouter au plan ». */
export function AssetPickerModal({
  ouvert,
  titre,
  kind,
  assets,
  dejaPris,
  enCours,
  onFermer,
  onValider,
}: {
  ouvert: boolean;
  titre: string;
  kind: MediaKind;
  assets: NoeudPicker[];
  dejaPris: Set<number>;
  enCours: boolean;
  onFermer: () => void;
  onValider: (assetId: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [choisi, setChoisi] = useState<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) {
      setChoisi(null);
      d.showModal();
    }
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  const candidats = assets.filter((a) => a.kind === kind);

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
        <h2>{titre}</h2>
        <button type="button" className="modal-close" onClick={onFermer} aria-label="Fermer">
          <Icone nom="fermer" />
        </button>
      </div>

      <div className="picker-body">
        {candidats.length > 0 ? (
          <div className="picker-grille">
            {candidats.map((a) => {
              const pris = dejaPris.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`picker-carte${choisi === a.id ? " is-choisi" : ""}`}
                  disabled={pris}
                  onClick={() => setChoisi(a.id)}
                  title={a.description ?? undefined}
                >
                  <Vignette noeud={a} />
                  <span className="picker-carte-body">
                    <span className="asset-code" title={a.code}>{a.libelle}</span>
                    {pris ? <span className="tiny-note">Déjà dans ce plan</span> : <PastilleStatut statut={a.statut} />}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="tiny-note">Aucun asset de ce type dans le registre du projet.</p>
        )}
      </div>

      <div className="picker-pied">
        <button type="button" className="btn btn-gold" disabled={choisi == null || enCours} onClick={() => choisi != null && onValider(choisi)}>
          {enCours ? "..." : "Ajouter au plan"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onFermer}>
          Annuler
        </button>
      </div>
    </dialog>
  );
}
