"use client";

import "./brief.css";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { modifierChampBrief } from "@/app/agents/actions";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import type { VueBrief } from "@/lib/agents/types";

const CONTENU = [
  { nom: "Univers", detail: "Titre, arc, genre et ton, langue, durée d'un épisode" },
  { nom: "Style", detail: "Le style nommé et sa clause" },
  { nom: "Épisodes", detail: "Titre et résumé de chaque épisode" },
  { nom: "Personnages", detail: "Rôle, silhouette, voix" },
  { nom: "Lieux", detail: "Les décors récurrents" },
  { nom: "Contraintes", detail: "Continuité, rimes, progressions, pièges" },
  { nom: "Notes de l'agent", detail: "Ce qu'il a ajouté, ce qu'il se demande" },
  { nom: "Notes du projet", detail: "Tes notes libres" },
];

/** Le brief n'est pas encore rédigé (statut « partiel » : seuls le style et les notes ont pu être posés à la main).
 * Deux chemins : laisser l'agent le rédiger, ou poser l'essentiel soi-même. */
export function BriefVide({ projectId, nomProjet, brief }: { projectId: number; nomProjet: string; brief: VueBrief }) {
  const router = useRouter();
  const id = useId();
  const [nomStyle, setNomStyle] = useState(brief.contenu.style?.nom ?? "");
  const [clause, setClause] = useState(brief.contenu.style?.clause ?? "");
  const [notes, setNotes] = useState(brief.contenu.notes ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const enregistrer = async () => {
    setEnvoi(true);
    setMessage(null);
    try {
      const style = await modifierChampBrief(projectId, "style", { nom: nomStyle.trim(), clause: clause.trim() });
      if (!style.ok) throw new Error(style.erreur);
      const n = await modifierChampBrief(projectId, "notes", notes.trim());
      if (!n.ok) throw new Error(n.erreur);
      setMessage({ ok: true, texte: "Enregistré." });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Erreur inattendue." });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="bf-page">
      <section className="bf-vide-hero">
        <p className="bf-etiquette bf-in bf-d1">Brief du projet</p>
        <h1 className="bf-in bf-d2">Pas encore de brief</h1>
        <p className="bf-in bf-d3">
          Le brief, c&rsquo;est ce que l&rsquo;agent sait de ton projet : le ton, le style, les personnages, les lieux, la durée. Il le relit avant chaque demande. Tu peux le laisser l&rsquo;écrire, ou
          poser l&rsquo;essentiel toi-même.
        </p>
      </section>

      <section className="bf-deux-voies">
        <article className="bf-carte bf-voie is-principale bf-in bf-d4">
          <span className="bf-etiquette bf-or">Le plus rapide</span>
          <h2>Laisse l&rsquo;agent le rédiger</h2>
          <p>Raconte ton projet en quelques phrases. L&rsquo;agent propose chaque section ; tu relis, tu corriges, et rien n&rsquo;est écrit sans ton accord.</p>
          <div className="bf-voie-action">
            <BoutonAgent
              className="bf-btn bf-btn-or bf-btn-grand bf-press"
              libelle="Rédiger le brief avec l'agent"
              demande={{ projectId, portee: "projet", cible: null, profondeur: "complete", libelle: nomProjet }}
            />
          </div>
        </article>

        <article className="bf-carte bf-voie bf-in bf-d5">
          <span className="bf-etiquette">Ou à la main</span>
          <h2>Poser l&rsquo;essentiel</h2>
          <div className="bf-champ">
            <label htmlFor={`${id}-nom`}>Style nommé</label>
            <input id={`${id}-nom`} className="field" value={nomStyle} onChange={(e) => setNomStyle(e.target.value)} placeholder="Ex. Animation 2D peinte" />
          </div>
          <div className="bf-champ">
            <label htmlFor={`${id}-clause`}>Clause de style</label>
            <textarea
              id={`${id}-clause`}
              className="field field-mono"
              rows={3}
              value={clause}
              onChange={(e) => setClause(e.target.value)}
              placeholder="Ex. Hand-painted gouache illustration, soft grain, warm dusk palette…"
              spellCheck={false}
            />
            <p className="bf-aide">En anglais : ajoutée aux prompts de génération d&rsquo;images.</p>
          </div>
          <div className="bf-champ">
            <label htmlFor={`${id}-notes`}>Notes du projet</label>
            <textarea id={`${id}-notes`} className="field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="bf-voie-action">
            <button type="button" className="bf-btn bf-press" onClick={enregistrer} disabled={envoi}>
              {envoi ? "…" : "Enregistrer"}
            </button>
            {message ? (
              <span className={message.ok ? "bf-aide" : "bf-erreur"} role={message.ok ? "status" : "alert"}>
                {message.texte}
              </span>
            ) : null}
          </div>
        </article>
      </section>

      <section className="bf-section" aria-labelledby="bf-t-contenu">
        <h2 id="bf-t-contenu" className="bf-etiquette">
          Ce que contiendra le brief
        </h2>
        <div className="bf-apercu">
          {CONTENU.map((g) => (
            <div key={g.nom} className="bf-apercu-carte">
              <span>{g.nom}</span>
              <small>{g.detail}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
