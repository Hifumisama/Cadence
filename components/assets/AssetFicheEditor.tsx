"use client";

import { useState, useTransition } from "react";
import { updateAsset } from "@/app/assets/actions";
import { LIBELLE_METHODE, methodeApplicable } from "@/lib/assetCode";

/** Fiche d'un asset : deux textes qui ne disent pas la même chose. La
 * description canonique (français) explique le sujet à l'humain ; le prompt de
 * génération est ce qu'on colle dans ComfyUI (Krea 2, Qwen…), avec sa mise en
 * page propre. Le rôle de l'asset dans un plan, lui, s'écrit dans le prompt
 * vidéo du plan : il change d'un plan à l'autre, il n'a pas sa place ici. */
export function AssetFicheEditor({
  assetId,
  type,
  parentCode,
  description,
  promptGeneration,
  methodeGeneration,
  critique,
}: {
  assetId: number;
  type: string;
  parentCode: string | null;
  description: string;
  promptGeneration: string;
  methodeGeneration: string | null;
  critique: boolean;
}) {
  const [desc, setDesc] = useState(description);
  const [prompt, setPrompt] = useState(promptGeneration);
  const [methode, setMethode] = useState(methodeGeneration ?? "");
  const [crit, setCrit] = useState(critique);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const avecMethode = methodeApplicable(type);
  const edition = methode === "edition";

  const onSave = () => {
    startTransition(async () => {
      const r = await updateAsset(assetId, {
        description: desc,
        promptGeneration: prompt,
        methodeGeneration: avecMethode ? methode || null : null,
        critique: crit,
      });
      if (r.ok) {
        setErreur(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else {
        setErreur(r.erreur);
      }
    });
  };

  return (
    <div className="field-group wide" style={{ gap: "var(--sp-3)" }}>
      <div className="field-group">
        <label>Description canonique</label>
        <textarea className="field" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      {avecMethode ? (
        <div className="field-group">
          <label>Méthode de fabrication</label>
          <select className="field" value={methode} onChange={(e) => setMethode(e.target.value)}>
            <option value="">{parentCode ? "— à décider" : "— génération (par défaut)"}</option>
            <option value="generation">{LIBELLE_METHODE.generation}</option>
            {parentCode ? <option value="edition">{LIBELLE_METHODE.edition}</option> : null}
          </select>
          <span className="tiny-note">
            {parentCode
              ? edition
                ? `Édition : part de l'image de ${parentCode}, qui doit être produite d'abord.`
                : `Rattaché à ${parentCode}. En génération, l'image se fabrique de zéro : aucune dépendance à celle du parent.`
              : "Un master se génère de zéro."}
          </span>
        </div>
      ) : null}
      <div className="field-group">
        <label>Prompt de génération</label>
        <textarea
          className="field field-mono"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            type === "voix"
              ? "Instruction Voice Design — se règle au casting vocal"
              : edition
                ? "Instructions impératives pour Qwen Image Edit, une intention par ligne"
                : "Prose descriptive pour Krea 2 (sujet seulement : le style est ajouté par ComfyUI)"
          }
        />
      </div>
      <div className="form-actions">
        <label className="chk">
          <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} />
          Critique
        </label>
        {erreur ? <span className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span> : null}
        <button className="btn btn-ghost" onClick={onSave} disabled={pending}>
          {pending ? "..." : saved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
