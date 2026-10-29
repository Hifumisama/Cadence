"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectListItem } from "@/lib/queries";
import { Icone } from "@/components/ui/Icone";
import { Poster } from "@/components/ui/Poster";
import { PHASES, phaseDe, totalBuckets, type Phase } from "@/lib/phase";

/** État affiché sur la carte, dérivé des statuts de plans (jamais saisi). « Vide » parle au
 * système, pas à l'utilisateur : sur la carte, un projet sans plan est « À démarrer ». */
const ETAT_CARTE: Record<Phase, { label: string; classe: string }> = {
  vide: { label: "À démarrer", classe: "is-vide" },
  ecriture: { label: PHASES.ecriture.label, classe: "is-ecriture" },
  fiches: { label: PHASES.fiches.label, classe: "is-ecriture" },
  prod: { label: PHASES.prod.label, classe: "is-prod" },
  fini: { label: PHASES.fini.label, classe: "is-fini" },
};

/** 95 → « 1 min 35 s » ; 120 → « 2 min » ; 45 → « 45 s ». */
function formaterDuree(secondes: number): string {
  const min = Math.floor(secondes / 60);
  const s = Math.round(secondes % 60);
  if (min === 0) return `${s} s`;
  return s === 0 ? `${min} min` : `${min} min ${s} s`;
}

/** Carte projet : un clic ouvre un tiroir sur le côté (style, arc, durée, langue…), d'où l'on ouvre le projet.
 * Le bouton de suppression est posé par la page, en frère de la carte. */
export function ProjectCard({ projet }: { projet: ProjectListItem }) {
  const [ouvert, setOuvert] = useState(false);
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const total = totalBuckets(projet.buckets);
  const etat = ETAT_CARTE[phaseDe(projet.buckets)];
  const libelleEtat = projet.conceptionEnCours ? "Conception en cours" : etat.label;
  const classeEtat = projet.conceptionEnCours ? "is-ecriture" : etat.classe;
  // Des plans mais aucun asset : le projet ne peut pas avancer, on le fait remarquer.
  const sansAsset = total > 0 && projet.nbAssets === 0;
  const r = projet.resume;
  const href = projet.conceptionEnCours ? `/p/${projet.id}/demarrage` : `/p/${projet.id}`;

  // Tiroir ouvert : Échap le ferme, le fond de page ne défile plus, le focus passe au bouton de fermeture.
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    const defilement = document.body.style.overflow;
    document.addEventListener("keydown", echap);
    document.body.style.overflow = "hidden";
    boutonFermer.current?.focus();
    return () => {
      document.removeEventListener("keydown", echap);
      document.body.style.overflow = defilement;
    };
  }, [ouvert]);

  const univers = r && (r.nbPersonnages > 0 || r.nbLieux > 0) ? `${r.nbPersonnages} personnage${r.nbPersonnages > 1 ? "s" : ""} · ${r.nbLieux} lieu${r.nbLieux > 1 ? "x" : ""}` : null;
  const infos: { cle: string; label: string; valeur: string | null; large?: boolean }[] = [
    { cle: "style", label: "Style", valeur: r?.style ?? null, large: true },
    { cle: "genre", label: "Genre et ton", valeur: r?.genreTon ?? null, large: true },
    { cle: "duree", label: "Durée", valeur: r?.dureeSecondes ? formaterDuree(r.dureeSecondes) : null },
    { cle: "langue", label: "Dialogues", valeur: r?.langue ?? null },
    { cle: "univers", label: "Univers", valeur: univers, large: true },
  ];

  return (
    <div className={`proj-card${ouvert ? " is-ouverte" : ""}`}>
      <button type="button" className="proj-toggle" aria-haspopup="dialog" aria-label={`${projet.nom} : voir le détail`} onClick={() => setOuvert(true)}>
        <Poster src={projet.posterSrc} titre={projet.nom} cleRepli={`projet:${projet.id}`} taille="card" />
        <span className="proj-body">
          <span className="hd">
            <span className={`etat ${classeEtat}`}>{libelleEtat}</span>
          </span>
          <span className="stats">
            <span>
              <b>{total}</b>plan{total > 1 ? "s" : ""}
            </span>
            <span className={sansAsset ? "is-zero" : undefined} title={sansAsset ? "Ce projet a des plans mais aucun asset" : undefined}>
              <b>{projet.nbAssets}</b>asset{projet.nbAssets > 1 ? "s" : ""}
            </span>
          </span>
          <span className="ft">
            Détails
            <span className="go" aria-hidden="true">→</span>
          </span>
        </span>
      </button>

      {ouvert
        ? createPortal(
            <div className="tiroir-fond" onClick={() => setOuvert(false)}>
              <aside className="tiroir" role="dialog" aria-modal="true" aria-label={`Détails de ${projet.nom}`} onClick={(e) => e.stopPropagation()}>
                <button ref={boutonFermer} type="button" className="tiroir-fermer" onClick={() => setOuvert(false)} aria-label="Fermer">
                  <Icone nom="fermer" taille={18} />
                </button>

                <header className="tiroir-hd">
                  <div className="tiroir-affiche">
                    <Poster src={projet.posterSrc} titre={projet.nom} cleRepli={`projet:${projet.id}`} taille="card" />
                  </div>
                  <div className="tiroir-titre">
                    <span className={`etat ${classeEtat}`}>{libelleEtat}</span>
                    <h2>{projet.nom}</h2>
                    <span className="stats">
                      <span>
                        <b>{total}</b>plan{total > 1 ? "s" : ""}
                      </span>
                      <span className={sansAsset ? "is-zero" : undefined}>
                        <b>{projet.nbAssets}</b>asset{projet.nbAssets > 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                </header>

                <div className="tiroir-corps">
                  <section>
                    <h3 className="tiroir-etiquette">L&rsquo;arc</h3>
                    {r?.arc ? <p className="tiroir-arc">{r.arc}</p> : <p className="tiroir-arc is-vide">Pas encore d&rsquo;arc ni de synopsis.</p>}
                  </section>

                  <dl className="tiroir-infos">
                    {infos.map((i) => (
                      <div key={i.cle} className={i.large ? "is-large" : undefined}>
                        <dt>{i.label}</dt>
                        <dd className={i.valeur ? undefined : "is-vide"}>{i.valeur ?? "À définir"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <footer className="tiroir-pied">
                  <Link href={href} className="btn btn-gold">
                    {projet.conceptionEnCours ? "Reprendre la conception" : "Ouvrir le projet"} <span aria-hidden="true">→</span>
                  </Link>
                  {projet.conceptionEnCours ? null : (
                    <Link href={`/p/${projet.id}/brief`} className="btn btn-ghost">
                      Brief
                    </Link>
                  )}
                </footer>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
