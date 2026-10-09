"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { enregistrerVoix, renommerVoix } from "@/app/voix/actions";
import { LANGUES_MOTEUR } from "@/lib/langues-tts";
import { nomVoix } from "@/lib/voix";

/** Scène 1 — « Qui prête sa voix ? » Le nom en très grand, éditable (soulignement en pointillés et crayon : on voit d'un coup d'œil
 * qu'il se modifie), le personnage en bulles, la langue, et — repliés — la voix critique et les notes sur la voix. Tout s'enregistre
 * tout seul (un instant après la frappe, tout de suite pour un choix). Un nom laissé vide revient au nom dérivé du personnage. La
 * suppression de la voix vit ici, tout en bas. */
export function SceneIdentite({
  assetId,
  nom,
  personnageId,
  personnages,
  langue,
  critique,
  description,
  suppression,
}: {
  assetId: number;
  /** Le nom affiché (choisi, sinon dérivé). */
  nom: string;
  personnageId: number | null;
  personnages: { id: number; code: string }[];
  langue: string;
  critique: boolean;
  description: string;
  suppression: ReactNode;
}) {
  const router = useRouter();
  const [valeur, setValeur] = useState(nom);
  const [perso, setPerso] = useState<number | null>(personnageId);
  const [lang, setLang] = useState(langue);
  const [crit, setCrit] = useState(critique);
  const [desc, setDesc] = useState(description);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [, startTransition] = useTransition();
  const edite = useRef(false);

  // Un nom que l'utilisateur n'a pas touché suit le serveur (changer de personnage change le nom dérivé).
  useEffect(() => {
    if (!edite.current) setValeur(nom);
  }, [nom]);

  // Le nom s'enregistre un instant après la frappe.
  useEffect(() => {
    if (!edite.current) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const r = await renommerVoix(assetId, valeur);
        if (r.ok) {
          edite.current = false;
          setRetour({ ok: true, texte: r.nom ? "Nom enregistré." : "Nom d’origine rétabli." });
          router.refresh();
        } else setRetour({ ok: false, texte: r.erreur });
      });
    }, 700);
    return () => clearTimeout(t);
  }, [valeur, assetId, router]);

  /** `annuler` : appelé si le serveur refuse (un personnage n'a qu'une voix), pour rendre à l'écran son choix précédent. */
  const enregistrer = (v: Parameters<typeof enregistrerVoix>[1], annuler?: () => void) =>
    startTransition(async () => {
      const r = await enregistrerVoix(assetId, v);
      if (r.ok) {
        setRetour(null);
        router.refresh();
      } else {
        annuler?.();
        setRetour({ ok: false, texte: r.erreur });
      }
    });

  const choisirPerso = (id: number | null) => {
    const avant = perso;
    setPerso(id);
    enregistrer({ personnageId: id }, () => setPerso(avant));
  };

  return (
    <>
      <p className="cn-acte">Scène 1 · Identité</p>
      <h2 className="cn-titre">
        Qui prête <em>sa voix</em> ?
      </h2>
      <label htmlFor="av-nom" className="cn-sr-seul">
        Nom de la voix
      </label>
      <div className="av-nom-wrap">
        <input
          id="av-nom"
          className="av-nom"
          type="text"
          value={valeur}
          maxLength={80}
          autoComplete="off"
          aria-describedby="av-nom-aide"
          onChange={(e) => {
            edite.current = true;
            setValeur(e.target.value);
          }}
        />
        <svg className="av-crayon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
          <path d="M13.5 6.5l4 4" />
        </svg>
      </div>
      <p className="av-aide" id="av-nom-aide">
        Clique sur le nom pour le modifier.
      </p>
      {retour ? (
        <p className={`av-retour ${retour.ok ? "is-ok" : "is-erreur"}`} role={retour.ok ? "status" : "alert"}>
          {retour.texte}
        </p>
      ) : null}

      <p className="av-q">Pour quel personnage</p>
      <div className="cn-nuage" role="group" aria-label="Personnage de la voix">
        <button type="button" className="cn-bulle" aria-pressed={perso == null} onClick={() => choisirPerso(null)}>
          Aucun
        </button>
        {personnages.map((p) => (
          <button key={p.id} type="button" className="cn-bulle" aria-pressed={perso === p.id} onClick={() => choisirPerso(p.id)}>
            {nomVoix({ code: p.code })}
          </button>
        ))}
      </div>

      <p className="av-q">Dans quelle langue</p>
      <div className="av-puces" role="group" aria-label="Langue des répliques">
        {LANGUES_MOTEUR.map((l) => (
          <button
            key={l.valeur}
            type="button"
            className="cn-puce"
            aria-pressed={lang === l.valeur}
            onClick={() => {
              setLang(l.valeur);
              enregistrer({ langue: l.valeur });
            }}
          >
            {l.libelle}
          </button>
        ))}
      </div>

      <details className="av-details">
        <summary>Notes sur la voix</summary>
        <label htmlFor="av-desc" className="cn-note" style={{ display: "block", marginTop: 10 }}>
          Ce qui rend la voix reconnaissable, et où elle ne tient pas. L&rsquo;IA s&rsquo;en sert pour proposer un timbre.
        </label>
        <textarea id="av-desc" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => enregistrer({ description: desc })} />
        <label className="chk chk-voix" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={crit}
            onChange={(e) => {
              setCrit(e.target.checked);
              enregistrer({ critique: e.target.checked });
            }}
          />
          Voix critique
        </label>
      </details>

      <div className="av-suppr">{suppression}</div>
    </>
  );
}
