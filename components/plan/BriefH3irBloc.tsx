"use client";

import { useEffect, useState, useTransition } from "react";
import { voirBriefH3ir } from "@/app/plans/actions";
import { GenererFiche } from "@/components/plan/GenererFiche";
import { CREATIVITES, DETAIL_STYLE_CAMERA, LIBELLE_CREATIVITE, LIBELLE_NIVEAU, RESUME_STYLE_CAMERA, STYLE_AUCUN, estMiseEnScene, type ReglagesResolus } from "@/lib/h3ir/reglages";
import { OptionsMiseEnScene } from "@/components/h3ir/OptionsMiseEnScene";

type Resultat = Awaited<ReturnType<typeof voirBriefH3ir>>;

/** Le brief Open H3 IR du plan : ce qu'on enverrait à `POST /v1/briefs`. Rien n'est lancé tant qu'on ne clique pas « Générer la fiche avec Open H3 IR ». Le JSON
 * se copie pour le coller dans la zone « Coller un brief JSON » de `h3ir-lab`.
 *
 * Créativité et style de mise en scène : les menus partent des valeurs ENREGISTRÉES (le plan, sinon sa scène, sinon le projet : `reglagesInitiaux`) ; en changer ici ne vaut que pour ce
 * lancement et n'enregistre rien. Pour les garder, on les règle sur le plan (« Modifier »), sur la scène ou sur le projet (page Brief). « Nombre de shots » reste libre. */
export function BriefH3irBloc({
  projectId,
  planUuid,
  demandeEnCours = null,
  reglagesInitiaux,
}: {
  projectId: number;
  planUuid: string;
  demandeEnCours?: number | null;
  reglagesInitiaux: ReglagesResolus;
}) {
  const [shots, setShots] = useState("");
  const [creativite, setCreativite] = useState<string>(reglagesInitiaux.creativite);
  const [style, setStyle] = useState<string>(reglagesInitiaux.styleCamera ?? STYLE_AUCUN);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [copie, setCopie] = useState(false);
  const [pending, demarrer] = useTransition();
  const nShots = shots.trim() === "" ? null : Number(shots);
  const modifieIci = creativite !== reglagesInitiaux.creativite || style !== (reglagesInitiaux.styleCamera ?? STYLE_AUCUN);

  useEffect(() => {
    demarrer(async () => {
      setResultat(await voirBriefH3ir(projectId, planUuid, { shots: nShots, director: style, creativity: creativite }));
    });
  }, [projectId, planUuid, nShots, style, creativite]);

  const json = resultat?.brief ? JSON.stringify(resultat.brief, null, 2) : "";
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch {
      // presse-papiers indisponible
    }
  };

  const o = reglagesInitiaux.origine;
  return (
    <section className="panel" aria-label="Brief Open H3 IR">
      <p className="tiny-note">
        Ce que Cadence enverrait à Open H3 IR pour ce plan. L&rsquo;intent est en français ici ; il est traduit en anglais au lancement.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "10px 0" }}>
        <label className="tiny-note">
          Nombre de shots{" "}
          <input type="number" min={1} max={10} placeholder="libre" value={shots} onChange={(e) => setShots(e.target.value)} style={{ width: 80 }} />
        </label>
        <label className="tiny-note">
          Créativité{" "}
          <select value={creativite} onChange={(e) => setCreativite(e.target.value)}>
            {CREATIVITES.map((c) => (
              <option key={c} value={c}>
                {LIBELLE_CREATIVITE[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="tiny-note">
          Style de mise en scène{" "}
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value={STYLE_AUCUN}>Aucun style</option>
            <OptionsMiseEnScene />
          </select>
        </label>
      </div>
      {estMiseEnScene(style) ? <p className="tiny-note">{DETAIL_STYLE_CAMERA[style]}</p> : null}
      <p className="tiny-note">
        Réglages enregistrés : créativité <b>{LIBELLE_CREATIVITE[reglagesInitiaux.creativite]}</b> ({LIBELLE_NIVEAU[o.creativite]}), mise en scène{" "}
        <b>{reglagesInitiaux.styleCamera ? RESUME_STYLE_CAMERA[reglagesInitiaux.styleCamera] : "aucun style"}</b> ({LIBELLE_NIVEAU[o.styleCamera]}).
        {modifieIci ? " Tu as changé un réglage ici : il ne vaut que pour ce lancement." : " Pour les changer durablement : « Modifier » sur le plan, la scène ou le projet."}
      </p>
      {resultat?.refus ? (
        <p className="tiny-note" role="alert" style={{ color: "var(--gold, #c9a227)" }}>
          {resultat.refus}
        </p>
      ) : null}
      {resultat && resultat.avertissements.length > 0 ? (
        <ul className="tiny-note" style={{ color: "var(--gold, #c9a227)" }}>
          {resultat.avertissements.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}
      {resultat?.brief ? (
        <div style={{ margin: "10px 0" }}>
          <GenererFiche
            projectId={projectId}
            planUuid={planUuid}
            demandeEnCours={demandeEnCours}
            libelle="Générer la fiche avec Open H3 IR"
            h3ir={{ shots: nShots, director: style, creativity: creativite }}
          />
          <p className="tiny-note" style={{ marginTop: 6 }}>
            Traduit l&rsquo;intent en anglais, compile, puis <b>remplace la fiche</b> du plan (prompt et références). L&rsquo;ancien prompt reste dans l&rsquo;historique du prompt.
          </p>
        </div>
      ) : null}
      {json ? (
        <>
          <pre className="fp-sec-texte" style={{ maxHeight: "55vh", overflow: "auto" }}>
            {json}
          </pre>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copier()}>
              {copie ? "Copié" : "Copier le JSON"}
            </button>
          </div>
        </>
      ) : pending && !resultat ? (
        <p className="tiny-note">Chargement…</p>
      ) : null}
    </section>
  );
}
