"use client";

import { useState, useTransition } from "react";
import {
  corrigerRepliqueDansPrompt,
  definirDebutReplique,
  delierReplique,
  insererRepliqueDansPrompt,
  lierReplique,
} from "@/app/repliques/actions";
import type { ControleDialogues, SegmentEcart, StatutDuree } from "@/lib/plan-checks";
import type { LiaisonPlanVue, OptionsLocuteur, RepliqueVue } from "@/lib/queries-repliques";
import { NouvelleRepliqueForm } from "@/components/repliques/NouvelleRepliqueForm";
import { Icone } from "@/components/ui/Icone";

const STATUT_DUREE: Record<StatutDuree, string> = {
  tient: "✅ tient",
  a_mesurer: "⏳ voix à mesurer",
  decoupage_a_envisager: "✂️ découpage à envisager",
};

/** Écart mot à mot : ce qui manque au prompt en or souligné, ce qu'il a en trop
 * en écarlate barré. */
function Ecart({ segments }: { segments: SegmentEcart[] }) {
  return (
    <span className="ecart">
      {segments.map((s, i) =>
        s.type === "=" ? (
          <span key={i}>{s.texte}</span>
        ) : s.type === "-" ? (
          <ins key={i} className="ecart-manque" title="Attendu (dans la réplique), absent du prompt">
            {s.texte.trim() ? s.texte : "␣"}
          </ins>
        ) : (
          <del key={i} className="ecart-trop" title="Présent dans le prompt, pas dans la réplique">
            {s.texte.trim() ? s.texte : "␣"}
          </del>
        ),
      )}
    </span>
  );
}

function tronquer(t: string): string {
  return t.length > 70 ? `${t.slice(0, 70)}…` : t;
}

export function DialoguesPanel({
  planId,
  projectId,
  episodeId,
  liaisons,
  disponibles,
  options,
  controle,
  statutDuree,
  totalSecondes,
  plafondSecondes,
}: {
  planId: number;
  projectId: number;
  episodeId: number;
  liaisons: LiaisonPlanVue[];
  disponibles: RepliqueVue[];
  options: OptionsLocuteur;
  controle: ControleDialogues;
  statutDuree: StatutDuree;
  totalSecondes: number | null;
  plafondSecondes: number;
}) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [choix, setChoix] = useState("");
  const [creation, setCreation] = useState(false);

  const agir = (fn: () => Promise<{ ok: boolean; erreur?: string; note?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setErreur(r.ok ? null : (r.erreur ?? "Échec."));
      setNote(r.ok ? (r.note ?? null) : null);
    });

  const nbProblemes = controle.problemes.length;

  return (
    <section className="panel dlg-panel" id="dialogues">
      <div className="panel-hd">
        <h2>Dialogues</h2>
        <span className="eyebrow">
          {liaisons.length === 0 ? "aucune réplique" : `${totalSecondes != null ? `${totalSecondes}s / ${plafondSecondes}s` : "—"} ${STATUT_DUREE[statutDuree]}`}
        </span>
      </div>
      <div className="panel-bd">
        {/* Bandeau : l'invariant verbatim (F02). Bloque Prévisualiser / Rendu final. */}
        {liaisons.length > 0 || nbProblemes > 0 ? (
          <div className={`dlg-bandeau ${controle.ok ? "is-ok" : "is-alerte"}`} role="status">
            <span className="glyph">{controle.ok ? "✅" : "⚠️"}</span>
            <span>
              {controle.ok ? (
                <>
                  <strong>Verbatim aligné.</strong> Chaque réplique est citée au mot près dans le prompt, avec sa prise audio.
                </>
              ) : (
                <>
                  <strong>{nbProblemes} point{nbProblemes > 1 ? "s" : ""} à corriger avant de générer.</strong> Prévisualiser et Rendu final sont bloqués tant que le prompt ne cite pas exactement les répliques du plan.
                </>
              )}
            </span>
          </div>
        ) : null}

        {nbProblemes > 0 ? (
          <div className="checks dlg-problemes">
            {controle.problemes.map((p, i) => {
              if (p.type === "absente") {
                return (
                  <div key={i} className="check warn">
                    <span className="glyph">⚠️</span>
                    <span style={{ flex: 1 }}>
                      <span className="t">Réplique absente du prompt</span>
                      <span className="d">« {tronquer(p.texte)} » n&rsquo;apparaît dans aucune balise <code>&lt;d&gt;</code>.</span>
                    </span>
                    <button type="button" className="btn btn-ghost btn-mini" disabled={pending} onClick={() => agir(() => insererRepliqueDansPrompt(planId, p.repliqueId))}>
                      Insérer dans le prompt
                    </button>
                  </div>
                );
              }
              if (p.type === "differente") {
                return (
                  <div key={i} className="check warn">
                    <span className="glyph">⚠️</span>
                    <span style={{ flex: 1 }}>
                      <span className="t">Citée autrement que mot pour mot</span>
                      <span className="d">
                        <Ecart segments={p.ecart} />
                      </span>
                      <span className="d tiny-note">
                        <ins className="ecart-manque">manque au prompt</ins> · <del className="ecart-trop">en trop dans le prompt</del>
                      </span>
                    </span>
                    <button type="button" className="btn btn-ghost btn-mini" disabled={pending} onClick={() => agir(() => corrigerRepliqueDansPrompt(planId, p.repliqueId))}>
                      Corriger dans le prompt
                    </button>
                  </div>
                );
              }
              if (p.type === "orpheline") {
                return (
                  <div key={i} className="check warn">
                    <span className="glyph">⚠️</span>
                    <span>
                      <span className="t">Dialogue du prompt sans réplique liée</span>
                      <span className="d">
                        <code>&lt;d&gt;</code> « {tronquer(p.trouve)} » ne correspond à aucune réplique du plan — lie la réplique, ou retire la balise.
                      </span>
                    </span>
                  </div>
                );
              }
              if (p.type === "sans_audio") {
                return (
                  <div key={i} className="check warn">
                    <span className="glyph">⚠️</span>
                    <span>
                      <span className="t">Pas de prise audio</span>
                      <span className="d">« {tronquer(p.texte)} » n&rsquo;a pas de prise : la référence <code>&lt;Audio N&gt;</code> qui pilote le lipsync manque.</span>
                    </span>
                  </div>
                );
              }
              return (
                <div key={i} className="check warn">
                  <span className="glyph">⚠️</span>
                  <span>
                    <span className="t">Prise à refaire</span>
                    <span className="d">« {tronquer(p.texte)} » : le texte a changé depuis la prise audio.</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {liaisons.length > 0 ? (
          <table className="w-full text-sm dlg-table">
            <thead className="text-neutral-500 text-xs">
              <tr>
                <th className="text-left py-1">Réf.</th>
                <th className="text-left py-1">Locuteur</th>
                <th className="text-left py-1">Réplique (verbatim)</th>
                <th className="text-right py-1">Durée</th>
                <th className="text-right py-1" title="Moment indicatif où la réplique est dite — à écrire dans le prompt">Début</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liaisons.map((l) => (
                <tr key={l.liaisonId} className="border-t border-anthracite-line">
                  <td className="py-1 text-neutral-500 num">
                    &lt;Audio {l.slot}&gt;
                    {l.fichier == null ? <div className="tiny-note">sans prise</div> : null}
                  </td>
                  <td className="py-1">
                    <span className="dlg-who">{l.locuteur.label}</span>
                    <div>{l.voix ? <span className="voix-chip"><Icone nom="musique" taille={13} /> {l.voix.code}</span> : <span className="voix-chip is-none" title="Le personnage n'a pas encore de voix au casting">sans voix</span>}</div>
                  </td>
                  <td className="py-1 text-neutral-300">
                    <span className={`verbatim-etat v-${controle.parReplique[l.id] ?? "absente"}`} title={controle.parReplique[l.id] === "ok" ? "Citée mot pour mot dans le prompt" : "Pas citée mot pour mot dans le prompt"}>
                      <Icone nom={controle.parReplique[l.id] === "ok" ? "valide" : "alerte"} taille={14} />
                    </span>{" "}
                    {l.texte}
                    {l.audioSrc ? <audio controls preload="none" src={l.audioSrc} className="rep-audio" /> : null}
                  </td>
                  <td className="py-1 text-right text-neutral-400">{l.dureeSecondes != null ? `${l.dureeSecondes}s` : "—"}</td>
                  <td className="py-1 text-right">
                    <input
                      className="field field-mono dlg-debut"
                      defaultValue={l.debutSecondes ?? ""}
                      placeholder="s"
                      size={3}
                      aria-label="Début indicatif (secondes)"
                      disabled={pending}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const n = v === "" ? null : Number(v.replace(",", "."));
                        if ((n ?? null) === (l.debutSecondes ?? null)) return;
                        agir(() => definirDebutReplique(l.liaisonId, n));
                      }}
                    />
                  </td>
                  <td className="py-1 text-right">
                    <button type="button" className="btn btn-danger btn-mini" disabled={pending} onClick={() => agir(() => delierReplique(planId, l.id))} title="Retirer du plan (la réplique continue d'exister)" aria-label="Retirer du plan">
                      <Icone nom="fermer" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="tiny-note" style={{ marginBottom: "var(--sp-3)" }}>
            Aucune réplique sur ce plan. Les répliques se rédigent au scénario ou au casting ; la fiche de plan les assemble.
          </p>
        )}

        <div className="dlg-ajout">
          {disponibles.length > 0 ? (
            <div className="dlg-ajout-ligne">
              <select className="field" value={choix} onChange={(e) => setChoix(e.target.value)} disabled={pending} aria-label="Réplique de l'épisode à ajouter">
                <option value="">Ajouter une réplique de l&rsquo;épisode…</option>
                {disponibles.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.locuteur.label} — {tronquer(d.texte)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-gold btn-mini"
                disabled={pending || !choix}
                onClick={() => {
                  agir(() => lierReplique(planId, Number(choix)));
                  setChoix("");
                }}
              >
                Lier au plan
              </button>
            </div>
          ) : null}
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => setCreation((v) => !v)}>
            {creation ? "Fermer" : "Nouvelle réplique…"}
          </button>
          {creation ? (
            <NouvelleRepliqueForm projectId={projectId} options={options} episodeIdFixe={episodeId} planId={planId} compact />
          ) : null}
        </div>

        {erreur ? <p className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)", marginTop: "var(--sp-2)" }}>{erreur}</p> : null}
        {note ? <p className="tiny-note" role="status" style={{ color: "var(--or-glow)", marginTop: "var(--sp-2)" }}>{note}</p> : null}
      </div>
    </section>
  );
}
