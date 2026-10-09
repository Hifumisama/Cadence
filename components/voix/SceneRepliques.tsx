"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { genererPriseReplique } from "@/app/repliques/generation-actions";
import { supprimerPriseReplique, uploaderPriseReplique } from "@/app/repliques/actions";
import { NouvelleRepliqueForm } from "@/components/repliques/NouvelleRepliqueForm";
import { useTaches } from "@/components/taches/TachesProvider";
import { estActive, tachesDeAsset } from "@/lib/taches";
import { LIBELLE_STATUT_REPLIQUE } from "@/lib/repliques";
import type { OptionsLocuteur, RepliqueVue } from "@/lib/queries-repliques";
import { useAssistantVoix } from "./AssistantVoix";
import { CabineDoublage } from "./CabineDoublage";
import { DeposerFichier } from "./DeposerFichier";

type Filtre = "tout" | "afaire" | "faites";

const deux = (n: number) => String(n).padStart(2, "0");
const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const virgule = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Scène 6 — « Donne-lui la parole. » Les répliques de la voix en liste COMPACTE (une ligne : épisode, texte tronqué, état), pour
 * rester maniable avec beaucoup de répliques : recherche, filtres, progression, « Générer les manquantes ». Une seule ligne est
 * dépliée à la fois (texte en grand, prise à écouter, actions). Trois façons de produire une prise : Générer (la voix de référence
 * clonée dit le texte), Importer (un fichier fait ailleurs) et Doubler (on joue la réplique dans la cabine, la voix la redit avec notre
 * intonation). Sans voix de référence, les trois sont désactivées, avec le chemin pour la créer. */
export function SceneRepliques({
  projectId,
  assetId,
  repliques,
  sansReference,
  optionsLocuteur,
  episodes,
  locuteurInitial,
}: {
  projectId: number;
  assetId: number;
  repliques: RepliqueVue[];
  sansReference: boolean;
  optionsLocuteur: OptionsLocuteur;
  episodes: { id: number; label: string }[];
  locuteurInitial: string;
}) {
  const router = useRouter();
  const { aller } = useAssistantVoix();
  const { taches } = useTaches();
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [cabine, setCabine] = useState<RepliqueVue | null>(null);
  const [ajout, setAjout] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Les prises arrivent en arrière-plan (le worker les pose sur les répliques) : quand plus aucune génération de cette voix n'est
  // active, la page se recharge.
  const enCours = tachesDeAsset(taches, assetId).some(estActive);
  const etaitEnCours = useRef(false);
  useEffect(() => {
    if (etaitEnCours.current && !enCours) router.refresh();
    etaitEnCours.current = enCours;
  }, [enCours, router]);

  const aUnePrise = (r: RepliqueVue) => r.fichier != null && !r.priseObsolete;
  const faites = repliques.filter(aUnePrise).length;

  const affichees = useMemo(() => {
    const cherche = sansAccent(q.trim());
    return repliques.filter((r) => {
      if (filtre === "afaire" && aUnePrise(r)) return false;
      if (filtre === "faites" && !aUnePrise(r)) return false;
      return !cherche || sansAccent(`${r.texte} ${r.locuteur.label}`).includes(cherche);
    });
  }, [repliques, q, filtre]);

  const generer = (id: number) =>
    startTransition(async () => {
      const r = await genererPriseReplique(id);
      setRetour(r.ok ? { ok: true, texte: "Génération lancée. Le suivi est dans l’icône du bandeau." } : { ok: false, texte: r.erreur });
    });

  const genererLesManquantes = () =>
    startTransition(async () => {
      let lancees = 0;
      const refus = new Set<string>();
      for (const r of repliques.filter((x) => !aUnePrise(x))) {
        const res = await genererPriseReplique(r.id);
        if (res.ok) lancees += 1;
        else refus.add(res.erreur);
      }
      setRetour({ ok: lancees > 0, texte: `${lancees} prise${lancees > 1 ? "s" : ""} en file.${refus.size > 0 ? ` Non lancé : ${[...refus].join(" ; ")}` : ""}` });
    });

  const retirer = (id: number) =>
    startTransition(async () => {
      await supprimerPriseReplique(id);
      router.refresh();
    });

  const filtres: { cle: Filtre; libelle: string }[] = [
    { cle: "tout", libelle: "Toutes" },
    { cle: "afaire", libelle: "À faire" },
    { cle: "faites", libelle: "Faites" },
  ];

  return (
    <>
      <p className="cn-acte">Scène 6 · Répliques</p>
      <h2 className="cn-titre">
        Donne-lui <em>la parole</em>.
      </h2>
      <p className="cn-sous">Trois façons de produire chaque réplique : la générer, l&rsquo;importer, ou la jouer toi-même et la faire redire par cette voix.</p>

      {sansReference ? (
        <div className="av-avert">
          <span className="av-etat is-todo"><i />Pas de voix de référence</span>
          <button type="button" className="cn-lien" onClick={() => aller("reference")}>
            Créer la voix d&rsquo;abord
          </button>
        </div>
      ) : null}

      <div className="av-rep-barre">
        <input type="search" className="av-rech" placeholder="Chercher une réplique…" aria-label="Chercher une réplique" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="av-puces" role="group" aria-label="Filtrer les répliques">
          {filtres.map((f) => (
            <button key={f.cle} type="button" className="cn-puce" aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}>
              {f.libelle}
            </button>
          ))}
        </div>
        <button type="button" className="btn" style={{ marginLeft: "auto" }} onClick={genererLesManquantes} disabled={sansReference || pending || faites === repliques.length}>
          Générer les manquantes
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setAjout((a) => !a)} aria-expanded={ajout}>
          {ajout ? "Fermer" : "Ajouter une réplique"}
        </button>
      </div>
      <div className="av-prog" style={{ maxWidth: 980 }} role="progressbar" aria-valuemin={0} aria-valuemax={repliques.length} aria-valuenow={faites} aria-label="Répliques produites">
        <i style={{ width: repliques.length ? `${(faites / repliques.length) * 100}%` : "0%" }} />
      </div>
      <p className="cn-note av-rep-compte">
        {repliques.length === 0 ? "Aucune réplique pour cette voix." : `${faites} sur ${repliques.length} répliques produites`}
        {enCours ? " · des prises sont en cours" : ""}
      </p>

      {ajout ? (
        <div style={{ maxWidth: 980, marginBottom: 16 }}>
          <NouvelleRepliqueForm projectId={projectId} options={optionsLocuteur} episodes={episodes} locuteurInitial={locuteurInitial} />
        </div>
      ) : null}

      {retour ? (
        <p className={`av-retour ${retour.ok ? "is-ok" : "is-erreur"}`} role={retour.ok ? "status" : "alert"}>
          {retour.texte}
        </p>
      ) : null}

      {repliques.length === 0 ? (
        <p className="cn-note">Écris la première avec « Ajouter une réplique » : elle naît dans cette voix. Celles de son personnage la prennent automatiquement.</p>
      ) : affichees.length === 0 ? (
        <p className="cn-note">Aucune réplique ne correspond.</p>
      ) : (
        <ul className="av-reps">
          {affichees.map((r) => {
            const ouverte = ouvert === r.id;
            const fait = aUnePrise(r);
            return (
              <li key={r.id} className={`av-rep${ouverte ? " is-ouvert" : ""}`}>
                <button type="button" className="av-rep-l" aria-expanded={ouverte} onClick={() => setOuvert(ouverte ? null : r.id)}>
                  <span className="av-rep-n">E{deux(r.episodeNumero)}</span>
                  <span className="av-rep-t">{r.texte}</span>
                  <span className={`av-etat ${fait ? "is-ok" : "is-todo"}`}>
                    <i />
                    {r.priseObsolete ? "À refaire" : r.fichier ? (LIBELLE_STATUT_REPLIQUE[r.statut as keyof typeof LIBELLE_STATUT_REPLIQUE] ?? "Prise") : "À faire"}
                  </span>
                </button>
                {ouverte ? (
                  <div className="av-rep-corps">
                    <p className="av-rep-gros">{r.texte}</p>
                    <span className="av-pill">
                      {r.locuteur.label}
                      {r.dureeSecondes != null ? ` · prise de ${virgule(r.dureeSecondes)} s` : ""}
                      {r.priseObsolete ? " · le texte a changé depuis la prise" : ""}
                    </span>
                    {r.audioSrc ? <audio controls preload="none" src={r.audioSrc} aria-label="Prise de la réplique" /> : null}
                    <div className="av-rep-actions">
                      <button type="button" className="btn" onClick={() => generer(r.id)} disabled={sansReference || pending}>
                        {r.fichier ? "Refaire" : "Générer"}
                      </button>
                      <DeposerFichier action={(fd) => uploaderPriseReplique(r.id, fd)} label="Importer" remplacer={r.fichier != null} disabled={sansReference} />
                      <button type="button" className="btn btn-primary" onClick={() => setCabine(r)} disabled={sansReference}>
                        🎙 Doubler
                      </button>
                      {r.fichier ? (
                        <button type="button" className="btn btn-ghost" onClick={() => retirer(r.id)} disabled={pending} title="Retirer la prise">
                          Retirer la prise
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="cn-note" style={{ marginTop: 14, maxWidth: 980 }}>
        Une génération par réplique. La durée mesurée sur la prise remonte à la fiche de plan. « Refaire » et « Doubler » remplacent la prise sans confirmation.
      </p>

      {cabine ? (
        <CabineDoublage
          repliqueId={cabine.id}
          texte={cabine.texte}
          dureePriseActuelle={cabine.dureeSecondes}
          onFermer={() => setCabine(null)}
          onLancee={() => {
            setCabine(null);
            setRetour({ ok: true, texte: "Doublage lancé. La prise remplacera l’actuelle dès qu’elle est prête ; le suivi est dans l’icône du bandeau." });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
