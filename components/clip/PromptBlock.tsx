"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { enregistrerPrompt } from "@/app/plans/actions";
import { useBrouillon } from "@/components/clip/ClipDraft";
import { intentAffichee } from "@/lib/clips/intent";

export type VersionPrompt = { id: number; texte: string; source: string; quand: string };

/** The clip's prompt, as plain text: we read it, copy it, retouch it like free text. « Enregistrer » replaces it (it must stay readable:
 * the six sections, each under its name) and keeps the text in the history, from which any version can be picked up again. The « Itérer » agent rewrites it
 * on its side; each attempt keeps the prompt it received (« Envoyé pour l'essai n°X »). */
export function PromptBloc({
  planId,
  promptComplet,
  historique,
  essai,
  peutLancer,
}: {
  planId: number;
  promptComplet: string;
  historique: VersionPrompt[];
  /** An attempt can start: the clip is not validated and no attempt is queued (as with « Nouvelle variante »). */
  peutLancer: boolean;
  /** What had been sent for the displayed attempt. */
  essai: { numero: number; prompt: string | null; promptChange: boolean; description: string | null } | null;
}) {
  const router = useRouter();
  const [texte, setTexte] = useState(promptComplet);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [copie, setCopie] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [pending, startTransition] = useTransition();
  const b = useBrouillon();
  const [note, setNote] = useState("");
  const modifie = texte !== promptComplet;

  // The prompt changes server-side while the drawer is open (a reference removed or added rewrites its labels, an attempt rewrote it):
  // if we have not touched it, we follow it; otherwise we warn, so as not to save over up-to-date labels.
  const vu = useRef(promptComplet);
  const [change, setChange] = useState(false);
  useEffect(() => {
    if (promptComplet === vu.current) return;
    const ancien = vu.current;
    vu.current = promptComplet;
    if (texte === ancien) setTexte(promptComplet);
    else setChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptComplet]);

  const enregistrer = () => {
    setErreurs([]);
    setChange(false);
    startTransition(async () => {
      const r = await enregistrerPrompt(planId, texte);
      if (!r.ok) {
        setErreurs(r.erreurs);
        return;
      }
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 1800);
      router.refresh();
    });
  };
  /** Saves the prompt (if it reads well) then launches an attempt WITH the clip's seed: same seed, different prompt = a fair comparison. */
  const enregistrerEtGenerer = () => {
    setErreurs([]);
    setChange(false);
    startTransition(async () => {
      const r = await enregistrerPrompt(planId, texte);
      if (!r.ok) {
        setErreurs(r.erreurs);
        return;
      }
      const l = await b.lancer("previsualiser", { consigne: note.trim() || null });
      if (!l.ok) {
        setErreurs([l.erreur]);
        return;
      }
      setNote("");
      router.refresh();
    });
  };
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <section className="panel fp-prompt" id="fp-prompt" aria-label="Prompt">
      <textarea
        className="fp-prompt-texte"
        value={texte}
        spellCheck={false}
        aria-label="Prompt du plan"
        onChange={(e) => {
          setTexte(e.target.value);
          setErreurs([]);
        }}
      />
      {change ? (
        <p className="tiny-note fp-prompt-change" role="status">
          Le prompt a changé depuis que tu l&rsquo;as ouvert (références, rendu…).{" "}
          <button
            type="button"
            className="tm-lien"
            onClick={() => {
              setTexte(promptComplet);
              setChange(false);
            }}
          >
            Charger la version à jour
          </button>
        </p>
      ) : null}
      {erreurs.length > 0 ? (
        <ul className="fp-prompt-erreurs" role="alert">
          {erreurs.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <label className="tiny-note" style={{ display: "block", margin: "6px 0" }}>
        Note de l&rsquo;essai (facultatif){" "}
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="par exemple : Open H3 IR, intent en anglais" style={{ width: "100%" }} />
      </label>
      <div className="fp-prompt-actions">
        <button type="button" className="btn btn-gold btn-sm" onClick={enregistrer} disabled={pending || !modifie}>
          {pending ? "Enregistrement…" : enregistre ? "Enregistré" : "Enregistrer"}
        </button>
        <button
          type="button"
          className="btn btn-gold btn-sm"
          onClick={enregistrerEtGenerer}
          disabled={pending || b.occupe || !peutLancer}
          title={peutLancer ? "Enregistre ce prompt puis lance un essai, avec la seed du plan." : "Un essai tourne, ou le plan est validé : rouvre l'itération."}
        >
          Enregistrer et générer
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTexte(promptComplet)} disabled={pending || !modifie}>
          Annuler les changements
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copier()}>
          {copie ? "Copié" : "Tout copier"}
        </button>
      </div>

      {historique.length > 0 ? (
        <details className="fp-essai" open={historique.length <= 4}>
          <summary>Historique · {historique.length} version{historique.length > 1 ? "s" : ""}</summary>
          <ul className="fp-historique">
            {historique.map((v) => (
              <li key={v.id} className={v.texte === promptComplet ? "is-courante" : undefined}>
                <span className="num">{v.quand}</span>
                <span className="fp-historique-source">{v.source === "avant" ? "prompt remplacé" : v.texte === promptComplet ? "version actuelle" : v.source === "compilation" ? "compilation Open H3 IR" : "enregistrement"}</span>
                <button type="button" className="tm-lien" onClick={() => setTexte(v.texte)} disabled={v.texte === texte}>
                  Reprendre
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {essai && (essai.prompt || essai.description) ? (
        <div className="fp-essai">
          <span className="eyebrow">Envoyé pour l&rsquo;essai n°{essai.numero}</span>
          {essai.prompt ? (
            <details>
              <summary>{essai.promptChange ? "Prompt envoyé (différent du prompt actuel)" : "Prompt envoyé (identique au prompt actuel)"}</summary>
              <pre className="fp-sec-texte">{essai.prompt}</pre>
              {essai.promptChange ? (
                <button type="button" className="tm-lien" onClick={() => setTexte(essai.prompt!)}>
                  Reprendre ce prompt
                </button>
              ) : null}
            </details>
          ) : null}
          {essai.description ? (
            <details>
              <summary>Description du plan pour cet essai (différente de l&rsquo;actuelle)</summary>
              <pre className="fp-sec-texte">{intentAffichee(essai.description)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
      <Sceau />
    </section>
  );
}

/** The seal « Figé n°X »: placed at the top of the prompt during the 5 s the render takes its place in the queue. */
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
