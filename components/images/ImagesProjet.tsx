"use client";

import "./images.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { genererImagesManquantes } from "@/app/assets/generation-actions";
import { etapesSuivantes, libelleGenererImages, prochaineEtape, type EtatImages } from "@/lib/images-projet";

/** Sondage de l'état des images d'un projet (/api/images/<id>) : toutes les 3 s tant que des images sont en file, sinon toutes les 10 s.
 * `recharger` force une lecture (après un lancement). */
export function useEtatImages(projectId: number, initial: EtatImages | null): { etat: EtatImages | null; recharger: () => Promise<void> } {
  const [etat, setEtat] = useState<EtatImages | null>(initial);
  const enVol = useRef(false);

  const recharger = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch(`/api/images/${projectId}`, { cache: "no-store" });
      if (res.ok) setEtat(((await res.json()) as { images: EtatImages }).images);
    } catch {
      /* serveur qui redémarre : au prochain tour */
    } finally {
      enVol.current = false;
    }
  }, [projectId]);

  const actif = (etat?.enFile ?? 0) > 0;
  useEffect(() => {
    const t = setInterval(() => void recharger(), actif ? 3000 : 10000);
    return () => clearInterval(t);
  }, [recharger, actif]);

  return { etat, recharger };
}

/** « Générer les N images » : demande confirmation (ces générations occupent la machine locale), puis met tout en file. Rien ne s'affiche
 * quand il n'y a rien à lancer. */
export function BoutonGenererImages({ projectId, etat, recharger, petit = false }: { projectId: number; etat: EtatImages; recharger: () => Promise<void>; petit?: boolean }) {
  const [confirmer, setConfirmer] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const taille = petit ? " btn-sm" : "";

  const lancer = () =>
    startTransition(async () => {
      const r = await genererImagesManquantes(projectId);
      setConfirmer(false);
      if (!r.ok) {
        setRetour({ ok: false, texte: r.erreur });
      } else {
        const ecartes = r.ecartes.length ? ` · ${r.ecartes.length} à relancer plus tard : ${r.ecartes.map((e) => `${e.code} (${e.raison})`).join(" ; ")}` : "";
        setRetour({ ok: true, texte: `${r.lancees} génération${r.lancees > 1 ? "s" : ""} en file${ecartes}` });
      }
      await recharger();
    });

  if (etat.aLancer === 0 && !retour) return null;

  return (
    <div className="im-lancer">
      {confirmer ? (
        <div className="im-confirm" role="alertdialog" aria-label="Confirmer la génération des images">
          <p>
            <b>{etat.aLancer === 1 ? "1 image" : `${etat.aLancer} images`}</b> vont être fabriquées par ta machine locale, l’une après l’autre : elle sera occupée un moment. Tu peux quitter la page, la suite se
            suit dans la file (en haut à droite).
          </p>
          <div className="im-confirm-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmer(false)} disabled={pending}>
              Annuler
            </button>
            <button type="button" className="btn btn-gold btn-sm" onClick={lancer} disabled={pending}>
              {pending ? "Mise en file…" : "Lancer"}
            </button>
          </div>
        </div>
      ) : etat.aLancer > 0 ? (
        <button type="button" className={`btn btn-gold${taille}`} onClick={() => { setRetour(null); setConfirmer(true); }}>
          {libelleGenererImages(etat.aLancer)}
        </button>
      ) : null}
      {retour ? (
        <p className="im-retour" role="status" style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
          {retour.texte}
        </p>
      ) : null}
    </div>
  );
}

/** Ligne de progression : « 3 sur 12 ont une image · 2 en file · 1 attend l’image de son master ». */
export function ProgressionImages({ etat }: { etat: EtatImages }) {
  const pct = etat.total ? Math.round((etat.avecImage / etat.total) * 100) : 0;
  const notes = [
    etat.enFile > 0 ? `${etat.enFile} en file ou en cours` : null,
    etat.attendentMaitre > 0 ? `${etat.attendentMaitre} attend${etat.attendentMaitre > 1 ? "ent" : ""} l’image de départ : à relancer ensuite` : null,
    etat.sansPrompt > 0 ? `${etat.sansPrompt} sans description à écrire` : null,
  ].filter(Boolean);
  return (
    <>
      <p className="im-compte">
        <b>{etat.avecImage}</b> sur {etat.total} ont une image
        {notes.length > 0 ? <span> · {notes.join(" · ")}</span> : null}
      </p>
      <div className="im-barre" role="progressbar" aria-valuemin={0} aria-valuemax={etat.total} aria-valuenow={etat.avecImage} aria-label="Images de référence">
        <i style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

/** Bandeau « Prochaine étape » de la page d'un projet : la première étape non terminée de `etapesSuivantes` (aujourd'hui, les images de
 * référence). Il disparaît quand tout est fait. D'autres étapes (voix, plans) s'ajouteront à cette liste sans toucher au bandeau. */
export function BandeauProchaineEtape({ projectId, initial }: { projectId: number; initial: EtatImages }) {
  const { etat, recharger } = useEtatImages(projectId, initial);
  if (!etat) return null;
  const etape = prochaineEtape(etapesSuivantes(projectId, etat));
  if (!etape) return null;
  return (
    <section className="im-bandeau" aria-label="Prochaine étape">
      <div className="im-bandeau-texte">
        <p className="im-eyebrow">Prochaine étape</p>
        <h2>{etape.titre}</h2>
        {etape.cle === "images" ? <ProgressionImages etat={etat} /> : null}
      </div>
      <div className="im-bandeau-actions">
        <Link href={etape.href} className="btn btn-ghost">
          {etape.libelleLien}
        </Link>
        {etape.cle === "images" ? <BoutonGenererImages projectId={projectId} etat={etat} recharger={recharger} /> : null}
      </div>
    </section>
  );
}
