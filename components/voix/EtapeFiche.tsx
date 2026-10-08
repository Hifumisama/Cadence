"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { enregistrerVoix, proposerRepliqueEcoute } from "@/app/voix/actions";
import { LANGUES_MOTEUR } from "@/lib/langues-tts";
import { PHRASES_MIN_ECOUTE, compterPhrases, nomVoix } from "@/lib/voix";
import { CopierBouton } from "./CopierBouton";

type ValeursFiche = { description: string; critique: boolean; personnageId: number | null; langue: string; refText: string };

/** Étape 1 — la fiche : le nom (dérivé, lecture seule), la langue native, le personnage assigné, la description canonique du timbre,
 * la RÉPLIQUE D'ÉCOUTE (le texte unique que lit la voix de référence) et la case « voix critique ». Pas de bouton « Enregistrer » :
 * chaque modification s'enregistre toute seule (un instant après la frappe, tout de suite en quittant un champ), pour que les autres
 * étapes lisent toujours la fiche à jour. La suppression de la voix se fait ici. */
export function EtapeFiche({
  assetId,
  codeVoix,
  initial,
  instruction,
  personnages,
  suppression,
}: {
  assetId: number;
  /** Sert seulement à dériver le nom (jamais affiché tel quel). */
  codeVoix: string;
  initial: ValeursFiche;
  /** L'instruction en cours (étape 2), pour que « Écrire une réplique d'écoute » colle au timbre voulu. */
  instruction: string;
  personnages: { id: number; code: string }[];
  suppression: ReactNode;
}) {
  const [v, setV] = useState<ValeursFiche>(initial);
  const [etat, setEtat] = useState<"repos" | "enregistre" | "echec">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const champ = <K extends keyof ValeursFiche>(k: K, val: ValeursFiche[K]) => setV((p) => ({ ...p, [k]: val }));

  // Dernier état enregistré (ou tenté) : on n'écrit que ce qui change, et un échec n'est pas retenté tant que rien ne bouge.
  const dernier = useRef(JSON.stringify(initial));
  const enAttente = useRef(v);
  enAttente.current = v;
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enregistrer = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    const instantane = enAttente.current;
    const cle = JSON.stringify(instantane);
    if (cle === dernier.current) return;
    dernier.current = cle;
    startTransition(async () => {
      try {
        const r = await enregistrerVoix(assetId, instantane);
        if (r.ok) {
          setErreur(null);
          setEtat("enregistre");
        } else {
          setErreur(r.erreur);
          setEtat("echec");
        }
      } catch {
        setErreur(null);
        setEtat("echec");
      }
    });
  };
  useEffect(() => {
    if (JSON.stringify(v) === dernier.current) return;
    minuteur.current = setTimeout(enregistrer, 600);
    return () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const [ecriture, startEcriture] = useTransition();
  const [noteEcoute, setNoteEcoute] = useState<string | null>(null);
  // Réplique d'écoute écrite par le modèle d'après le caractère du personnage, dans la langue de la voix (sans skill d'agent).
  const ecrireTexte = () =>
    startEcriture(async () => {
      const r = await proposerRepliqueEcoute(assetId, { instruction, langue: v.langue });
      if (r.ok) {
        champ("refText", r.texte);
        setNoteEcoute(r.source === "modele" ? null : "Modèle indisponible : texte de secours à la place. Réessaie, ou écris le tien.");
      } else {
        setNoteEcoute(r.erreur);
      }
    });

  const perso = personnages.find((p) => p.id === v.personnageId) ?? null;
  const nom = nomVoix({ code: codeVoix, personnageCode: perso?.code ?? null });
  const phrases = compterPhrases(v.refText);
  const assez = phrases >= PHRASES_MIN_ECOUTE;

  return (
    <div className="voix-fiche">
      <div className="fiche-entete">
        <div className="field-group">
          <label htmlFor="f-nom">Nom de la voix</label>
          <input id="f-nom" className="field" value={nom} readOnly aria-describedby="f-nom-note" />
          <span id="f-nom-note" className="tiny-note">Dérivé du personnage assigné, ou de la voix.</span>
        </div>
        <div className="field-group">
          <label htmlFor="f-langue">Langue native</label>
          {/* Le moteur vocal n'accepte que des noms anglais : on stocke « French », on affiche « Français ». */}
          <select id="f-langue" className="field" value={v.langue} onChange={(e) => champ("langue", e.target.value)}>
            {LANGUES_MOTEUR.map((l) => (
              <option key={l.valeur} value={l.valeur}>
                {l.libelle}
              </option>
            ))}
            {LANGUES_MOTEUR.some((l) => l.valeur === v.langue) ? null : <option value={v.langue}>{v.langue}</option>}
          </select>
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="f-perso">Personnage</label>
        <select id="f-perso" className="field" value={v.personnageId ?? ""} onChange={(e) => champ("personnageId", e.target.value ? Number(e.target.value) : null)}>
          <option value="">Aucun, voix directe (voix off, figurant…)</option>
          {personnages.map((p) => (
            <option key={p.id} value={p.id}>
              {nomVoix({ code: p.code })}
            </option>
          ))}
        </select>
        <span className="tiny-note">Assignation aussi possible depuis le registre d&rsquo;assets.</span>
      </div>

      <div className="field-group">
        <label htmlFor="f-desc">Description canonique du timbre — ses limites aussi</label>
        <textarea
          id="f-desc"
          className="field"
          rows={3}
          value={v.description}
          onChange={(e) => champ("description", e.target.value)}
          onBlur={enregistrer}
          placeholder="Ce qui rend la voix reconnaissable, et où elle ne tient pas."
        />
      </div>

      <div className="signature-voix">
        <div className="voix-lbl-row">
          <label htmlFor="f-ecoute">Réplique d&rsquo;écoute · signature de la voix</label>
          <CopierBouton texte={v.refText} />
        </div>
        <textarea
          id="f-ecoute"
          className="field signature-champ"
          rows={3}
          value={v.refText}
          onChange={(e) => champ("refText", e.target.value)}
          onBlur={enregistrer}
          aria-describedby="f-ecoute-note"
          placeholder="Ce que la voix de référence dira : deux phrases au moins, qui montrent le caractère."
        />
        <div className="row-actions">
          <button type="button" className="btn" onClick={ecrireTexte} disabled={ecriture} title="Au moins deux phrases, cohérentes avec le caractère du personnage, dans la langue de la voix">
            {ecriture ? "L’agent écrit…" : "Écrire une réplique d’écoute"}
          </button>
          <span className={`pill-phrases${assez ? " ok" : " manque"}`} role="status">
            {phrases} phrase{phrases > 1 ? "s" : ""}
            {assez ? "" : ` · ${PHRASES_MIN_ECOUTE} au moins`}
          </span>
        </div>
        <p id="f-ecoute-note" className="tiny-note">
          Ce texte est lu pour générer la voix de référence (étape 2), et sert de signature sur la carte de la voix.
          {assez ? "" : " Avec moins de deux phrases, la voix de référence ne peut pas être générée."}
        </p>
        {noteEcoute ? <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>{noteEcoute}</p> : null}
      </div>

      <label className="chk chk-voix">
        <input type="checkbox" checked={v.critique} onChange={(e) => champ("critique", e.target.checked)} />
        Voix critique
      </label>

      <div className="fiche-pied">
        <span className="tiny-note" role="status" aria-live="polite" style={etat === "echec" ? { color: "var(--ecarlate-glow)" } : undefined}>
          {etat === "enregistre" ? "Modifications enregistrées." : etat === "echec" ? (erreur ?? "Échec de l'enregistrement.") : "Les modifications s'enregistrent toutes seules."}
        </span>
        {suppression}
      </div>
    </div>
  );
}
