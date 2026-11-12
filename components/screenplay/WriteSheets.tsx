"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { demanderFichesPlans } from "@/app/demandes/actions";
import { Icone } from "@/components/ui/Icon";
import { romain, type SceneVue } from "@/lib/clips/screenplay-view";

const pad = (n: number) => String(n).padStart(2, "0");

/** Écrire les fiches des plans qui n'en ont pas : la liste des plans sans fiche, par scène, tous cochés ; on décoche ceux qu'on veut laisser, on lance.
 * Chaque plan devient sa propre demande « Générer la fiche » (une ligne par plan dans la file : préparation des références et images, puis compilation
 * Open H3 IR), écrite sans relecture et relue dans la page du plan. La popup se referme tout de suite : l'application reste navigable pendant l'écriture. */
export function EcrireFiches({
  projectId,
  groupes,
  ouvert,
  onFermer,
  onLance,
}: {
  projectId: number;
  groupes: SceneVue[];
  ouvert: boolean;
  onFermer: () => void;
  /** Les demandes sont posées (nombre de fiches lancées). */
  onLance: (n: number) => void;
}) {
  // Les plans à écrire, dans l'ordre du film ; ceux dont la fiche s'écrit déjà n'y sont pas.
  const lignes = groupes.flatMap((g, i) => g.plans.filter((p) => p.statut === "brouillon" && p.ficheEnCours == null).map((p) => ({ plan: p, scene: g.id != null ? `${romain(i + 1)} · ${g.titre}` : g.titre })));
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const fermer = () => {
    if (!envoi) onFermer();
  };
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;

  useEffect(() => {
    if (!ouvert) return;
    setExclus(new Set());
    setErreur(null);
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermerRef.current();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouvert]);

  if (!ouvert) return null;
  const choisis = lignes.filter((l) => !exclus.has(l.plan.uuid));
  const bascule = (uuid: string) =>
    setExclus((e) => {
      const n = new Set(e);
      if (n.has(uuid)) n.delete(uuid);
      else n.add(uuid);
      return n;
    });

  const lancer = async () => {
    if (envoi || choisis.length === 0) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await demanderFichesPlans(projectId, choisis.map((l) => l.plan.uuid));
      if (r.lancees === 0) {
        setErreur(r.erreurs[0] ?? "Aucune fiche n'a pu être lancée.");
        return;
      }
      onFermer();
      onLance(r.lancees);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Quelque chose a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  let sceneAffichee = "";
  return createPortal(
    <div className="sc-popup-fond" onClick={fermer}>
      <div className="sc-popup" role="dialog" aria-modal="true" aria-labelledby="ecrire-fiches-titre" onClick={(e) => e.stopPropagation()}>
        <div className="sc-popup-hd">
          <div>
            <span className="sc-tiroir-etiquette">Fiches de plan</span>
            <h2 id="ecrire-fiches-titre">Quels plans écrire ?</h2>
          </div>
          <button type="button" className="sc-tiroir-fermer" aria-label="Fermer" onClick={fermer}>
            <Icone nom="fermer" taille={16} />
          </button>
        </div>
        {lignes.length === 0 ? (
          <p className="tiny-note">Tous les plans ont déjà leur fiche, ou elle s&rsquo;écrit déjà.</p>
        ) : (
          <>
            <p className="tiny-note">
              La fiche de chaque plan coché s&rsquo;écrit en arrière-plan, dans l&rsquo;ordre du scénario : ses références sont choisies s&rsquo;il n&rsquo;en a pas (deux assets au plus créés), leurs
              images générées, puis Open H3 IR compile la fiche. Tu les relis ensuite dans la page de chaque plan.
            </p>
            <ul className="sc-fiches-liste">
              {lignes.map(({ plan, scene }) => {
                const entete = scene !== sceneAffichee;
                sceneAffichee = scene;
                return (
                  <li key={plan.uuid}>
                    {entete ? <span className="sc-fiches-scene">{scene}</span> : null}
                    <label className="sc-fiches-ligne">
                      <input type="checkbox" checked={!exclus.has(plan.uuid)} onChange={() => bascule(plan.uuid)} />
                      <span className="num">{pad(plan.position)}</span>
                      <span>{plan.titre}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {erreur ? (
          <p className="sc-ajout-erreur" role="alert">
            {erreur}
          </p>
        ) : null}
        <div className="sc-popup-pied">
          {lignes.length > 0 ? (
            <button type="button" className="btn btn-gold" onClick={() => void lancer()} disabled={envoi || choisis.length === 0}>
              {envoi ? "Envoi…" : choisis.length > 1 ? `Écrire les ${choisis.length} fiches` : "Écrire la fiche"}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={fermer} disabled={envoi}>
            {lignes.length > 0 ? "Annuler" : "Fermer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
