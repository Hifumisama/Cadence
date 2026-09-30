"use client";

import Link from "next/link";
import { deposerReference } from "@/app/voix/actions";
import { checksReference, type SourceVoix } from "@/lib/voix";
import { CopierBouton } from "./CopierBouton";
import { ZoneDepot } from "./ZoneDepot";

/** Étape 2 — la voix de référence. En Voice Design, on la génère à partir de
 * l'instruction et du texte de référence ; en clonage, la référence est déjà
 * l'audio fourni à l'étape 1. La génération n'est pas branchée (pas d'agent ni
 * de système de tâches voix pour l'instant) : le bouton est là, la référence se
 * produit à la main dans ComfyUI et se dépose ici. */
export function EtapeReference({
  assetId,
  source,
  instruction,
  refText,
  langue,
  referenceFichier,
  referenceSrc,
  hrefEtapeVoix,
}: {
  assetId: number;
  source: SourceVoix;
  instruction: string;
  refText: string;
  langue: string;
  referenceFichier: string | null;
  referenceSrc: string | null;
  hrefEtapeVoix: string;
}) {
  const checks = checksReference({ fichier: referenceFichier, refText });

  const lecteur = referenceSrc ? (
    <audio controls src={referenceSrc} className="voix-audio-ref" />
  ) : (
    <p className="chip-none">{referenceFichier ? `Référence introuvable sur le stockage (${referenceFichier}).` : "Pas encore de référence."}</p>
  );

  if (source === "reference") {
    return (
      <div className="voix-fiche">
        <p className="tiny-note">
          Cette voix se clone depuis l&rsquo;audio fourni : la référence est celle rognée à l&rsquo;
          <Link href={hrefEtapeVoix} style={{ color: "var(--or)" }}>étape Voix</Link>. Rien à générer ici.
        </p>
        {lecteur}
        {refText.trim() ? <blockquote className="voix-reftext">{refText}</blockquote> : <p className="chip-none">Texte de référence manquant.</p>}
        {referenceFichier ? <span className="tiny-note num">{referenceFichier}</span> : null}
        <Alertes checks={checks} />
      </div>
    );
  }

  const pret = instruction.trim() !== "" && refText.trim() !== "";
  return (
    <div className="voix-fiche">
      <div className="ref-recap">
        <div>
          <div className="voix-lbl-row">
            <span className="eyebrow">Instruction ({langue})</span>
            <CopierBouton texte={instruction} />
          </div>
          {instruction.trim() ? <p className="ref-recap-txt num">{instruction}</p> : <p className="chip-none">Instruction à écrire à l&rsquo;étape Voix.</p>}
        </div>
        <div>
          <div className="voix-lbl-row">
            <span className="eyebrow">Texte de référence</span>
            <CopierBouton texte={refText} />
          </div>
          {refText.trim() ? <p className="ref-recap-txt">{refText}</p> : <p className="chip-none">Texte à écrire à l&rsquo;étape Voix.</p>}
        </div>
      </div>

      <div className="gen-mock">
        <button type="button" className="btn btn-primary" disabled title="La génération vocale n'est pas encore branchée">
          Générer la voix de référence
        </button>
        <span className="badge b-brouillon">
          <i />
          Non branchée
        </span>
        <span className="tiny-note">
          {pret
            ? "En attendant, génère-la dans ComfyUI avec l'instruction et le texte ci-dessus, puis dépose-la."
            : "Complète l'instruction et le texte de référence (étape Voix), puis génère."}
        </span>
      </div>

      <div className="field-group">
        <label>Voix de référence</label>
        {lecteur}
        <ZoneDepot action={(fd) => deposerReference(assetId, fd)} accept="audio/*" compact>
          {referenceFichier ? "Remplacer la référence — glisser un audio ici, ou cliquer" : "Déposer la référence générée — glisser un audio ici, ou cliquer"}
        </ZoneDepot>
        {referenceFichier ? <span className="tiny-note num">{referenceFichier}</span> : null}
      </div>
      <Alertes checks={checks} />
    </div>
  );
}

function Alertes({ checks }: { checks: ReturnType<typeof checksReference> }) {
  if (checks.length === 0) return null;
  return (
    <ul className="voix-notes">
      {checks.map((c) => (
        <li key={c.titre} className={c.niveau}>
          <b>{c.titre}.</b> {c.detail}
        </li>
      ))}
    </ul>
  );
}
