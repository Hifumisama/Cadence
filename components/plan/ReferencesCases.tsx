"use client";

import { useState, useTransition } from "react";
import { ajouterRef, supprimerRef } from "@/app/plans/actions";
import { MAX_REFS, type RefLabel } from "@/lib/plan-checks";
import type { MediaKind } from "@/components/assets/AssetCard";
import { MediaZoom } from "@/components/assets/MediaZoom";
import { urlMiniature } from "@/lib/miniatures";
import { AssetPickerModal, type NoeudPicker } from "@/components/plan/AssetPickerModal";
import { Icone } from "@/components/ui/Icone";

export type RefVue = {
  id: number;
  type: RefLabel["type"];
  slot: number;
  asset: {
    id: number;
    code: string;
    libelle: string;
    statut: string;
    kind: MediaKind;
    etat: "aucun" | "manquant" | "ok";
    src: string | null;
  } | null;
};

type Type = RefLabel["type"];

const LABEL_TYPE: Record<Type, string> = { picture: "Picture", video: "Video", audio: "Audio" };
const NOM_TYPE: Record<Type, string> = { picture: "Image", video: "Vidéo", audio: "Audio" };
const NOM_TYPE_PLURIEL: Record<Type, string> = { picture: "Images", video: "Vidéos", audio: "Audios" };

// Nature de média attendue pour chaque type de référence.
const KIND_PAR_TYPE: Record<Type, MediaKind> = { picture: "image", video: "video", audio: "audio" };

const TITRE_GALERIE: Record<Type, string> = {
  picture: "Choisir une image de référence",
  video: "Choisir une vidéo de référence",
  audio: "Choisir un audio de référence (voix, bruitage)",
};

function Miniature({ asset }: { asset: NonNullable<RefVue["asset"]> }) {
  if (asset.etat !== "ok" || !asset.src) {
    return (
      <div className="ref-thumb is-vide">
        <span className="tiny-note">{asset.etat === "manquant" ? "introuvable" : "sans fichier"}</span>
      </div>
    );
  }
  // Image et vidéo : agrandissables en plein écran (MediaZoom). Audio : note, le lecteur est dans la galerie.
  if (asset.kind === "audio") {
    return (
      <div className="ref-thumb is-audio">
        <span className="ref-note" aria-hidden="true">
          <Icone nom="musique" taille={22} />
        </span>
      </div>
    );
  }
  return (
    <MediaZoom
      kind={asset.kind}
      src={asset.src}
      apercu={asset.kind === "image" ? urlMiniature(asset.src, 192) : undefined}
      alt={asset.code}
      classe="ref-thumb"
    />
  );
}

/** Les références du plan, à côté du lecteur : des CASES, une par emplacement que H3 accepte (6 images, 2 vidéos, 3 audios). Une case pleine montre
 * l'image, la vidéo (agrandissable) ou la note de l'audio, avec son label `<Picture 1>` tel qu'il est cité dans le prompt ; une case vide propose
 * d'y mettre un asset du registre. Ajouter ou retirer une référence réécrit le prompt côté serveur (déclaration, renumérotation). */
export function ReferencesCases({ planId, refs, assets }: { planId: number; refs: RefVue[]; assets: NoeudPicker[] }) {
  const [choix, setChoix] = useState<Type | null>(null);
  const [pending, startTransition] = useTransition();

  const parType = (t: Type) => refs.filter((r) => r.type === t).sort((a, b2) => a.slot - b2.slot);
  const dejaPris = new Set(choix ? parType(choix).flatMap((r) => (r.asset ? [r.asset.id] : [])) : []);
  const ordre: Type[] = ["picture", "video", "audio"];

  const onAjouter = (assetId: number) => {
    if (!choix) return;
    const type = choix;
    startTransition(async () => {
      await ajouterRef(planId, type, assetId);
      setChoix(null);
    });
  };
  const onSupprimer = (refId: number) => {
    startTransition(async () => {
      await supprimerRef(refId);
    });
  };

  return (
    <section className="fp-refs" id="fp-refs" aria-label="Références du plan">
      <h2 className="fp-refs-titre">Références</h2>
      {ordre.map((t) => {
        const pleines = parType(t);
        const vides = Math.max(0, MAX_REFS[t] - pleines.length);
        return (
          <div key={t} className="fp-refs-groupe">
            <span className="eyebrow num">
              {NOM_TYPE_PLURIEL[t]} {pleines.length}/{MAX_REFS[t]}
            </span>
            <div className="fp-cases">
              {pleines.map((r) => (
                <figure key={r.id} className="fp-case is-pleine" data-ref={`${LABEL_TYPE[r.type]} ${r.slot}`}>
                  {r.asset ? <Miniature asset={r.asset} /> : <div className="ref-thumb is-vide" />}
                  <figcaption>
                    <span className="num fp-ref-label">
                      &lt;{LABEL_TYPE[r.type]} {r.slot}&gt;
                    </span>
                    <span className="asset-code" title={r.asset?.code}>
                      {r.asset?.libelle ?? "—"}
                    </span>
                    {r.asset && r.asset.statut !== "valide" ? <span className="fp-ref-statut">{r.asset.statut === "en_cours" ? "à valider" : "à produire"}</span> : null}
                  </figcaption>
                  <button type="button" className="ref-suppr" onClick={() => onSupprimer(r.id)} disabled={pending} aria-label={`Retirer <${LABEL_TYPE[r.type]} ${r.slot}>`}>
                    <Icone nom="fermer" />
                  </button>
                </figure>
              ))}
              {Array.from({ length: vides }, (_, i) => (
                <button key={`vide-${i}`} type="button" className="fp-case is-vide" disabled={pending} onClick={() => setChoix(t)} aria-label={`Ajouter ${NOM_TYPE[t].toLowerCase()} <${LABEL_TYPE[t]} ${pleines.length + i + 1}>`}>
                  <Icone nom="ajouter" taille={18} />
                  <span className="num">
                    &lt;{LABEL_TYPE[t]} {pleines.length + i + 1}&gt;
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <AssetPickerModal
        ouvert={choix != null}
        titre={choix ? TITRE_GALERIE[choix] : ""}
        kind={choix ? KIND_PAR_TYPE[choix] : "image"}
        assets={assets}
        dejaPris={dejaPris}
        enCours={pending}
        onFermer={() => setChoix(null)}
        onValider={onAjouter}
      />
    </section>
  );
}
