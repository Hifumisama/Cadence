"use client";

import { useState } from "react";
import { PromptImportColle } from "@/components/plan/PromptImportColle";
import { useBrouillon } from "@/components/plan/BrouillonPlan";
import { extraireLabels } from "@/lib/plan-checks";

const SECTIONS_ORDRE = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
];

/** Éclaire la carte de référence dont on survole la citation (`<Picture 2>`). */
function eclairer(label: string | null) {
  document.querySelectorAll(".fp-ref.is-eclairee").forEach((e) => e.classList.remove("is-eclairee"));
  if (!label) return;
  document.querySelector(`.fp-ref[data-ref="${label}"]`)?.classList.add("is-eclairee");
}

const NOM_SECTION: Record<string, string> = {
  subject_definitions: "Sujets",
  summary: "Résumé",
  retention_analysis: "Références et fidélité",
  detailed_description: "Description détaillée",
  overall_soundscape: "Ambiance sonore",
  non_diegetic_music: "Musique",
};

/** Une section du prompt, en lecture : le nom français, un extrait, et le texte entier quand on l'ouvre. Le prompt ne s'édite pas ici (c'est « Itérer »
 * qui le réécrit) ; pour le faire retoucher ailleurs, on le copie en entier ou on colle le prompt retouché. */
function Section({ section, ouvert, onBascule, declarees }: { section: string; ouvert: boolean; onBascule: () => void; declarees: Set<string> }) {
  const b = useBrouillon();
  const contenu = b.sectionFigee(section);
  const cites = extraireLabels(contenu);

  return (
    <div className={`fp-sec${ouvert ? " is-ouvert" : ""}`}>
      <button type="button" className="fp-sec-hd" aria-expanded={ouvert} onClick={onBascule} title={section}>
        <span className="fp-sec-car" aria-hidden="true">›</span>
        <span className="fp-sec-nom">{NOM_SECTION[section] ?? section}</span>
        <span className="fp-sec-apercu">{contenu}</span>
      </button>
      {ouvert ? (
        <div className="fp-sec-bd">
          <pre className="fp-sec-texte">{contenu || "(vide)"}</pre>
          {cites.length > 0 ? (
            <div className="fp-cites">
              <span className="eyebrow">Cite</span>
              {cites.map((c) => {
                const orpheline = !declarees.has(c);
                return (
                  <span
                    key={c}
                    className={`fp-cite num${orpheline ? " is-orpheline" : ""}`}
                    onMouseEnter={() => eclairer(c)}
                    onMouseLeave={() => eclairer(null)}
                  >
                    &lt;{c}&gt;{orpheline ? " non déclarée" : ""}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Le prompt H3 en six sections, toutes repliées au départ, en lecture : on le copie en entier, ou on colle un prompt retouché ailleurs (il remplace
 * les six sections). `declarees` : les labels des références du plan (« Picture 1 »). `essai` : ce qui avait été envoyé pour l'essai affiché. */
export function PromptBloc({
  planId,
  declarees,
  promptComplet,
  essai,
}: {
  planId: number;
  declarees: string[];
  promptComplet: string;
  essai: { numero: number; prompt: string | null; promptChange: boolean; description: string | null } | null;
}) {
  const b = useBrouillon();
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [copie, setCopie] = useState(false);
  const decl = new Set(declarees);
  const toutOuvert = ouverts.size === SECTIONS_ORDRE.length;

  const bascule = (s: string) =>
    setOuverts((p) => {
      const n = new Set(p);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(promptComplet);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch {
      // presse-papiers indisponible
    }
  };

  return (
    <section className="panel fp-prompt" id="fp-prompt" aria-label="Prompt">
      <div className="fp-outils">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copier()} disabled={!promptComplet}>
          {copie ? "Copié" : "Copier le prompt"}
        </button>
        <button type="button" className="fp-lien" onClick={() => setOuverts(toutOuvert ? new Set() : new Set(SECTIONS_ORDRE))}>
          {toutOuvert ? "Tout replier" : "Tout déplier"}
        </button>
      </div>
      <div className="fp-secs">
        {SECTIONS_ORDRE.map((s) => (
          <Section key={s} section={s} ouvert={ouverts.has(s)} onBascule={() => bascule(s)} declarees={decl} />
        ))}
      </div>
      {essai && (essai.prompt || essai.description) ? (
        <div className="fp-essai">
          <span className="eyebrow">Envoyé pour l&rsquo;essai n°{essai.numero}</span>
          {essai.prompt ? (
            <details>
              <summary>{essai.promptChange ? "Prompt envoyé (différent du prompt actuel)" : "Prompt envoyé (identique au prompt actuel)"}</summary>
              <pre className="fp-sec-texte">{essai.prompt}</pre>
            </details>
          ) : null}
          {essai.description ? (
            <details>
              <summary>Description du plan pour cet essai (différente de l&rsquo;actuelle)</summary>
              <pre className="fp-sec-texte">{essai.description}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
      <div className="fp-import">
        <PromptImportColle planId={planId} onImporte={b.abandonner} />
      </div>
      <Sceau />
    </section>
  );
}

/** Le sceau « Figé n°X » : posé en haut du prompt pendant les 5 s où le rendu se place dans la file. */
function Sceau() {
  const { sceau } = useBrouillon();
  if (sceau == null) return null;
  return (
    <div className="fp-sceau" aria-hidden="true">
      <span>
        Figé<b>n°{sceau}</b>
      </span>
    </div>
  );
}
