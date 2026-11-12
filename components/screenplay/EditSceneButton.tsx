"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { modifierScene } from "@/app/scenario/actions";
import { Icone } from "@/components/ui/Icon";
import { ChampsReglagesCamera } from "@/components/h3ir/CameraSettingsFields";
import type { DemoDispo } from "@/lib/h3ir/demos";
import { resoudreReglages, type ReglagesBruts } from "@/lib/h3ir/settings";

/** Bouton « Modifier » d'une scène : titre, description et ambiance, dans une popup (même écrin que « Ajouter un plan »). */
export function ModifierSceneButton({
  sceneId,
  titre,
  fonction,
  ambiance = "",
  creativite = "",
  styleCamera = "",
  reglagesProjet,
  demos,
}: {
  sceneId: number;
  titre: string;
  fonction: string;
  ambiance?: string;
  /** Open H3 IR : vide = la scène hérite du projet. */
  creativite?: string;
  styleCamera?: string;
  /** Les réglages du projet : ce que la scène hérite si elle ne règle rien. */
  reglagesProjet: ReglagesBruts;
  /** Les vidéos de démo de la mise en scène (lib/media.ts, `demosMiseEnScene`). */
  demos?: Record<string, DemoDispo>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [t, setT] = useState(titre);
  const [f, setF] = useState(fonction);
  const [a, setA] = useState(ambiance);
  const [cr, setCr] = useState(creativite);
  const [sc, setSc] = useState(styleCamera);
  const [pending, startTransition] = useTransition();
  const champTitre = useRef<HTMLInputElement>(null);

  const ouvrir = () => {
    setT(titre);
    setF(fonction);
    setA(ambiance);
    setCr(creativite);
    setSc(styleCamera);
    setOuvert(true);
  };
  const fermer = () => {
    if (!pending) setOuvert(false);
  };
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;

  // Ouverte : Échap ferme, le focus passe au titre.
  useEffect(() => {
    if (!ouvert) return;
    champTitre.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermerRef.current();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouvert]);

  const enregistrer = () => {
    if (!t.trim()) return;
    startTransition(async () => {
      await modifierScene(sceneId, { titre: t, fonction: f, ambiance: a, creativite: cr || null, styleCamera: sc || null });
      setOuvert(false);
      router.refresh();
    });
  };

  return (
    <>
      {!ambiance ? (
        <button className="btn btn-ghost btn-sm" type="button" onClick={ouvrir} title="L'ambiance tient le cadre visuel de la scène">
          + Ambiance
        </button>
      ) : null}
      <button className="btn btn-ghost btn-sm" type="button" onClick={ouvrir}>
        Modifier
      </button>
      {ouvert
        ? createPortal(
            <div className="sc-popup-fond" onClick={fermer}>
              <div className="sc-popup" role="dialog" aria-modal="true" aria-labelledby="modif-scene-titre" onClick={(e) => e.stopPropagation()}>
                <header className="sc-popup-hd">
                  <div>
                    <span className="sc-tiroir-etiquette">Scène</span>
                    <h2 id="modif-scene-titre">Modifier la scène</h2>
                  </div>
                  <button type="button" className="sc-tiroir-fermer" onClick={fermer} disabled={pending} aria-label="Fermer">
                    <Icone nom="fermer" taille={18} />
                  </button>
                </header>

                <p className="tiny-note">
                  Ces retouches ne changent que la fiche d&rsquo;identité de la scène : ses plans restent tels quels. Pour la réécrire, crée une nouvelle scène à côté, puis supprime celle-ci.
                </p>

                <div className="form-grid">
                  <div className="field-group wide">
                    <label htmlFor="modif-scene-champ-titre">Titre</label>
                    <input
                      id="modif-scene-champ-titre"
                      ref={champTitre}
                      className="field"
                      value={t}
                      onChange={(e) => setT(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && enregistrer()}
                    />
                  </div>
                  <div className="field-group wide">
                    <label htmlFor="modif-scene-champ-fonction">Ce que la scène fait dans le récit</label>
                    <textarea id="modif-scene-champ-fonction" className="field" rows={4} value={f} onChange={(e) => setF(e.target.value)} />
                  </div>
                  <div className="field-group wide">
                    <label htmlFor="scene-ambiance">Ambiance</label>
                    <input
                      id="scene-ambiance"
                      className="field"
                      value={a}
                      onChange={(e) => setA(e.target.value)}
                      placeholder="Ex. plein jour, ciel dégagé — tenue sur toute la scène"
                    />
                  </div>
                  <ChampsReglagesCamera creativite={cr} styleCamera={sc} onCreativite={setCr} onStyleCamera={setSc} heritage={resoudreReglages({ projet: reglagesProjet })} idPrefixe="scene" demos={demos} />
                </div>

                <footer className="sc-popup-pied">
                  <button className="btn btn-gold" type="button" onClick={enregistrer} disabled={pending || !t.trim()}>
                    {pending ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={fermer} disabled={pending}>
                    Annuler
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
