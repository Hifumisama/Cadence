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
    statut: string;
    kind: MediaKind;
    etat: "aucun" | "manquant" | "ok";
    src: string | null;
  } | null;
};

const LABEL_TYPE: Record<RefLabel["type"], string> = {
  picture: "Picture",
  video: "Video",
  audio: "Audio",
};

// Nature de média attendue pour chaque type de référence.
const KIND_PAR_TYPE: Record<RefLabel["type"], MediaKind> = {
  picture: "image",
  video: "video",
  audio: "audio",
};

const TITRE_GALERIE: Record<RefLabel["type"], string> = {
  picture: "Choisir une image de référence",
  video: "Choisir une vidéo de référence",
  audio: "Choisir un audio de référence",
};

function Miniature({ asset }: { asset: NonNullable<RefVue["asset"]> }) {
  if (asset.etat !== "ok" || !asset.src) {
    return (
      <div className="ref-thumb is-vide">
        <span className="tiny-note">{asset.etat === "manquant" ? "introuvable" : "pas de fichier"}</span>
      </div>
    );
  }
  // Image et vidéo : agrandissables en plein écran (MediaZoom). Audio : lecteur.
  if (asset.kind === "audio") {
    return (
      <div className="ref-thumb is-audio">
        <span className="ref-note" aria-hidden="true">
          <Icone nom="musique" taille={28} />
        </span>
        <audio controls preload="none" src={asset.src} />
      </div>
    );
  }
  return (
    <MediaZoom
      kind={asset.kind}
      src={asset.src}
      apercu={asset.kind === "image" ? urlMiniature(asset.src, 384) : undefined}
      alt={asset.code}
      classe="ref-thumb"
    />
  );
}

function RefsType({
  planId,
  type,
  items,
  masters,
}: {
  planId: number;
  type: RefLabel["type"];
  items: RefVue[];
  masters: NoeudPicker[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const plein = items.length >= MAX_REFS[type];
  const dejaPris = new Set(items.flatMap((r) => (r.asset ? [r.asset.id] : [])));

  const onAjouter = (assetId: number) => {
    startTransition(async () => {
      await ajouterRef(planId, type, assetId);
      setOuvert(false);
    });
  };

  const onSupprimer = (refId: number) => {
    startTransition(async () => {
      await supprimerRef(refId);
    });
  };

  return (
    <div className="refs-type">
      <div className="refs-type-hd">
        <span className="eyebrow">
          {LABEL_TYPE[type]} <span className="num">{items.length}/{MAX_REFS[type]}</span>
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={plein}
          onClick={() => setOuvert(true)}
        >
          {plein ? "Maximum atteint" : <><Icone nom="ajouter" taille={15} /> Ajouter</>}
        </button>
      </div>

      {items.length > 0 ? (
        <div className="refs-grille">
          {items.map((r) => (
            <figure key={r.id} className="ref-carte">
              {r.asset ? <Miniature asset={r.asset} /> : <div className="ref-thumb is-vide" />}
              <figcaption>
                <span className="num ref-label">
                  &lt;{LABEL_TYPE[type]} {r.slot}&gt;
                </span>
                <span className="asset-code">{r.asset?.code ?? "—"}</span>
                {r.asset && r.asset.statut !== "valide" ? (
                  <span className="tiny-note">{r.asset.statut === "en_cours" ? "en cours" : "à produire"}</span>
                ) : null}
              </figcaption>
              <button
                type="button"
                className="ref-suppr"
                onClick={() => onSupprimer(r.id)}
                disabled={pending}
                aria-label={`Retirer <${LABEL_TYPE[type]} ${r.slot}>`}
              >
                <Icone nom="fermer" />
              </button>
            </figure>
          ))}
        </div>
      ) : (
        <p className="tiny-note">Aucune référence.</p>
      )}

      <AssetPickerModal
        ouvert={ouvert}
        titre={TITRE_GALERIE[type]}
        kind={KIND_PAR_TYPE[type]}
        masters={masters}
        dejaPris={dejaPris}
        enCours={pending}
        onFermer={() => setOuvert(false)}
        onValider={onAjouter}
      />
    </div>
  );
}

export function RefsPanel({
  planId,
  refs,
  masters,
}: {
  planId: number;
  refs: RefVue[];
  masters: NoeudPicker[];
}) {
  return (
    <section className="panel">
      <div className="panel-hd">
        <h2>Références</h2>
      </div>
      <div className="panel-bd refs-panel">
        {(["picture", "video", "audio"] as const).map((type) => (
          <RefsType
            key={type}
            planId={planId}
            type={type}
            items={refs.filter((r) => r.type === type).sort((a, b) => a.slot - b.slot)}
            masters={masters}
          />
        ))}
      </div>
    </section>
  );
}
