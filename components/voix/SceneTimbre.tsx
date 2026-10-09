"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { enregistrerVoix, proposerRepliqueEcoute, proposerTimbre } from "@/app/voix/actions";
import { PHRASES_MIN_ECOUTE, checksInstruction, compterPhrases } from "@/lib/voix";
import { useAssistantVoix } from "./AssistantVoix";

/** Les mots qui orientent l'IA, avec la teinte de lumière qu'ils donnent à la scène (0 à 360). */
const TIMBRES: { mot: string; teinte: number }[] = [
  { mot: "Jeune", teinte: 200 },
  { mot: "Mûre", teinte: 20 },
  { mot: "Grave", teinte: 12 },
  { mot: "Claire", teinte: 190 },
  { mot: "Rauque", teinte: 30 },
  { mot: "Posée", teinte: 150 },
  { mot: "Énergique", teinte: 50 },
  { mot: "Douce", teinte: 320 },
];

type Proposition = { instruction: string; resume: string; source: "modele" | "repli" };

/** Scène 3 (voix décrite) — « À quoi ressemble sa voix ? » L'IA propose un timbre (résumé en français en grand, instruction anglaise
 * dessous : c'est elle que lit le moteur) ; on la prend, ou on demande une autre idée en cochant des mots pour l'orienter. La réplique
 * d'écoute — le texte que la voix de référence lira — se réécrit à la demande. Instruction et réplique restent modifiables à la main
 * (repliées / en place). Tout s'enregistre tout seul. */
export function SceneTimbre({ assetId, instruction, refText, langue }: { assetId: number; instruction: string; refText: string; langue: string }) {
  const router = useRouter();
  const { setTeinte } = useAssistantVoix();
  const [courante, setCourante] = useState(instruction);
  const [proposition, setProposition] = useState<Proposition | null>(null);
  const [orientations, setOrientations] = useState<string[]>([]);
  const [ecoute, setEcoute] = useState(refText);
  const [edition, setEdition] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [idee, startIdee] = useTransition();
  const [ecriture, startEcriture] = useTransition();
  const [, startSave] = useTransition();

  const texteAffiche = proposition?.instruction ?? courante;
  const checks = checksInstruction(texteAffiche);
  const phrases = compterPhrases(ecoute);
  const assez = phrases >= PHRASES_MIN_ECOUTE;

  // La réplique d'écoute s'enregistre un instant après la frappe.
  const dernierEcoute = useRef(refText);
  useEffect(() => {
    if (ecoute === dernierEcoute.current) return;
    const t = setTimeout(() => {
      dernierEcoute.current = ecoute;
      startSave(async () => {
        const r = await enregistrerVoix(assetId, { refText: ecoute });
        if (r.ok) router.refresh();
        else setRetour({ ok: false, texte: r.erreur });
      });
    }, 600);
    return () => clearTimeout(t);
  }, [ecoute, assetId, router]);

  const baculerMot = (mot: string, teinte: number) => {
    const present = orientations.includes(mot);
    setOrientations(present ? orientations.filter((m) => m !== mot) : [...orientations, mot].slice(-4));
    if (!present) setTeinte(teinte);
  };

  const demanderIdee = () =>
    startIdee(async () => {
      setRetour(null);
      const r = await proposerTimbre(assetId, { orientations, langue });
      if (r.ok) {
        setProposition({ instruction: r.instruction, resume: r.resume, source: r.source });
        if (r.source === "repli") setRetour({ ok: false, texte: "Le modèle ne répond pas : voici une proposition de secours, à retoucher." });
      } else setRetour({ ok: false, texte: r.erreur });
    });

  const enregistrerInstruction = (texte: string) =>
    startSave(async () => {
      const r = await enregistrerVoix(assetId, { instruction: texte });
      if (r.ok) {
        setCourante(texte);
        setProposition(null);
        setRetour({ ok: true, texte: "Timbre retenu." });
        router.refresh();
      } else setRetour({ ok: false, texte: r.erreur });
    });

  const reecrire = () =>
    startEcriture(async () => {
      setRetour(null);
      const r = await proposerRepliqueEcoute(assetId, { instruction: texteAffiche, langue });
      if (r.ok) {
        setEcoute(r.texte);
        if (r.source !== "modele") setRetour({ ok: false, texte: "Modèle indisponible : texte de secours à la place. Réessaie, ou écris le tien." });
      } else setRetour({ ok: false, texte: r.erreur });
    });

  return (
    <>
      <p className="cn-acte">Scène 3 · Le timbre</p>
      <h2 className="cn-titre">
        À quoi ressemble <em>sa voix</em> ?
      </h2>

      <div className={`av-citation${texteAffiche.trim() ? "" : " is-vide"}`}>
        {texteAffiche.trim() ? (
          <>
            <p>{proposition?.resume || texteAffiche}</p>
            {proposition?.resume ? <small>{texteAffiche}</small> : <small>{proposition ? "Proposition de l’IA" : "Timbre actuel, en anglais : c’est ce que lit le moteur"}</small>}
          </>
        ) : (
          <p>Pas encore de timbre. Demande une idée à l&rsquo;IA, ou écris-le à la main.</p>
        )}
      </div>
      <div className="av-actions">
        {proposition ? (
          <button type="button" className="btn btn-primary" onClick={() => enregistrerInstruction(proposition.instruction)}>
            Je prends celle-ci
          </button>
        ) : null}
        <button type="button" className={`btn${proposition || courante.trim() ? "" : " btn-primary"}`} onClick={demanderIdee} disabled={idee}>
          {idee ? "L’IA réfléchit…" : proposition || courante.trim() ? "Une autre idée" : "Une idée de l’IA"}
        </button>
      </div>

      <p className="av-q">Pour orienter l&rsquo;IA</p>
      <div className="cn-nuage" role="group" aria-label="Mots pour orienter le timbre">
        {TIMBRES.map((t) => (
          <button key={t.mot} type="button" className="cn-bulle" aria-pressed={orientations.includes(t.mot)} onClick={() => baculerMot(t.mot, t.teinte)}>
            {t.mot}
          </button>
        ))}
      </div>

      {checks.length > 0 ? (
        <ul className="av-notes" aria-label="Remarques sur l'instruction">
          {checks.map((c) => (
            <li key={c.titre} className={c.niveau}>
              <b>{c.titre}.</b> {c.detail}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="av-ecoute">
        <span className="av-q" style={{ margin: 0 }}>
          Réplique d&rsquo;écoute
        </span>
        {edition ? (
          <>
            <label htmlFor="av-ecoute" className="cn-sr-seul">
              Réplique d&rsquo;écoute
            </label>
            <textarea id="av-ecoute" rows={3} value={ecoute} onChange={(e) => setEcoute(e.target.value)} placeholder="Deux phrases au moins, qui montrent le caractère de la voix." />
          </>
        ) : (
          <p>{ecoute.trim() || "Pas encore de réplique d’écoute."}</p>
        )}
        <div className="av-ecoute-pied">
          <button type="button" className="btn" onClick={reecrire} disabled={ecriture}>
            {ecriture ? "L’IA écrit…" : ecoute.trim() ? "Réécrire" : "Écrire une réplique"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEdition((e) => !e)}>
            {edition ? "Fermer" : "Modifier à la main"}
          </button>
          <span className={`av-pill${assez ? "" : " is-manque"}`} role="status">
            {phrases} phrase{phrases > 1 ? "s" : ""}
            {assez ? "" : ` · ${PHRASES_MIN_ECOUTE} au moins`}
          </span>
        </div>
        <span className="cn-note" style={{ margin: 0 }}>
          C&rsquo;est le texte que la voix de référence lira : c&rsquo;est avec lui que la voix sera jugée.
        </span>
      </div>

      {retour ? (
        <p className={`av-retour ${retour.ok ? "is-ok" : "is-erreur"}`} role={retour.ok ? "status" : "alert"}>
          {retour.texte}
        </p>
      ) : null}

      <details className="av-details">
        <summary>Modifier l&rsquo;instruction à la main</summary>
        <label htmlFor="av-instr" className="cn-note" style={{ display: "block", marginTop: 10 }}>
          Instruction de timbre, en anglais (c&rsquo;est ce que lit le moteur)
        </label>
        <textarea
          id="av-instr"
          key={courante}
          defaultValue={courante}
          onBlur={(e) => {
            if (e.target.value.trim() !== courante.trim()) enregistrerInstruction(e.target.value);
          }}
          placeholder="Identité → origine (native French speaker) → prosodie → état. Un paragraphe."
        />
      </details>
    </>
  );
}
