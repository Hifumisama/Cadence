"use client";

import { useEffect, useRef, useState } from "react";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import type { DemandeAgent } from "@/components/agents/AgentsProvider";
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

function grandir(t: HTMLTextAreaElement | null) {
  if (!t) return;
  t.style.height = "auto";
  t.style.height = `${Math.max(96, t.scrollHeight + 2)}px`;
}

/** Éclaire la carte de référence dont on survole la citation (`<Picture 2>`). */
function eclairer(label: string | null) {
  document.querySelectorAll(".fp-ref.is-eclairee").forEach((e) => e.classList.remove("is-eclairee"));
  if (!label) return;
  document.querySelector(`.fp-ref[data-ref="${label}"]`)?.classList.add("is-eclairee");
}

function Section({ section, ouvert, onBascule, declarees }: { section: string; ouvert: boolean; onBascule: () => void; declarees: Set<string> }) {
  const b = useBrouillon();
  const ref = useRef<HTMLTextAreaElement>(null);
  const contenu = b.sectionVue(section);
  const modifiee = b.sectionModifiee(section);
  const cites = extraireLabels(contenu);

  useEffect(() => {
    if (ouvert) grandir(ref.current);
  }, [ouvert, contenu]);

  return (
    <div className={`fp-sec${ouvert ? " is-ouvert" : ""}${modifiee ? " is-mod" : ""}`}>
      <button type="button" className="fp-sec-hd" aria-expanded={ouvert} onClick={onBascule}>
        <span className="fp-sec-car" aria-hidden="true">›</span>
        <span className="fp-sec-nom">{section}</span>
        <span className="fp-sec-apercu">{contenu}</span>
        <span className="fp-sec-n num">{contenu.length} c.</span>
      </button>
      {ouvert ? (
        <div className="fp-sec-bd">
          <textarea
            ref={ref}
            value={contenu}
            aria-label={section}
            onChange={(e) => {
              b.setSection(section, e.target.value);
              grandir(e.target);
            }}
          />
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
          {modifiee ? (
            <button type="button" className="btn btn-ghost btn-sm fp-revenir" onClick={() => b.revenirSection(section)}>
              Revenir au texte figé
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Le prompt H3 en six sections, toutes repliées au départ. Les saisies vont dans le brouillon (BrouillonPlan), rien n'est écrit
 * avant le lancement d'un rendu. `declarees` : les labels des références du plan (« Picture 1 »). */
export function PromptBloc({ planId, declarees, demandeAgent, aUneFiche }: { planId: number; declarees: string[]; demandeAgent: DemandeAgent; aUneFiche: boolean }) {
  const b = useBrouillon();
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const decl = new Set(declarees);
  const toutOuvert = ouverts.size === SECTIONS_ORDRE.length;

  const bascule = (s: string) =>
    setOuverts((p) => {
      const n = new Set(p);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  return (
    <section className="panel fp-prompt" id="fp-prompt" aria-label="Prompt">
      <div className="panel-hd">
        <h2>Prompt</h2>
        <span className="eyebrow">H3 · 6 sections</span>
        {b.nbSectionsModifiees > 0 ? (
          <span className="num fp-compte-mod">
            {b.nbSectionsModifiees} modifiée{b.nbSectionsModifiees > 1 ? "s" : ""} ●
          </span>
        ) : null}
      </div>
      <div className="fp-outils">
        <button type="button" className="fp-lien" onClick={() => setOuverts(toutOuvert ? new Set() : new Set(SECTIONS_ORDRE))}>
          {toutOuvert ? "Tout replier" : "Tout déplier"}
        </button>
        <div className="fp-menu" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMenu(false); }}>
          <button type="button" className="btn btn-ghost btn-sm" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            Agent ✦
          </button>
          {menu ? (
            <div className="fp-menu-pop" role="menu">
              <BoutonAgent demande={demandeAgent} libelle="Demander à l'agent" className="fp-menu-item" titre="Modifier ce plan, ou en ajouter un après lui" />
              <BoutonAgent
                demande={{ ...demandeAgent, vue: "fiches" }}
                libelle={aUneFiche ? "Réécrire la fiche" : "Écrire la fiche"}
                className="fp-menu-item"
                titre="Remplace toutes les sections et les références ; tu relis avant qu'il soit écrit"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="fp-import">
        <PromptImportColle planId={planId} onImporte={b.abandonner} />
      </div>
      <div className="fp-secs">
        {SECTIONS_ORDRE.map((s) => (
          <Section key={s} section={s} ouvert={ouverts.has(s)} onBascule={() => bascule(s)} declarees={decl} />
        ))}
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
