"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  changerStatutReplique,
  definirDureeReplique,
  modifierReplique,
  supprimerPriseReplique,
  supprimerReplique,
  uploaderPriseReplique,
} from "@/app/repliques/actions";
import { DeposerFichier } from "@/components/voix/DeposerFichier";
import { LIBELLE_STATUT_REPLIQUE, STATUTS_REPLIQUE } from "@/lib/repliques";
import type { RepliqueVue } from "@/lib/queries-repliques";
import { Icone } from "@/components/ui/Icone";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Une réplique en production/validation (casting vocal, phase 4) : son texte
 * (modifiable), les plans qui la citent — avec l'alerte « prompt à
 * resynchroniser » quand le prompt ne la cite plus mot pour mot —, sa prise
 * audio, sa durée mesurée et son statut. La prise se produit hors Cadence et se
 * dépose ici ; une nouvelle prise remplace l'ancienne (F01). */
export function RepliqueProd({ r, projectId }: { r: RepliqueVue; projectId: number }) {
  const [pending, startTransition] = useTransition();
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(r.texte);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [refuse, setRefuse] = useState(false);
  const [duree, setDuree] = useState("");

  const enregistrerTexte = () =>
    startTransition(async () => {
      const res = await modifierReplique(r.id, { texte });
      if (!res.ok) {
        setErreur(res.erreur);
        return;
      }
      setErreur(null);
      setEdition(false);
      setInfo(
        res.plansAResynchroniser > 0
          ? `Texte modifié — prompt à resynchroniser dans ${res.plansAResynchroniser} plan${res.plansAResynchroniser > 1 ? "s" : ""}${r.fichier ? ", prise à refaire" : ""}.`
          : r.fichier
            ? "Texte modifié — prise à refaire."
            : null,
      );
    });

  const statut = (valeur: string) =>
    startTransition(async () => {
      const res = await changerStatutReplique(r.id, valeur);
      setErreur(res.ok ? null : res.erreur);
    });

  const supprimer = (force: boolean) =>
    startTransition(async () => {
      const res = await supprimerReplique(r.id, force);
      if (!res.ok) {
        setErreur(res.erreur);
        setRefuse(true);
      }
      setConfirmer(false);
    });

  const fixerDuree = () =>
    startTransition(async () => {
      const n = Number(duree.replace(",", "."));
      const res = await definirDureeReplique(r.id, n);
      setErreur(res.ok ? null : res.erreur);
      if (res.ok) setDuree("");
    });

  return (
    <li className={`rep-prod v-${r.statut}`}>
      <div className="rep-prod-hd">
        <span className="dlg-who" title={r.locuteur.kind === "personnage" ? "Personnage" : r.locuteur.kind === "voix" ? "Voix seule" : "Locuteur libre"}>
          {r.locuteur.label}
        </span>
        {r.voix ? <span className="voix-chip"><Icone nom="musique" taille={13} /> {r.voix.code}</span> : <span className="voix-chip is-none">sans voix</span>}
        <span className={`rep-statut s-${r.statut}`}>{LIBELLE_STATUT_REPLIQUE[r.statut as keyof typeof LIBELLE_STATUT_REPLIQUE] ?? r.statut}</span>
        <span style={{ flex: 1 }} />
        <span className="tiny-note num">E{two(r.episodeNumero)}</span>
      </div>

      {edition ? (
        <div className="rep-edition">
          <textarea className="field" rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} disabled={pending} aria-label="Texte de la réplique" />
          <div className="rep-actions">
            <button type="button" className="btn btn-primary btn-mini" onClick={enregistrerTexte} disabled={pending || !texte.trim()}>
              Enregistrer
            </button>
            <button type="button" className="btn btn-ghost btn-mini" onClick={() => { setEdition(false); setTexte(r.texte); }} disabled={pending}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p className="dlg-line">{r.texte}</p>
      )}

      <div className="rep-usages">
        {r.usages.length === 0 ? (
          <span className="tiny-note">Pas encore placée dans un plan.</span>
        ) : (
          r.usages.map((u) => (
            <Link
              key={u.liaisonId}
              href={`/p/${projectId}/e/${u.episodeId}/plans/${u.planUuid}`}
              className={`chip rep-usage${u.verbatim === "ok" ? " is-ok" : " is-alerte"}`}
              title={u.verbatim === "ok" ? `${u.planTitre} — citée mot pour mot` : `${u.planTitre} — le prompt ne cite pas cette réplique mot pour mot`}
            >
              E{two(u.episodeNumero)} · {two(u.position)} · &lt;Audio {u.slot}&gt;
              {u.verbatim === "ok" ? <Icone nom="valide" taille={13} /> : " · prompt à resynchroniser"}
            </Link>
          ))
        )}
      </div>

      <div className="rep-prise">
        {r.audioSrc ? (
          <audio controls preload="none" src={r.audioSrc} className="rep-audio" />
        ) : r.fichier ? (
          <span className="tiny-note">prise introuvable sur le stockage ({r.fichier})</span>
        ) : (
          <span className="tiny-note">pas de prise</span>
        )}
        <DeposerFichier action={(fd) => uploaderPriseReplique(r.id, fd)} label="Déposer la prise" remplacer={r.fichier != null} />
        {r.fichier ? (
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => startTransition(async () => { await supprimerPriseReplique(r.id); })} disabled={pending} title="Retirer la prise">
            Retirer la prise
          </button>
        ) : null}
        {r.fichier ? (
          r.dureeSecondes != null ? (
            <span className="vstat fit">{r.dureeSecondes} s mesurées</span>
          ) : (
            <span className="rep-duree">
              <span className="vstat tbd">à mesurer</span>
              <input className="field field-mono" value={duree} onChange={(e) => setDuree(e.target.value)} placeholder="s" size={4} aria-label="Durée mesurée en secondes" />
              <button type="button" className="btn btn-ghost btn-mini" onClick={fixerDuree} disabled={pending || !duree.trim()}>
                Fixer
              </button>
            </span>
          )
        ) : null}
        {r.priseObsolete ? <span className="vstat over">prise à refaire — le texte a changé</span> : null}
      </div>

      <div className="rep-actions">
        <select className="field" value={r.statut} onChange={(e) => statut(e.target.value)} disabled={pending} aria-label="Statut">
          {STATUTS_REPLIQUE.map((s) => (
            <option key={s} value={s}>
              {LIBELLE_STATUT_REPLIQUE[s]}
            </option>
          ))}
        </select>
        {!edition ? (
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => setEdition(true)} disabled={pending}>
            Modifier le texte
          </button>
        ) : null}
        <span style={{ flex: 1 }} />
        {refuse ? (
          <button type="button" className="btn btn-danger btn-mini" onClick={() => supprimer(true)} disabled={pending}>
            Forcer la suppression
          </button>
        ) : confirmer ? (
          <button type="button" className="btn btn-danger btn-mini" onClick={() => supprimer(false)} onBlur={() => setConfirmer(false)} disabled={pending}>
            Confirmer la suppression
          </button>
        ) : (
          <button type="button" className="btn btn-danger btn-mini" onClick={() => setConfirmer(true)} disabled={pending} title="Supprimer la réplique" aria-label="Supprimer la réplique">
            <Icone nom="supprimer" />
          </button>
        )}
      </div>

      {erreur ? <p className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</p> : null}
      {info ? <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>{info}</p> : null}
    </li>
  );
}
