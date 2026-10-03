"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { affiner, appliquerSelection, cocherChangement, cocherChangements, corrigerChangement, rejeter } from "@/app/agents/actions";
import { listerPlansEpisode } from "@/app/agents/lecture";
import type { ContexteEtape } from "@/components/agents/contexte";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { BoutonRelancerEchecs, EtapeLotEnCours, ListeSousTaches } from "@/components/agents/EtapeLot";
import {
  AVERTISSEMENT,
  GROUPE_ECRASEMENT,
  LIBELLE_CIBLE,
  LIBELLE_OPERATION,
  estGroupeEpisode,
  estTacheActive,
  etatCochage,
  libellePosition,
  libelleRangs,
  lignesDiff,
  motsDuLot,
  ordonnerGroupes,
  parSousGroupe,
  peutCocher,
  resumeCompteurs,
  type EtatCochage,
} from "@/lib/agents-affichage";
import { lireApresFiche } from "@/lib/agents/fiches";
import type { VueChangement, VueGroupe, VueProposition } from "@/lib/agents/types";

const SYMBOLE_GRAVITE = { info: "ℹ", attention: "▲", bloquant: "■" } as const;

/** Étape « Proposition » : la REVUE. Le risque d'écrasement est en tête, puis les mises à jour
 * du brief, puis le reste. Cochage par changement ET par groupe ; l'état affiché est celui du
 * serveur (créations cochées, modifications d'éléments validés et suppressions décochées par
 * défaut). Trois gestes : Rejeter, Affiner, Réinitialiser. Écraser du validé : cocher
 * l'élément (décoché par défaut, montré en tête) vaut décision, il n'y a pas de seconde
 * confirmation ; le bouton d'application annonce le nombre d'écrasements. */
export function EtapeProposition({ ctx }: { ctx: ContexteEtape }) {
  const { prop, conv, occupe } = ctx;
  const [affinage, setAffinage] = useState(false);
  const [retour, setRetour] = useState("");
  const [plans, setPlans] = useState<Map<string, number>>(new Map());

  const episodeId = ctx.demande.episodeId;
  useEffect(() => {
    if (episodeId == null) return;
    let annule = false;
    listerPlansEpisode(episodeId)
      .then((l) => {
        if (!annule) setPlans(new Map(l.map((p) => [p.uuid, p.rang])));
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [episodeId, prop?.uuid]);
  const rangDe = (uuid: string) => plans.get(uuid) ?? null;

  // Un lot de scénarios part de l'étape « Appliqué » du squelette : c'est là qu'on revient.
  const retourEtape = conv.profondeur === "courte" ? "consigne" : prop?.lot ? "applique" : "brief";

  if (!prop) {
    return (
      <div className="ag-etape-corps">
        {estTacheActive(conv.tache) ? <EtatTacheAgent tache={conv.tache} /> : <p className="ag-vide">Aucune proposition pour l&rsquo;instant.</p>}
        <div className="gd-row">
          <button type="button" className="btn btn-ghost" onClick={() => ctx.aller(retourEtape)}>
            ← {conv.profondeur === "courte" ? "Revenir à la consigne" : "Revenir au brief"}
          </button>
        </div>
      </div>
    );
  }

  if (prop.lot && prop.statut === "en_generation") return <EtapeLotEnCours prop={prop} ctx={ctx} />;

  if (prop.statut === "en_generation" || estTacheActive(prop.tache)) {
    return (
      <div className="ag-etape-corps">
        <p className="ag-vide">L&rsquo;agent prépare la proposition. Tu peux fermer cette fenêtre : elle continue, et le panneau des générations te dira quand elle est prête.</p>
        <EtatTacheAgent tache={prop.tache} />
      </div>
    );
  }

  if (prop.statut === "echouee") {
    return (
      <div className="ag-etape-corps">
        <p className="ag-erreur" role="alert">
          La proposition a échoué{prop.erreur ? ` : ${prop.erreur}` : "."}
        </p>
        {prop.lot ? <ListeSousTaches prop={prop} ctx={ctx} /> : null}
        <div className="gd-row">
          {prop.lot ? <BoutonRelancerEchecs prop={prop} ctx={ctx} /> : null}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={occupe}
            onClick={() => void ctx.lancer(() => rejeter(prop.uuid), () => ctx.aller(retourEtape))}
          >
            Rejeter et revenir
          </button>
        </div>
      </div>
    );
  }

  const appliquee = prop.statut === "appliquee" || prop.statut === "partielle";
  const groupes = ordonnerGroupes(prop.groupes);
  const nbEcrasements = prop.ecrasements.length;
  // Un lot a un groupe par épisode : seul le premier s'ouvre d'office (la revue peut compter des
  // centaines de changements), l'écrasement reste toujours ouvert.
  const premierEpisode = groupes.find((g) => estGroupeEpisode(g.id))?.id ?? null;
  const aRelancer = prop.lot ? prop.lot.echecs + prop.lot.annulees : 0;

  // Pas de seconde confirmation : un écrasement est décoché par défaut, le cocher est déjà la
  // décision (la revue l'a montré en tête avec ce qui sera remplacé). Le serveur exige quand
  // même `confirmeEcrasement`, que cette action pose en toute connaissance de cause.
  const appliquer = async () => {
    await ctx.lancer(
      async () => {
        const r = await appliquerSelection(prop.uuid, { confirmeEcrasement: true });
        if (r.ok) {
          ctx.setDernierResultat(r);
          return { ok: true as const };
        }
        return r;
      },
      (r) => {
        if (r.ok) ctx.aller("applique");
      },
    );
  };

  return (
    <div className="ag-etape-corps">
      <EnteteProposition prop={prop} />

      {prop.diagnostic ? <DiagnosticVisionnage d={prop.diagnostic} /> : null}

      {prop.lot ? (
        <details className="ag-contexte ag-lot-bloc" open={aRelancer > 0 || undefined}>
          <summary>
            {motsDuLot(prop.skill).titre} <span className="num">({prop.lot.terminees}/{prop.lot.total})</span>
            {aRelancer > 0 ? <span className="ag-lot-alerte"> · {aRelancer} à relancer</span> : null}
          </summary>
          <ListeSousTaches prop={prop} ctx={ctx} lectureSeule={appliquee} />
        </details>
      ) : null}

      {groupes.length === 0 ? (
        <p className="ag-vide">{prop.diagnostic ? "Aucune écriture proposée : le diagnostic ci-dessus dit pourquoi. Rejette pour revenir, ou affine." : "Cette proposition ne contient aucun changement."}</p>
      ) : null}

      {groupes.map((g) => (
        <GroupeChangements key={g.id} groupe={g} prop={prop} ctx={ctx} lecture={appliquee} rangDe={rangDe} ouvertParDefaut={!estGroupeEpisode(g.id) || g.id === premierEpisode} />
      ))}

      <div className="ag-barre-revue">
        <p className="ag-compteurs" role="status">
          {resumeCompteurs(prop.compteurs)}
          {prop.compteurs.inventions > 0 ? ` · ${prop.compteurs.inventions} invention${prop.compteurs.inventions > 1 ? "s" : ""} déclarée${prop.compteurs.inventions > 1 ? "s" : ""}` : ""}
        </p>

        {affinage ? (
          <div className="ag-affiner">
            <label className="gd-lbl" htmlFor="ag-retour">
              Ton retour pour affiner
            </label>
            <textarea
              id="ag-retour"
              className="field"
              rows={3}
              value={retour}
              onChange={(e) => setRetour(e.target.value)}
              placeholder="Ex. Garde 1 et 3, change 2 : plus sombre, sans dialogue."
            />
            <div className="gd-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!retour.trim() || occupe}
                onClick={() =>
                  void ctx.lancer(
                    () => affiner(prop.uuid, retour.trim()),
                    () => {
                      setAffinage(false);
                      setRetour("");
                    },
                  )
                }
              >
                {occupe ? "…" : "Affiner"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setAffinage(false)} disabled={occupe}>
                Annuler
              </button>
              <span className="tiny-note">Une nouvelle proposition naît de celle-ci ; l&rsquo;actuelle est écartée.</span>
            </div>
          </div>
        ) : null}

        {appliquee ? (
          <p className="tiny-note">Cette proposition est déjà appliquée.</p>
        ) : (
          <div className="ag-gestes">
            <div className="gd-row">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={occupe}
                onClick={() => void ctx.lancer(() => rejeter(prop.uuid), () => ctx.aller(retourEtape))}
                title="Abandonner cette proposition ; la conversation reste"
              >
                Rejeter
              </button>
              <button type="button" className="btn btn-ghost" disabled={occupe} onClick={() => setAffinage((v) => !v)} aria-expanded={affinage}>
                Affiner…
              </button>
              <button type="button" className="btn btn-ghost" disabled={occupe} onClick={ctx.demanderReinitialisation}>
                Réinitialiser…
              </button>
            </div>
            <button
              type="button"
              className="btn btn-gold"
              disabled={occupe || prop.compteurs.selectionnes === 0}
              onClick={() => void appliquer()}
              title={prop.compteurs.selectionnes === 0 ? "Rien n'est sélectionné" : undefined}
            >
              {occupe
                ? "…"
                : `Appliquer la sélection (${prop.compteurs.selectionnes}${nbEcrasements > 0 ? ` · dont ${nbEcrasements} écrasement${nbEcrasements > 1 ? "s" : ""}` : ""})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EnteteProposition({ prop }: { prop: VueProposition }) {
  return (
    <div className="ag-prop-tete">
      {prop.resume ? <p className="ag-resume">{prop.resume}</p> : null}
      {prop.parentUuid ? (
        <p className="tiny-note ag-derivee">
          Dérivée de la proposition précédente{prop.retour ? <> · ton retour : « {prop.retour} »</> : null}
        </p>
      ) : null}
      {prop.consigne ? (
        <p className="tiny-note">
          {prop.skill === "iteration-plan" ? "Ce que tu as vu" : "Ta demande"} : « {prop.consigne} »
        </p>
      ) : null}
      {prop.contexte.length > 0 ? (
        <details className="ag-contexte">
          <summary>
            Contexte utilisé <span className="num">({prop.contexte.length})</span>
          </summary>
          <ul>
            {prop.contexte.map((c, i) => (
              <li key={`${c.type}-${c.ref ?? i}`}>{c.libelle}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const LIBELLE_CONFIANCE = { haute: "haute", moyenne: "moyenne", faible: "faible" } as const;
const LIBELLE_CATEGORIE: Record<string, string> = {
  "decoupage-scenario": "découpage ou scénario (hors du prompt)",
  cadence: "cadence des shots",
  vocabulaire: "vocabulaire",
  negation: "consigne négative",
  "etat-arrivee": "état d'arrivée pris pour une première frame",
  camera: "caméra",
  lumiere: "lumière",
  duree: "durée",
  reference: "référence",
  modele: "limite du modèle",
  autre: "autre",
};

/** Le diagnostic d'une correction après visionnage (iteration-plan) : symptôme, cause, confiance, vérification à
 * faire au prochain rendu ; la candidate au lexique n'est jamais écrite (information). */
function DiagnosticVisionnage({ d }: { d: NonNullable<VueProposition["diagnostic"]> }) {
  return (
    <section className="ag-groupe" aria-label="Diagnostic après visionnage">
      <header className="ag-groupe-tete">
        <span className="ag-groupe-titre">Diagnostic après visionnage</span>
        <span className={`tiny-note${d.confiance === "faible" ? " ag-lot-alerte" : ""}`}>confiance {LIBELLE_CONFIANCE[d.confiance]}</span>
      </header>
      <ul className="ag-avert">
        {!d.dureeCoherente ? (
          <li className="ag-avert-attention">
            <span aria-hidden="true">▲</span> <strong>Durée du rendu incohérente</strong> — un rendu à la mauvaise durée comprime ou étire tous ses temps : régénère avant de corriger l&rsquo;écriture.
          </li>
        ) : null}
        <li>
          <strong>Symptôme</strong> — {d.symptome}
        </li>
        <li>
          <strong>Cause visée</strong> — {d.cause}
          {d.categorie ? <span className="tiny-note"> ({LIBELLE_CATEGORIE[d.categorie] ?? d.categorie})</span> : null}
        </li>
        {d.verification ? (
          <li>
            <strong>À vérifier au prochain rendu</strong> — {d.verification}
          </li>
        ) : null}
        {d.abandon?.propose ? (
          <li className="ag-avert-attention">
            <span aria-hidden="true">▲</span> <strong>Abandon proposé</strong> — {d.abandon.raison || "trois corrections de causes différentes n'ont pas suffi : change de mouvement."}
          </li>
        ) : null}
        {d.entreeLexique ? (
          <li className="ag-avert-info">
            <span aria-hidden="true">ℹ</span> <strong>Candidate au lexique</strong> (rien n&rsquo;est écrit : à ajouter à la main si le prochain rendu confirme) —{" "}
            {d.entreeLexique.symptome} → {d.entreeLexique.cause} → « {d.entreeLexique.formulationQuiTient} »
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function CaseTriEtat({ etat, onChange, label }: { etat: EtatCochage; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = etat === "partiel";
  }, [etat]);
  return <input ref={ref} type="checkbox" checked={etat === "tous"} disabled={etat === "indisponible"} onChange={onChange} aria-label={label} />;
}

function GroupeChangements({
  groupe,
  prop,
  ctx,
  lecture,
  rangDe,
  ouvertParDefaut,
}: {
  groupe: VueGroupe;
  prop: VueProposition;
  ctx: ContexteEtape;
  lecture: boolean;
  rangDe: (uuid: string) => number | null;
  ouvertParDefaut: boolean;
}) {
  const etat = etatCochage(groupe);
  const special = groupe.id === GROUPE_ECRASEMENT;
  const episode = estGroupeEpisode(groupe.id);
  // Seuls les changements d'un groupe OUVERT sont rendus : un lot en compte des centaines.
  const [ouvert, setOuvert] = useState(ouvertParDefaut || special);
  const blocs = useMemo(() => (episode ? parSousGroupe(groupe.changements) : [{ titre: null as string | null, changements: groupe.changements }]), [episode, groupe.changements]);
  return (
    <section className={`ag-groupe${special ? " ag-groupe-ecrasement" : ""}`} aria-label={groupe.titre}>
      <header className="ag-groupe-tete">
        <label className="ag-case">
          <CaseTriEtat
            etat={etat}
            label={`Tout ${etat === "tous" ? "décocher" : "cocher"} : ${groupe.titre}`}
            onChange={() => void ctx.lancer(() => cocherChangements(prop.uuid, { groupe: groupe.id }, etat !== "tous"))}
          />
          <span className="ag-groupe-titre">{special ? "⚠ " : ""}{groupe.titre}</span>
        </label>
        <span className="gd-row">
          <span className="num tiny-note">
            {groupe.coches}/{groupe.total}
          </span>
          {episode ? (
            <button type="button" className="ag-bascule" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} aria-label={`${ouvert ? "Replier" : "Déplier"} : ${groupe.titre}`}>
              {ouvert ? "▾" : "▸"}
            </button>
          ) : null}
        </span>
      </header>
      {special ? (
        <p className="tiny-note ag-groupe-note">
          Ces éléments existent déjà et seraient remplacés. Rien n&rsquo;est écrasé sans que tu les aies cochés puis confirmés.
        </p>
      ) : null}
      {ouvert
        ? blocs.map((b) => (
            <div key={b.titre ?? "_"} className="ag-bloc-scene">
              {b.titre ? <h4 className="ag-scene-titre">Scène · {b.titre}</h4> : null}
              <ul className="ag-chgs">
                {b.changements.map((c) => (
                  <Changement key={c.id} c={c} ctx={ctx} lecture={lecture} ouvert={special} rangDe={rangDe} />
                ))}
              </ul>
            </div>
          ))
        : null}
    </section>
  );
}

function Changement({
  c,
  ctx,
  lecture,
  ouvert,
  rangDe,
}: {
  c: VueChangement;
  ctx: ContexteEtape;
  lecture: boolean;
  ouvert: boolean;
  rangDe: (uuid: string) => number | null;
}) {
  const cochable = peutCocher(c) && !lecture;
  const position = libellePosition(c.position, rangDe);
  const rangs = libelleRangs(c.rangsDeplaces);
  // Le tableau avant/après ne se calcule ni ne se rend que déplié (centaines de changements).
  const [diffOuvert, setDiffOuvert] = useState(ouvert);
  const diff = useMemo(() => (diffOuvert ? lignesDiff(c.avant, c.apres) : { lignes: [], identiques: 0 }), [diffOuvert, c.avant, c.apres]);
  const aUnDiff = c.apres != null || c.avant != null;
  const dureeCourante = typeof (c.apres as { dureeGenerationSecondes?: unknown } | null)?.dureeGenerationSecondes === "number"
    ? String((c.apres as { dureeGenerationSecondes: number }).dureeGenerationSecondes)
    : "";
  const [duree, setDuree] = useState(dureeCourante);
  const peutCorriger = c.bloque && c.cibleType === "plan";

  return (
    <li className={`ag-chg${c.bloque ? " ag-chg-bloque" : ""}${c.refuseRaison ? " ag-chg-refuse" : ""}${c.coche ? " ag-chg-coche" : ""}`}>
      <div className="ag-chg-tete">
        <input
          type="checkbox"
          checked={c.coche}
          disabled={!cochable || ctx.occupe}
          onChange={() => void ctx.lancer(() => cocherChangement(c.id, !c.coche))}
          aria-label={`Retenir : ${c.libelle}`}
        />
        <span className={`ag-op ag-op-${c.operation}`}>{LIBELLE_OPERATION[c.operation]}</span>
        <span className="ag-chg-cible">{LIBELLE_CIBLE[c.cibleType]}</span>
        <span className="ag-chg-libelle">{c.libelle}</span>
      </div>

      {c.avertissements.length > 0 ? (
        <ul className="ag-avert">
          {c.avertissements.map((a, i) => {
            const def = AVERTISSEMENT[a.type];
            return (
              <li key={`${a.type}-${i}`} className={`ag-avert-${def.gravite}`}>
                <span aria-hidden="true">{SYMBOLE_GRAVITE[def.gravite]}</span> <strong>{def.libelle}</strong>
                {a.texte && a.texte !== def.libelle ? <> — {a.texte}</> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {c.refuseRaison ? <p className="ag-refus">Refusé : {c.refuseRaison}</p> : null}
      {c.ecrase ? <p className="ag-ecrase">Sera écrasé : {c.ecrase}</p> : null}
      {position ? <p className="tiny-note">{position}</p> : null}
      {rangs ? <p className="tiny-note">{rangs}</p> : null}

      {peutCorriger && !lecture ? (
        <div className="ag-correction gd-row">
          <label className="tiny-note" htmlFor={`ag-duree-${c.id}`}>
            Durée de génération (s)
          </label>
          <input
            id={`ag-duree-${c.id}`}
            className="field ag-duree"
            inputMode="numeric"
            value={duree}
            onChange={(e) => setDuree(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary btn-mini"
            disabled={ctx.occupe || !Number.isFinite(Number(duree)) || Number(duree) <= 0}
            onClick={() => void ctx.lancer(() => corrigerChangement(c.id, { dureeGenerationSecondes: Math.round(Number(duree)) }))}
          >
            Corriger
          </button>
        </div>
      ) : null}

      {c.cibleType === "fiche" ? (
        <ApercuFiche c={c} ouvert={ouvert} />
      ) : aUnDiff ? (
        <details className="ag-diff-bloc" open={ouvert || undefined} onToggle={(e) => setDiffOuvert((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Avant / après</summary>
          <table className="ag-diff">
            <tbody>
              {diff.lignes.map((l, i) => (
                <tr key={`${l.cle ?? "_"}-${i}`} className={`ag-diff-${l.etat}`}>
                  <th scope="row">{l.cle ?? "—"}</th>
                  <td className="ag-diff-avant">{l.avant ?? <span className="ag-diff-vide">(rien)</span>}</td>
                  <td className="ag-diff-apres">{l.apres ?? <span className="ag-diff-vide">(supprimé)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {diff.identiques > 0 ? <p className="tiny-note">{diff.identiques} champ{diff.identiques > 1 ? "s" : ""} inchangé{diff.identiques > 1 ? "s" : ""}.</p> : null}
        </details>
      ) : null}
    </li>
  );
}

const LABEL_REF = { picture: "Picture", audio: "Audio" } as const;
const STYLE_TEXTE = { whiteSpace: "pre-wrap", fontSize: 12, margin: "4px 0 8px", maxHeight: 260, overflow: "auto" } as const;

/** Aperçu d'une fiche de plan (cible `fiche`) : les six sections telles qu'elles seront écrites, les
 * références (labels et assets) et la durée ; ce qu'elles remplacent reste dépliable. Rendu à la demande. */
function ApercuFiche({ c, ouvert }: { c: VueChangement; ouvert: boolean }) {
  const [deplie, setDeplie] = useState(ouvert);
  const apres = lireApresFiche(c.apres);
  const avant = lireApresFiche(c.avant);
  const sections = Object.entries(apres.sections ?? {});
  const passages = apres.passages ?? [];
  return (
    <details className="ag-diff-bloc" open={ouvert || passages.length > 0 || undefined} onToggle={(e) => setDeplie((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        {passages.length > 0 ? `Correction · ${passages.length} passage${passages.length > 1 ? "s" : ""} remplacé${passages.length > 1 ? "s" : ""} · ` : ""}
        Aperçu de la fiche · {sections.length === 6 ? "six sections" : `${sections.length} section${sections.length > 1 ? "s" : ""}`}
        {apres.refs ? ` · ${apres.refs.length} référence${apres.refs.length > 1 ? "s" : ""}` : ""}
        {apres.dureeGenerationSecondes != null ? ` · ${apres.dureeGenerationSecondes} s` : ""}
      </summary>
      {deplie || passages.length > 0 ? (
        <div>
          {passages.length > 0 ? (
            <table className="ag-diff">
              <tbody>
                {passages.map((p, i) => (
                  <tr key={`${p.section}-${i}`} className="ag-diff-modifie">
                    <th scope="row">{p.section}</th>
                    <td className="ag-diff-avant">{p.avant || <span className="ag-diff-vide">(rien)</span>}</td>
                    <td className="ag-diff-apres">{p.apres || <span className="ag-diff-vide">(supprimé)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {apres.dureeGenerationSecondes != null && avant.dureeGenerationSecondes != null && avant.dureeGenerationSecondes !== apres.dureeGenerationSecondes ? (
            <p className="tiny-note">
              Durée de génération : {avant.dureeGenerationSecondes} s → {apres.dureeGenerationSecondes} s
            </p>
          ) : null}
          {apres.refs ? (
            <>
              <p className="tiny-note">
                <strong>Références</strong> (remplacent celles du plan ; les voix gardent leurs slots)
              </p>
              {apres.refs.length === 0 ? <p className="tiny-note">Aucune.</p> : null}
              <ul className="tiny-note">
                {apres.refs.map((r) => (
                  <li key={`${r.type}-${r.slot}`}>
                    &lt;{LABEL_REF[r.type]} {r.slot}&gt; · <span className="num">{r.asset}</span>
                    {r.role ? ` — ${r.role}` : ""}
                  </li>
                ))}
              </ul>
              {avant.refs && avant.refs.length > 0 ? (
                <p className="tiny-note">
                  Actuelles : {avant.refs.map((r) => `<${LABEL_REF[r.type]} ${r.slot}> ${r.asset}`).join(", ")}
                </p>
              ) : null}
            </>
          ) : null}
          {sections.map(([nom, texte]) => {
            const actuel = avant.sections?.[nom as keyof typeof avant.sections];
            return (
              <div key={nom}>
                <p className="tiny-note">
                  <strong>{nom}</strong>
                </p>
                <pre style={STYLE_TEXTE}>{texte || "(vide)"}</pre>
                {actuel?.trim() ? (
                  <details>
                    <summary className="tiny-note">Texte actuel (sera remplacé)</summary>
                    <pre style={STYLE_TEXTE}>{actuel}</pre>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </details>
  );
}
