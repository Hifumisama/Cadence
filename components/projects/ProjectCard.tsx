"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProjectListItem } from "@/lib/queries";
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

/** Carte projet : un clic la déplie (style, arc, durée, langue…), l'ouverture du projet se fait par le lien du volet déplié.
 * Le bouton de suppression est posé par la page, en frère de la carte. */
export function ProjectCard({ projet }: { projet: ProjectListItem }) {
  const [deplie, setDeplie] = useState(false);
  const total = totalBuckets(projet.buckets);
  const etat = ETAT_CARTE[phaseDe(projet.buckets)];
  // Des plans mais aucun asset : le projet ne peut pas avancer, on le fait remarquer.
  const sansAsset = total > 0 && projet.nbAssets === 0;
  const r = projet.resume;
  const href = projet.conceptionEnCours ? `/p/${projet.id}/demarrage` : `/p/${projet.id}`;

  const infos: { cle: string; label: string; valeur: string | null }[] = [
    { cle: "style", label: "Style", valeur: r?.style ?? null },
    { cle: "genre", label: "Genre et ton", valeur: r?.genreTon ?? null },
    { cle: "duree", label: "Durée", valeur: r?.dureeSecondes ? formaterDuree(r.dureeSecondes) : null },
    { cle: "langue", label: "Langue des dialogues", valeur: r?.langue ?? null },
    { cle: "univers", label: "Univers", valeur: r && (r.nbPersonnages > 0 || r.nbLieux > 0) ? `${r.nbPersonnages} personnage${r.nbPersonnages > 1 ? "s" : ""} · ${r.nbLieux} lieu${r.nbLieux > 1 ? "x" : ""}` : null },
  ];

  return (
    <div className={`proj-card${deplie ? " is-deplie" : ""}`}>
      <button type="button" className="proj-toggle" aria-expanded={deplie} aria-label={`${projet.nom} : ${deplie ? "replier" : "voir le détail"}`} onClick={() => setDeplie((d) => !d)}>
        <Poster src={projet.posterSrc} titre={projet.nom} cleRepli={`projet:${projet.id}`} taille="card" />
        <span className="proj-body">
          <span className="hd">
            <span className={`etat ${projet.conceptionEnCours ? "is-ecriture" : etat.classe}`}>{projet.conceptionEnCours ? "Conception en cours" : etat.label}</span>
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
            {deplie ? "Replier" : "Détails"}
            <span className="go" aria-hidden="true">{deplie ? "↑" : "↓"}</span>
          </span>
        </span>
      </button>
      {deplie ? (
        <div className="proj-detail">
          {r?.arc ? <p className="proj-arc">{r.arc}</p> : <p className="proj-arc is-vide">Pas encore d&rsquo;arc ni de synopsis.</p>}
          <dl className="proj-infos">
            {infos.map((i) => (
              <div key={i.cle}>
                <dt>{i.label}</dt>
                <dd className={i.valeur ? undefined : "is-vide"}>{i.valeur ?? "À définir"}</dd>
              </div>
            ))}
          </dl>
          <Link href={href} className="btn btn-gold proj-ouvrir" aria-label={projet.conceptionEnCours ? `${projet.nom} : reprendre la conception` : `Ouvrir ${projet.nom}`}>
            {projet.conceptionEnCours ? "Reprendre la conception" : "Ouvrir"} <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
