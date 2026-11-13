"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type MouseEvent } from "react";
import { ajouterRef, supprimerRef } from "@/app/plans/actions";
import { MAX_REFS, type RefLabel } from "@/lib/clips/clip-checks";
import type { MediaKind } from "@/components/assets/AssetCard";
import { MediaZoom } from "@/components/assets/MediaZoom";
import { urlMiniature } from "@/lib/thumbnails";
import { AssetPickerModal, type NoeudPicker } from "@/components/clip/AssetPickerModal";
import { Icone } from "@/components/ui/Icon";
import "../plan/atelier.css";

/** Double-click delay: a single click on an image (zoom) waits this delay to let a possible second click through. */
const DELAI_DOUBLE_CLIC_MS = 260;

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

const LABEL_TYPE: Record<Type, string> = { picture: "Picture", video: "Video" };
const NOM_TYPE: Record<Type, string> = { picture: "Image", video: "Vidéo" };
const NOM_TYPE_PLURIEL: Record<Type, string> = { picture: "Images", video: "Vidéos" };

// Expected media kind for each reference type.
const KIND_PAR_TYPE: Record<Type, MediaKind> = { picture: "image", video: "video" };

const TITRE_GALERIE: Record<Type, string> = {
  picture: "Choisir une image de référence",
  video: "Choisir une vidéo de référence",
};

function Miniature({ asset }: { asset: NonNullable<RefVue["asset"]> }) {
  if (asset.etat !== "ok" || !asset.src) {
    return (
      <div className="ref-thumb is-vide">
        <span className="tiny-note">{asset.etat === "manquant" ? "introuvable" : "sans fichier"}</span>
      </div>
    );
  }
  // Image and video: can be enlarged full screen (MediaZoom).
  return (
    <MediaZoom
      kind={asset.kind === "video" ? "video" : "image"}
      src={asset.src}
      apercu={asset.kind === "image" ? urlMiniature(asset.src, 192) : undefined}
      alt={asset.code}
      classe="ref-thumb"
    />
  );
}

/** The clip's references, beside the player: BOXES, one per slot that H3 accepts (6 images, 2 videos). A filled box shows the
 * image, or the video (enlargeable), with its `<Picture 1>` label as cited in the prompt; an empty box offers to put a
 * registry asset in it. Adding or removing a reference rewrites the prompt server-side (declaration, renumbering). */
export function ReferencesCases({ planId, projectId, refs, assets }: { planId: number; projectId: number; refs: RefVue[]; assets: NoeudPicker[] }) {
  const router = useRouter();
  const [choix, setChoix] = useState<Type | null>(null);
  const hrefAsset = (code: string) => `/p/${projectId}/assets/${code}`;

  // Double-click on a filled box: the asset's sheet. A single click on an image opens the zoom (MediaZoom): it is held for a moment (capture) so that
  // a second click cancels it, then replayed as is. Clicks inside the zoom window, on a video (its controls) or on a button are not concerned.
  const minuteurZoom = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejoue = useRef(false);
  useEffect(() => () => void (minuteurZoom.current && clearTimeout(minuteurZoom.current)), []);
  const retenirZoom = (e: MouseEvent<HTMLElement>) => {
    if (rejoue.current) {
      rejoue.current = false;
      return;
    }
    const cible = e.target as HTMLElement;
    if (!cible.classList.contains("zoom-trigger") || cible.closest("dialog")) return;
    e.stopPropagation();
    e.preventDefault();
    if (minuteurZoom.current) {
      // Second click: it is a double-click, the zoom will not happen.
      clearTimeout(minuteurZoom.current);
      minuteurZoom.current = null;
      return;
    }
    minuteurZoom.current = setTimeout(() => {
      minuteurZoom.current = null;
      rejoue.current = true;
      cible.click();
    }, DELAI_DOUBLE_CLIC_MS);
  };
  const ouvrirAsset = (e: MouseEvent<HTMLElement>, code: string) => {
    const cible = e.target as HTMLElement;
    if (cible.closest("dialog, video, button, a")) return;
    if (minuteurZoom.current) {
      clearTimeout(minuteurZoom.current);
      minuteurZoom.current = null;
    }
    router.push(hrefAsset(code));
  };
  const [slotChoisi, setSlotChoisi] = useState<number | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const parType = (t: Type) => refs.filter((r) => r.type === t).sort((a, b2) => a.slot - b2.slot);
  const dejaPris = new Set(choix ? parType(choix).flatMap((r) => (r.asset ? [r.asset.id] : [])) : []);
  const ordre: Type[] = ["picture", "video"];

  const onAjouter = (assetId: number) => {
    if (!choix) return;
    const type = choix;
    startTransition(async () => {
      await ajouterRef(planId, type, assetId, slotChoisi);
      setChoix(null);
      setSlotChoisi(undefined);
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
        const parSlot = new Map(parType(t).map((r) => [r.slot, r]));
        const nb = parType(t).length;
        return (
          <div key={t} className="fp-refs-groupe">
            <span className="eyebrow num">
              {NOM_TYPE_PLURIEL[t]} {nb}/{MAX_REFS[t]}
            </span>
            <div className="fp-cases">
              {Array.from({ length: MAX_REFS[t] }, (_, i) => i + 1).map((n) => {
                const r = parSlot.get(n);
                if (!r) {
                  return (
                    <button
                      key={`vide-${n}`}
                      type="button"
                      className="fp-case is-vide"
                      disabled={pending}
                      onClick={() => {
                        setSlotChoisi(n);
                        setChoix(t);
                      }}
                      aria-label={`Ajouter ${NOM_TYPE[t].toLowerCase()} <${LABEL_TYPE[t]} ${n}>`}
                    >
                      <Icone nom="ajouter" taille={18} />
                      <span className="num">
                        &lt;{LABEL_TYPE[t]} {n}&gt;
                      </span>
                    </button>
                  );
                }
                return (
                  <figure
                    key={r.id}
                    className="fp-case is-pleine"
                    data-ref={`${LABEL_TYPE[r.type]} ${r.slot}`}
                    title={r.asset ? "Double-clic : ouvrir la fiche de l'asset" : undefined}
                    onClickCapture={r.asset ? retenirZoom : undefined}
                    onDoubleClick={r.asset ? (e) => ouvrirAsset(e, r.asset!.code) : undefined}
                  >
                    {r.asset ? <Miniature asset={r.asset} /> : <div className="ref-thumb is-vide" />}
                    <figcaption>
                      <span className="num fp-ref-label">
                        &lt;{LABEL_TYPE[r.type]} {r.slot}&gt;
                      </span>
                      {r.asset ? (
                        <Link href={hrefAsset(r.asset.code)} className="asset-code pl-asset-lien" title={`Ouvrir la fiche de ${r.asset.code}`}>
                          {r.asset.libelle}
                        </Link>
                      ) : (
                        <span className="asset-code">—</span>
                      )}
                      {r.asset && r.asset.statut !== "valide" ? <span className="fp-ref-statut">{r.asset.statut === "en_cours" ? "à valider" : "à produire"}</span> : null}
                    </figcaption>
                    <button type="button" className="ref-suppr" onClick={() => onSupprimer(r.id)} disabled={pending} aria-label={`Retirer <${LABEL_TYPE[r.type]} ${r.slot}>`}>
                      <Icone nom="fermer" />
                    </button>
                  </figure>
                );
              })}
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
        onFermer={() => {
          setChoix(null);
          setSlotChoisi(undefined);
        }}
        onValider={onAjouter}
      />
    </section>
  );
}
