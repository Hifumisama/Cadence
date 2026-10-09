"use client";

import { useMemo, useState } from "react";
import { libelleLangueMoteur } from "@/lib/langues-tts";
import type { EtatFiche } from "@/lib/voix";
import type { VoixCatalogueItem } from "@/lib/queries-voix";
import { VoixCard } from "./VoixCard";

type Filtre = "toutes" | EtatFiche | "clonee";

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "validee", libelle: "Validées" },
  { cle: "a_valider", libelle: "À valider" },
  { cle: "a_creer", libelle: "À créer" },
  { cle: "clonee", libelle: "Clonées" },
];

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La salle d'écoute : toutes les voix du projet en cartes larges, avec une recherche (nom, personnage, réplique d'écoute) et des
 * filtres d'état qui se combinent. Les données viennent de la page (serveur) ; ici seulement le tri à l'écran. */
export function SalleVoix({ projectId, voix }: { projectId: number; voix: VoixCatalogueItem[] }) {
  const [requete, setRequete] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("toutes");

  const affichees = useMemo(() => {
    const q = sansAccent(requete.trim());
    return voix.filter((v) => {
      const parEtat = filtre === "toutes" ? true : filtre === "clonee" ? v.source === "reference" : v.etat === filtre;
      if (!parEtat) return false;
      if (!q) return true;
      return sansAccent(`${v.nom} ${v.personnageNom ?? ""} ${v.refText}`).includes(q);
    });
  }, [voix, requete, filtre]);

  const compte = (f: Filtre) => voix.filter((v) => (f === "toutes" ? true : f === "clonee" ? v.source === "reference" : v.etat === f)).length;

  return (
    <>
      <div className="salle-outils">
        <input
          type="search"
          className="field salle-recherche"
          placeholder="Chercher une voix, un personnage…"
          aria-label="Chercher une voix"
          value={requete}
          onChange={(e) => setRequete(e.target.value)}
        />
        <div className="salle-filtres" role="group" aria-label="Filtrer les voix">
          {FILTRES.map((f) => (
            <button key={f.cle} type="button" className="cn-puce-salle" aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
              {f.libelle}
              <small>{compte(f.cle)}</small>
            </button>
          ))}
        </div>
        <span className="tiny-note salle-compte" aria-live="polite">
          {affichees.length} voix
        </span>
      </div>

      {affichees.length === 0 ? (
        <p className="tiny-note" style={{ padding: "var(--sp-4)" }}>
          Aucune voix ne correspond.
        </p>
      ) : (
        <div className="voix-grid voix-liste" role="list" aria-label="Fiches vocales">
          {affichees.map((v) => (
            <div key={v.id} role="listitem" className="voix-liste-item">
              <VoixCard
                assetId={v.id}
                href={`/p/${projectId}/voix/${v.code}`}
                nom={v.nom}
                etat={v.etat}
                critique={v.critique}
                langue={libelleLangueMoteur(v.langue)}
                personnageNom={v.personnageNom}
                refText={v.refText}
                referenceSrc={v.referenceSrc}
                referenceFichier={v.fichier}
                nbRepliques={v.nbRepliques}
                suppression={v.suppression}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
