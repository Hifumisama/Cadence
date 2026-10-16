"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deposerSourceImport } from "@/app/assets/generation-actions";
import type { ImageJointe } from "@/app/assets/essai-actions";
import { Icone } from "@/components/ui/Icone";
import { urlMiniature } from "@/lib/miniatures";

/** Une image jointe à la consigne, avec de quoi l'afficher. */
export type Jointe = ImageJointe & { cle: string; src: string; libelle: string };

/** Une image du registre qu'on peut joindre. */
export type JointeDisponible = { id: number; libelle: string; src: string };

/** Les images qu'on joint à une consigne (Qwen Image Edit en prend jusqu'à 3). Créer : trois places, la 1re « porte » les modifications des deux
 * autres. Retoucher : l'image de base occupe la place 1, il en reste deux. On joint une image du registre ou une image déposée. */
export function ImagesJointes({
  assetId,
  base,
  jointes,
  max,
  registre,
  desactive,
  onChange,
}: {
  assetId: number;
  /** L'image de base d'une retouche (la place 1), null pour une création. */
  base: { src: string; libelle: string } | null;
  jointes: Jointe[];
  /** Combien d'images jointes (hors base) tiennent. */
  max: number;
  registre: JointeDisponible[];
  desactive: boolean;
  onChange: (suite: Jointe[]) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, startEnvoi] = useTransition();
  const racine = useRef<HTMLDivElement>(null);
  const fichier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) return;
    const dehors = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setMenu(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [menu]);

  const decalage = base ? 2 : 1; // le rang de la première image jointe
  const places = Math.max(max, jointes.length);
  const plein = jointes.length >= max;

  const ajouter = (j: Jointe) => {
    if (jointes.length >= max) return;
    onChange([...jointes, j]);
    setMenu(false);
  };

  const deposer = (f: File) => {
    setErreur(null);
    startEnvoi(async () => {
      const fd = new FormData();
      fd.append("fichier", f);
      const r = await deposerSourceImport(assetId, fd);
      if (!r.ok) return setErreur(r.erreur);
      ajouter({ origine: "import", fichier: r.fichier, cle: r.fichier, src: r.src, libelle: f.name });
    });
  };

  const enPremier = (i: number) => onChange([jointes[i]!, ...jointes.filter((_, k) => k !== i)]);

  return (
    <div className="jt" ref={racine}>
      <div className="jt-rang">
        {base ? (
          <figure className="jt-case base" title={`Image 1 : ${base.libelle}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlMiniature(base.src, 192)} alt="" />
            <figcaption>
              <b>1</b> base
            </figcaption>
          </figure>
        ) : null}
        {Array.from({ length: places }, (_, i) => {
          const j = jointes[i];
          const rang = decalage + i;
          if (!j) {
            // La première place libre est le bouton d'ajout ; les suivantes sont de simples emplacements.
            const premiereLibre = i === jointes.length;
            return premiereLibre ? (
              <button key={`libre-${i}`} type="button" className="jt-case libre" onClick={() => setMenu((o) => !o)} disabled={desactive || envoi} aria-expanded={menu} aria-haspopup="menu">
                <Icone nom="ajouter" taille={18} />
                <span>{envoi ? "Envoi…" : base ? "Ajouter une image" : i === 0 ? "Partir d'une image" : "Ajouter"}</span>
              </button>
            ) : (
              <span key={`libre-${i}`} className="jt-case vide" aria-hidden="true" />
            );
          }
          return (
            <figure key={j.cle} className="jt-case" title={`Image ${rang} : ${j.libelle}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={j.origine === "import" ? j.src : urlMiniature(j.src, 192)} alt="" />
              <figcaption>
                <b>{rang}</b> {rang === 1 ? "porte les changements" : "référence"}
              </figcaption>
              <button type="button" className="jt-x" onClick={() => onChange(jointes.filter((_, k) => k !== i))} disabled={desactive} aria-label={`Retirer l'image ${rang}`} title="Retirer">
                <Icone nom="fermer" taille={12} />
              </button>
              {!base && i > 0 ? (
                <button type="button" className="jt-un" onClick={() => enPremier(i)} disabled={desactive} title="La mettre en image 1 : c'est elle qui porte les changements">
                  en 1
                </button>
              ) : null}
            </figure>
          );
        })}
      </div>

      {menu && !plein ? (
        <div className="jt-menu" role="menu">
          <button type="button" role="menuitem" className="jt-import" onClick={() => fichier.current?.click()}>
            <Icone nom="importer" taille={15} /> Importer une image…
          </button>
          {registre.length > 0 ? (
            <>
              <p className="jt-titre">Ou une image du registre</p>
              <div className="jt-grille">
                {registre.map((a) => {
                  const dejaLa = jointes.some((j) => j.origine === "asset" && j.assetId === a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      className="jt-vign"
                      disabled={dejaLa}
                      onClick={() => ajouter({ origine: "asset", assetId: a.id, cle: `asset-${a.id}`, src: a.src, libelle: a.libelle })}
                      title={a.libelle}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urlMiniature(a.src, 192)} alt="" loading="lazy" decoding="async" />
                      <span>{a.libelle}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <input
        ref={fichier}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) deposer(f);
        }}
      />
      {erreur ? (
        <p className="retour ko" role="alert">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
