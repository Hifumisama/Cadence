"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProjectListItem } from "@/lib/queries";
import { Icone } from "@/components/ui/Icone";
import { phaseDe, totalBuckets } from "@/lib/phase";
import { ProjectCard } from "./ProjectCard";
import { SupprimerProjetBouton } from "./SupprimerProjetBouton";

type Categorie = "conception" | "preparation" | "prod" | "fini";
type Tri = "recents" | "anciens" | "nom" | "avancement";

const CATEGORIES: { cle: Categorie; label: string }[] = [
  { cle: "conception", label: "En conception" },
  { cle: "preparation", label: "En préparation" },
  { cle: "prod", label: "En production" },
  { cle: "fini", label: "Terminés" },
];

const TRIS: { cle: Tri; label: string }[] = [
  { cle: "recents", label: "Plus récents" },
  { cle: "anciens", label: "Plus anciens" },
  { cle: "nom", label: "Nom (A → Z)" },
  { cle: "avancement", label: "Avancement" },
];

function categorieDe(p: ProjectListItem): Categorie {
  if (p.conceptionEnCours) return "conception";
  const phase = phaseDe(p.buckets);
  if (phase === "prod") return "prod";
  if (phase === "fini") return "fini";
  return "preparation";
}

/** Part de plans terminés, de 0 à 1 (0 sans plan). */
function avancement(p: ProjectListItem): number {
  const total = totalBuckets(p.buckets);
  return total === 0 ? 0 : p.buckets.termine / total;
}

/** Minuscules, sans accents : « Écriture » se trouve en tapant « ecri ». */
const normaliser = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** La grille des projets avec sa barre d'outils : recherche, filtre par état, tri. Le filtrage se fait ici, côté client :
 * la liste est courte et déjà chargée. */
export function ListeProjets({ projets }: { projets: ProjectListItem[] }) {
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [tri, setTri] = useState<Tri>("recents");

  const comptes = useMemo(() => {
    const c: Record<Categorie, number> = { conception: 0, preparation: 0, prod: 0, fini: 0 };
    for (const p of projets) c[categorieDe(p)] += 1;
    return c;
  }, [projets]);

  const visibles = useMemo(() => {
    const q = normaliser(recherche.trim());
    const liste = projets.filter((p) => {
      if (categorie && categorieDe(p) !== categorie) return false;
      if (!q) return true;
      const r = p.resume;
      return normaliser([p.nom, r?.arc, r?.style, r?.genreTon].filter(Boolean).join(" ")).includes(q);
    });
    const date = (p: ProjectListItem) => new Date(p.createdAt).getTime();
    const comparateurs: Record<Tri, (a: ProjectListItem, b: ProjectListItem) => number> = {
      recents: (a, b) => date(b) - date(a),
      anciens: (a, b) => date(a) - date(b),
      nom: (a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }),
      avancement: (a, b) => avancement(b) - avancement(a) || date(b) - date(a),
    };
    return liste.sort(comparateurs[tri]);
  }, [projets, recherche, categorie, tri]);

  const filtre = recherche.trim() !== "" || categorie !== null;
  const reinitialiser = () => {
    setRecherche("");
    setCategorie(null);
  };

  if (projets.length === 0) {
    return (
      <div className="accueil-vide">
        <h2>Aucun projet pour l&rsquo;instant</h2>
        <p>Un projet est un film : on y règle le style, la durée et la langue, puis un entretien en pose le brief.</p>
        <Link className="btn btn-gold" href="/nouveau">
          <Icone nom="ajouter" taille={15} /> Créer le premier projet
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="accueil-barre">
        <label className="accueil-recherche">
          <Icone nom="recherche" taille={16} />
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un projet…" aria-label="Rechercher un projet" />
        </label>
        <div className="accueil-filtres" role="group" aria-label="Filtrer par état">
          <button type="button" className="filtre-chip" aria-pressed={categorie === null} onClick={() => setCategorie(null)}>
            Tous <span>{projets.length}</span>
          </button>
          {CATEGORIES.filter((c) => comptes[c.cle] > 0).map((c) => (
            <button key={c.cle} type="button" className="filtre-chip" aria-pressed={categorie === c.cle} onClick={() => setCategorie(categorie === c.cle ? null : c.cle)}>
              {c.label} <span>{comptes[c.cle]}</span>
            </button>
          ))}
        </div>
        <label className="accueil-tri">
          <span>Trier</span>
          <select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
            {TRIS.map((t) => (
              <option key={t.cle} value={t.cle}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="proj-grid">
        {visibles.map((p) => (
          <div key={p.id} className="proj-cell">
            <ProjectCard projet={p} />
            <SupprimerProjetBouton projectId={p.id} nom={p.nom} compact />
          </div>
        ))}
        {!filtre ? (
          <Link href="/nouveau" className="proj-nouveau">
            <Icone nom="ajouter" taille={22} />
            <span>Nouveau projet</span>
          </Link>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <div className="accueil-vide is-compact">
          <p>Aucun projet ne correspond à cette recherche.</p>
          <button type="button" className="btn btn-ghost" onClick={reinitialiser}>
            Effacer les filtres
          </button>
        </div>
      ) : null}
    </>
  );
}
