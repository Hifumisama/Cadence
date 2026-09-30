"use client";

import { useState, useTransition } from "react";
import { deposerAudioTest, deposerVideoTest, enregistrerTest, retirerAudioTest } from "@/app/voix/actions";
import { promptTestVoix } from "@/lib/voix";
import { CopierBouton } from "./CopierBouton";
import { ZoneDepot } from "./ZoneDepot";

type Option = { id: number; code: string; description: string | null };

/** Étape 3 — test vidéo : la voix sur un visage. Un bloc volontairement
 * simple : un décor (optionnel), un personnage (optionnel), le texte à tester ;
 * le prompt vidéo dédié se compose tout seul. Un audio déjà prêt se dépose en
 * glisser-déposer, sinon c'est la voix de référence qui sert. Le rendu se
 * dépose à la main tant que la génération n'est pas branchée. */
export function EtapeTest({
  assetId,
  decors,
  personnages,
  initial,
  referenceSrc,
  testAudioSrc,
  testAudioNom,
  testVideoSrc,
  testVideoNom,
}: {
  assetId: number;
  decors: Option[];
  personnages: Option[];
  initial: { decorId: number | null; personnageId: number | null; texte: string };
  referenceSrc: string | null;
  testAudioSrc: string | null;
  testAudioNom: string | null;
  testVideoSrc: string | null;
  testVideoNom: string | null;
}) {
  const [decorId, setDecorId] = useState<number | null>(initial.decorId);
  const [personnageId, setPersonnageId] = useState<number | null>(initial.personnageId);
  const [texte, setTexte] = useState(initial.texte);
  const [pending, startTransition] = useTransition();
  const [etat, setEtat] = useState<"idle" | "ok" | "err">("idle");
  const [erreur, setErreur] = useState<string | null>(null);
  const modifie = decorId !== initial.decorId || personnageId !== initial.personnageId || texte.trim() !== initial.texte.trim();

  const decor = decors.find((d) => d.id === decorId) ?? null;
  const perso = personnages.find((p) => p.id === personnageId) ?? null;
  const audioSrc = testAudioSrc ?? referenceSrc;
  const prompt = promptTestVoix({ texte, personnage: perso, decor, avecAudio: audioSrc != null });

  const enregistrer = () =>
    startTransition(async () => {
      try {
        const r = await enregistrerTest(assetId, { decorId, personnageId, texte });
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

  return (
    <div className="voix-fiche">
      <div className="form-grid">
        <div className="field-group">
          <label>Décor (optionnel)</label>
          <select className="field" value={decorId ?? ""} onChange={(e) => setDecorId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— fond neutre</option>
            {decors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label>Personnage (optionnel)</label>
          <select className="field" value={personnageId ?? ""} onChange={(e) => setPersonnageId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— personnage générique</option>
            {personnages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group wide">
          <label>Texte à tester</label>
          <textarea
            className="field"
            rows={2}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Une réplique hors épisode — on ne teste jamais avec une ligne du découpage."
          />
          <p className="tiny-note voix-warn-mot">Le même texte, <b>au mot près</b>, que celui de l&rsquo;audio de test — sinon les lèvres bougent sur un autre phrasé.</p>
        </div>
      </div>
      <div className="form-actions">
        <span style={{ flex: 1 }} />
        {etat === "err" ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur ?? "Échec de l'enregistrement."}</span> : null}
        <button className="btn btn-gold" type="button" onClick={enregistrer} disabled={pending || !modifie}>
          {pending ? "…" : etat === "ok" ? "Enregistré" : "Enregistrer"}
        </button>
      </div>

      <div className="test-cols">
        <div className="field-group">
          <label>Audio de test</label>
          {audioSrc ? <audio controls src={audioSrc} className="voix-audio-ref" /> : <p className="chip-none">Aucun audio : dépose la référence à l&rsquo;étape 2, ou un sample ici.</p>}
          <p className="tiny-note">{testAudioSrc ? `Sample déposé (${testAudioNom}).` : referenceSrc ? "C'est la voix de référence qui sert — glisse un sample pour la remplacer." : ""}</p>
          <ZoneDepot action={(fd) => deposerAudioTest(assetId, fd)} accept="audio/*" compact>
            Glisser un sample audio ici, ou cliquer
          </ZoneDepot>
          {testAudioSrc ? (
            <button type="button" className="btn btn-ghost btn-mini" onClick={() => startTransition(async () => { await retirerAudioTest(assetId); })} disabled={pending}>
              Retirer le sample
            </button>
          ) : null}
        </div>

        <div className="field-group">
          <label>Vidéo de test</label>
          {testVideoSrc ? (
            <video controls src={testVideoSrc} className="test-video" />
          ) : (
            <p className="chip-none">{testVideoNom ? `Rendu introuvable sur le stockage (${testVideoNom}).` : "Aucune vidéo de test."}</p>
          )}
          <div className="gen-mock">
            <button type="button" className="btn btn-primary" disabled title="La génération vidéo de test n'est pas encore branchée">
              Générer la vidéo de test
            </button>
            <span className="badge b-brouillon">
              <i />
              Non branchée
            </span>
          </div>
          <ZoneDepot action={(fd) => deposerVideoTest(assetId, fd)} accept="video/*" compact>
            {testVideoNom ? "Remplacer le rendu — glisser une vidéo ici" : "Déposer le rendu — glisser une vidéo ici, ou cliquer"}
          </ZoneDepot>
        </div>
      </div>

      <details className="test-prompt">
        <summary>Prompt vidéo du test</summary>
        <div className="voix-lbl-row" style={{ marginTop: "var(--sp-2)" }}>
          <span className="tiny-note">Composé depuis le décor, le personnage et le texte ci-dessus.</span>
          <CopierBouton texte={prompt} />
        </div>
        <pre className="test-prompt-txt num">{prompt}</pre>
      </details>

      <p className="tiny-note">
        Visionner deux fois : d&rsquo;abord yeux fermés, puis avec l&rsquo;image. Si la voix plaît à l&rsquo;aveugle mais gêne à l&rsquo;image,
        c&rsquo;est l&rsquo;âge perçu ou l&rsquo;énergie, pas le timbre.
      </p>
    </div>
  );
}
