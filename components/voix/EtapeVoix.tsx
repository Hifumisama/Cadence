"use client";

import { useState, useTransition } from "react";
import { deposerReference, enregistrerVoix, type ValeursVoix } from "@/app/voix/actions";
import { TEXTE_REFERENCE_DEFAUT, checksInstruction, type SourceVoix } from "@/lib/voix";
import { CopierBouton } from "./CopierBouton";
import { TrimAudio } from "./TrimAudio";

const SOURCES: { cle: SourceVoix; titre: string; aide: string }[] = [
  { cle: "design", titre: "Décrire la voix", aide: "Voice Design : une instruction en texte" },
  { cle: "reference", titre: "Fournir un audio", aide: "Clonage : un audio existant, rogné à la réplique" },
];

/** Étape 1 — la voix. Soit on la décrit (instruction VoiceDesign), soit on
 * fournit un audio (rogné ici à la taille exacte de la réplique). Dans les deux
 * cas, le texte de référence est requis, au mot près. */
export function EtapeVoix({
  assetId,
  initial,
  personnages,
  referenceSrc,
}: {
  assetId: number;
  initial: ValeursVoix;
  personnages: { id: number; code: string }[];
  referenceSrc: string | null;
}) {
  const [v, setV] = useState<ValeursVoix>(initial);
  const [pending, startTransition] = useTransition();
  const [etat, setEtat] = useState<"idle" | "ok" | "err">("idle");
  const [erreur, setErreur] = useState<string | null>(null);
  const modifie = JSON.stringify(v) !== JSON.stringify(initial);
  const champ = <K extends keyof ValeursVoix>(k: K, val: ValeursVoix[K]) => setV((p) => ({ ...p, [k]: val }));
  const checks = v.source === "design" ? checksInstruction(v.instruction) : [];

  const enregistrer = () => {
    startTransition(async () => {
      try {
        const r = await enregistrerVoix(assetId, v);
        if (r.ok) {
          setErreur(null);
          setEtat("ok");
          setTimeout(() => setEtat("idle"), 1500);
        } else {
          setErreur(r.erreur);
          setEtat("err");
        }
      } catch {
        setErreur(null);
        setEtat("err");
      }
    });
  };

  return (
    <div className="voix-fiche">
      <div className="source-choix" role="radiogroup" aria-label="Comment obtenir la voix">
        {SOURCES.map((s) => (
          <button
            key={s.cle}
            type="button"
            role="radio"
            aria-checked={v.source === s.cle}
            className={`source-opt${v.source === s.cle ? " is-actif" : ""}`}
            onClick={() => champ("source", s.cle)}
          >
            <span className="t">{s.titre}</span>
            <span className="a">{s.aide}</span>
          </button>
        ))}
      </div>

      {v.source === "design" ? (
        <div className="field-group">
          <div className="voix-lbl-row">
            <label>Instruction Voice Design (anglais, prose)</label>
            <CopierBouton texte={v.instruction} />
          </div>
          <textarea
            className="field field-mono"
            rows={6}
            value={v.instruction}
            onChange={(e) => champ("instruction", e.target.value)}
            placeholder="Identité → origine (native French speaker) → prosodie → état. Un paragraphe. Le débit, le volume, ce que la voix ne fait jamais : c'est ici que ça se dit."
          />
          {checks.length > 0 ? (
            <ul className="voix-notes">
              {checks.map((c) => (
                <li key={c.titre} className={c.niveau}>
                  <b>{c.titre}.</b> {c.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="field-group">
          <label>Audio de référence</label>
          {referenceSrc ? <audio controls src={referenceSrc} className="voix-audio-ref" /> : null}
          <TrimAudio action={(fd) => deposerReference(assetId, fd)} aDejaUneReference={referenceSrc != null} />
          <p className="tiny-note">
            Garde exactement la réplique de référence : début et fin au plus juste, sans silence de bord, sans musique
            ni réverbération.
          </p>
        </div>
      )}

      <div className="field-group">
        <div className="voix-lbl-row">
          <label>Texte de référence — au mot près</label>
          <span style={{ display: "inline-flex", gap: "var(--sp-2)" }}>
            {v.source === "design" && v.refText.trim() !== TEXTE_REFERENCE_DEFAUT ? (
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => champ("refText", TEXTE_REFERENCE_DEFAUT)}>
                Texte par défaut
              </button>
            ) : null}
            <CopierBouton texte={v.refText} />
          </span>
        </div>
        <textarea
          className="field"
          rows={3}
          value={v.refText}
          onChange={(e) => champ("refText", e.target.value)}
          placeholder={
            v.source === "design"
              ? "Ce que la voix dit dans la référence générée. Le même texte anglais peut servir à toutes les voix."
              : "Ce que dit l'audio fourni, mot pour mot, ponctuation comprise."
          }
        />
        <p className="tiny-note voix-warn-mot">
          Il doit correspondre {v.source === "design" ? "à ce que la voix générée dira" : "à ce que dit l'audio"} <b>au mot près</b> —
          sans lui, la référence est diminuée.
          {v.source === "design"
            ? " Un texte anglais identique pour toutes les voix a donné le meilleur résultat : le timbre vient de l'instruction, les répliques françaises sont ensuite dites par clonage de cette référence."
            : ""}
        </p>
      </div>

      <div className="form-grid">
        <div className="field-group wide">
          <label>Description canonique du timbre — ses limites aussi</label>
          <textarea
            className="field"
            rows={3}
            value={v.description}
            onChange={(e) => champ("description", e.target.value)}
            placeholder="Ce qui rend la voix reconnaissable, et où elle ne tient pas."
          />
        </div>
        <div className="field-group">
          <label>Personnage</label>
          <select className="field" value={v.personnageId ?? ""} onChange={(e) => champ("personnageId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">— aucun (voix off, figurant…)</option>
            {personnages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label>Langue native</label>
          <input className="field" value={v.langue} onChange={(e) => champ("langue", e.target.value)} placeholder="French" />
        </div>
      </div>

      <div className="form-actions">
        <label className="chk">
          <input type="checkbox" checked={v.critique} onChange={(e) => champ("critique", e.target.checked)} />
          Critique
        </label>
        <span style={{ flex: 1 }} />
        {etat === "err" ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur ?? "Échec de l'enregistrement."}</span> : null}
        <button className="btn btn-gold" type="button" onClick={enregistrer} disabled={pending || !modifie}>
          {pending ? "…" : etat === "ok" ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
