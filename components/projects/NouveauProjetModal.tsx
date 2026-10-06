"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { creerProjet, creerProjetSansRedirection } from "@/app/projects/actions";
import { useAgents } from "@/components/agents/AgentsProvider";
import { Icone } from "@/components/ui/Icone";

export function NouveauProjetModal() {
  const router = useRouter();
  const { ouvrirAgent } = useAgents();
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<"oneshot" | "serie" | null>(null);
  const [nom, setNom] = useState("");
  const [avecPremierEpisode, setAvecPremierEpisode] = useState(true);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const fermer = () => {
    setOuvert(false);
    setType(null);
    setNom("");
    setErreur(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!type || !nom.trim()) return;
    setErreur(null);
    startTransition(async () => {
      try {
        await creerProjet({ nom: nom.trim(), type, avecPremierEpisode });
        // Succès : creerProjet redirige côté serveur, pas de retour ici.
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de la création.");
      }
    });
  };

  // « Créer avec l'agent » : le projet est créé vide (sans premier épisode : le squelette
  // de la proposition crée saison et épisodes), puis la popup d'agent s'ouvre en profondeur
  // complète sur ce projet.
  const avecAgent = () => {
    if (!type || !nom.trim()) return;
    setErreur(null);
    startTransition(async () => {
      try {
        const { projectId } = await creerProjetSansRedirection({ nom: nom.trim(), type, avecPremierEpisode: false });
        const titre = nom.trim();
        fermer();
        router.push(`/p/${projectId}`);
        ouvrirAgent({ projectId, portee: "projet", cible: null, profondeur: "complete", libelle: titre });
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de la création.");
      }
    });
  };

  return (
    <>
      <button className="btn btn-gold" type="button" onClick={() => setOuvert(true)}>
        <Icone nom="ajouter" taille={15} /> Nouveau projet
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={fermer}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Nouveau projet</h2>
              <button className="modal-close" type="button" onClick={fermer} aria-label="Fermer">
                <Icone nom="fermer" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="modal-bd form-grid">
              <div className="field-group wide">
                <span className="lbl">Forme du projet</span>
                <div className="choices" role="radiogroup">
                  <label className="choice">
                    <input type="radio" name="type" checked={type === "oneshot"} onChange={() => setType("oneshot")} />
                    <span className="t">OneShot</span>
                    <span className="d">Un seul film. Pas de saisons ni d&rsquo;épisodes : le projet s&rsquo;ouvre directement sur son Scénario.</span>
                    <span className="shape">Projet → Scénario · Assets · Plans</span>
                  </label>
                  <label className="choice">
                    <input type="radio" name="type" checked={type === "serie"} onChange={() => setType("serie")} />
                    <span className="t">Série</span>
                    <span className="d">Des saisons et des épisodes. Chaque épisode a ses propres plans, réordonnables par glisser-déposer.</span>
                    <span className="shape">Projet → Saison → Épisode → …</span>
                  </label>
                </div>
              </div>
              <div className="field-group wide">
                <label htmlFor="np-nom">Nom du projet</label>
                <input
                  className="field"
                  id="np-nom"
                  name="nom"
                  placeholder="Ex. Nuit de Tanger"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {type === "serie" ? (
                <div className="field-group wide">
                  <label className="chk">
                    <input type="checkbox" checked={avecPremierEpisode} onChange={(e) => setAvecPremierEpisode(e.target.checked)} />
                    Créer tout de suite S01 · E01 (vides)
                  </label>
                </div>
              ) : type === "oneshot" ? (
                <p className="tiny-note wide">Une saison et un épisode techniques sont créés en arrière-plan. Ils n&rsquo;apparaîtront jamais dans la navigation.</p>
              ) : (
                <p className="tiny-note wide">Choisir la forme du projet. Elle ne pourra pas être changée ensuite.</p>
              )}
              <div className="form-actions wide">
                <button className="btn btn-gold" type="submit" disabled={pending || !type || !nom.trim()}>
                  {pending ? "..." : type === "oneshot" ? "Créer et ouvrir le Scénario" : "Créer la série"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={avecAgent} disabled={pending || !type || !nom.trim()} title="Crée le projet vide, puis ouvre la conversation avec l'agent">
                  Créer avec l&rsquo;agent <Icone nom="agent" taille={14} />
                </button>
                <button className="btn btn-ghost" type="button" onClick={fermer}>
                  Annuler
                </button>
                {erreur ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span> : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
