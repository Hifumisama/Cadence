"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { modifierEpisode } from "@/app/projects/actions";
import { Icone } from "@/components/ui/Icon";

/** The film's summary: what the story tells. It is the summary of the film's episode (`episodes.resume`), the same text the agents read:
 * one place to read and correct it. The arc, for its part, remains the brief's intent. */
export function ResumeFilm({ episodeId, resume, disabled }: { episodeId: number; resume: string; disabled?: boolean }) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(resume);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ouvrir = () => {
    setValeur(resume);
    setErreur(null);
    setEdition(true);
  };
  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await modifierEpisode(episodeId, { resume: valeur.trim() });
      setEdition(false);
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setEnvoi(false);
    }
  };

  if (edition) {
    return (
      <div className="bf-carte bf-edition">
        <div className="bf-editeur">
          <div className="bf-champ">
            <label htmlFor="bf-resume-saisie">Résumé du film</label>
            <textarea id="bf-resume-saisie" className="field" autoFocus rows={7} value={valeur} onChange={(e) => setValeur(e.target.value)} spellCheck />
          </div>
          {erreur ? (
            <p className="bf-erreur" role="alert">
              {erreur}
            </p>
          ) : null}
          <div className="bf-editeur-ft">
            <button type="button" className="bf-btn bf-btn-or bf-press" onClick={() => void enregistrer()} disabled={envoi}>
              {envoi ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" className="bf-btn bf-press" onClick={() => setEdition(false)} disabled={envoi}>
              Annuler
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!resume.trim()) {
    return (
      <div className="bf-vide-boite">
        <p>Pas encore de résumé. Il raconte l&rsquo;histoire du film : c&rsquo;est ce que lisent les agents pour écrire le scénario.</p>
        <button type="button" className="bf-btn bf-press" onClick={ouvrir} disabled={disabled}>
          <Icone nom="ajouter" taille={16} /> Ajouter un résumé
        </button>
      </div>
    );
  }

  return (
    <article className="bf-carte bf-cliquable bf-reveal bf-resume">
      {resume
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      <button type="button" className="bf-zone" aria-label="Modifier : le résumé" title={disabled ? "Enregistre ou annule la modification en cours" : "Modifier"} onClick={ouvrir} disabled={disabled}>
        <Icone nom="modifier" taille={18} />
      </button>
    </article>
  );
}
