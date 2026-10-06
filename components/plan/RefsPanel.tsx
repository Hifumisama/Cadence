"use client";

import { useState, useTransition } from "react";
import { ajouterRef, supprimerRef } from "@/app/plans/actions";
import { MAX_REFS, type RefLabel } from "@/lib/plan-checks";
import type { MediaKind } from "@/components/assets/AssetCard";
import { MediaZoom } from "@/components/assets/MediaZoom";
import { urlMiniature } from "@/lib/miniatures";
import { AssetPickerModal, type NoeudPicker } from "@/components/plan/AssetPickerModal";
import { useBrouillon } from "@/components/plan/BrouillonPlan";
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

type Type = RefLabel["type"];

const LABEL_TYPE: Record<Type, string> = { picture: "Picture", video: "Video", audio: "Audio" };
const NOM_TYPE: Record<Type, string> = { picture: "Image", video: "Vidéo", audio: "Audio" };

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

/** Les références du plan, en bande compacte au-dessus du prompt. « + Référence » : on choisit d'abord le genre (image, vidéo,
 * audio), puis l'asset dans la galerie. Ajouter ou retirer une référence réécrit le prompt côté serveur (déclaration, renumérotation) :
 * le brouillon du prompt est donc écrit juste avant (BrouillonPlan.avecSectionsEcrites), sinon il serait écrasé. */
export function RefsPanel({ planId, refs, masters }: { planId: number; refs: RefVue[]; masters: NoeudPicker[] }) {
  const b = useBrouillon();
  const [menu, setMenu] = useState(false);
  const [choix, setChoix] = useState<Type | null>(null);
  const [pending, startTransition] = useTransition();

  const parType = (t: Type) => refs.filter((r) => r.type === t).sort((a, b2) => a.slot - b2.slot);
  const dejaPris = new Set(choix ? parType(choix).flatMap((r) => (r.asset ? [r.asset.id] : [])) : []);
  const ordre: Type[] = ["picture", "video", "audio"];
  const triees = ordre.flatMap(parType);

  const onAjouter = (assetId: number) => {
    if (!choix) return;
    const type = choix;
    startTransition(async () => {
      await b.avecSectionsEcrites(() => ajouterRef(planId, type, assetId));
      setChoix(null);
    });
  };
  const onSupprimer = (refId: number) => {
    startTransition(async () => {
      await b.avecSectionsEcrites(() => supprimerRef(refId));
    });
  };

  return (
    <section className="panel fp-refs" id="fp-refs" aria-label="Références">
      <div className="panel-hd">
        <h2>Références</h2>
        <span className="eyebrow num">{ordre.map((t) => `${NOM_TYPE[t]} ${parType(t).length}/${MAX_REFS[t]}`).join(" · ")}</span>
        <div className="fp-menu fp-menu-droite" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMenu(false); }}>
          <button type="button" className="btn btn-ghost btn-sm" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu((m) => !m)} disabled={pending}>
            <Icone nom="ajouter" taille={15} /> Référence
          </button>
          {menu ? (
            <div className="fp-menu-pop" role="menu">
              {ordre.map((t) => {
                const plein = parType(t).length >= MAX_REFS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    className="fp-menu-item"
                    disabled={plein}
                    onClick={() => {
                      setMenu(false);
                      setChoix(t);
                    }}
                  >
                    {NOM_TYPE[t]} <span className="eyebrow">{plein ? "· maximum atteint" : `· <${LABEL_TYPE[t]} ${parType(t).length + 1}>`}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {triees.length > 0 ? (
        <div className="fp-refs-grille">
          {triees.map((r) => (
            <figure key={r.id} className="fp-ref" data-ref={`${LABEL_TYPE[r.type]} ${r.slot}`}>
              {r.asset ? <Miniature asset={r.asset} /> : <div className="ref-thumb is-vide" />}
              <figcaption>
                <span className="num fp-ref-label">
                  &lt;{LABEL_TYPE[r.type]} {r.slot}&gt;
                </span>
                <span className="asset-code">{r.asset?.code ?? "—"}</span>
                {r.asset && r.asset.statut !== "valide" ? (
                  <span className="fp-ref-statut">{r.asset.statut === "en_cours" ? "en cours" : "à produire"}</span>
                ) : null}
              </figcaption>
              <button type="button" className="ref-suppr" onClick={() => onSupprimer(r.id)} disabled={pending} aria-label={`Retirer <${LABEL_TYPE[r.type]} ${r.slot}>`}>
                <Icone nom="fermer" />
              </button>
            </figure>
          ))}
        </div>
      ) : (
        <p className="tiny-note fp-refs-vide">Aucune référence. « + Référence » ajoute une image, une vidéo ou un audio.</p>
      )}

      <AssetPickerModal
        ouvert={choix != null}
        titre={choix ? TITRE_GALERIE[choix] : ""}
        kind={choix ? KIND_PAR_TYPE[choix] : "image"}
        masters={masters}
        dejaPris={dejaPris}
        enCours={pending}
        onFermer={() => setChoix(null)}
        onValider={onAjouter}
      />
    </section>
  );
}
