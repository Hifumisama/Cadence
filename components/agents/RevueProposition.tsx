"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { affiner, appliquerSelection, cocherChangement, cocherChangements, corrigerChangement, rejeter } from "@/app/agents/actions";
import { listerPlansEpisode } from "@/app/agents/lecture";
import type { ContexteEtape } from "@/components/agents/contexte";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import {
  AVERTISSEMENT,
  GROUPE_ECRASEMENT,
  LIBELLE_CIBLE,
  LIBELLE_OPERATION,
  estTacheActive,
  etatCochage,
  libellePosition,
  libelleRangs,
  lignesDiff,
  ordonnerGroupes,
  peutCocher,
  resumeCompteurs,
  type EtatCochage,
} from "@/lib/agents-affichage";
import type { EcrasementAConfirmer, VueChangement, VueGroupe, VueProposition } from "@/lib/agents/types";

const SYMBOLE_GRAVITE = { info: "ℹ", attention: "▲", bloquant: "■" } as const;

/** Étape « Proposition » : la REVUE. Le risque d'écrasement est en tête, puis les mises à jour
 * du brief, puis le reste. Cochage par changement ET par groupe ; l'état affiché est celui du
 * serveur (créations cochées, modifications d'éléments validés et suppressions décochées par
 * défaut). Trois gestes : Rejeter, Affiner, Réinitialiser. Écraser du validé demande une
 * confirmation en deux temps qui liste ce qui sera perdu. */
export function EtapeProposition({ ctx }: { ctx: ContexteEtape }) {
  const { prop, conv, occupe } = ctx;
  const [affinage, setAffinage] = useState(false);
  const [retour, setRetour] = useState("");
  const [confirmation, setConfirmation] = useState<EcrasementAConfirmer[] | null>(null);
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

  const retourEtape = conv.profondeur === "courte" ? "consigne" : "brief";

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
        <div className="gd-row">
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

  const appliquer = async (confirme: boolean) => {
    await ctx.lancer(
      async () => {
        const r = await appliquerSelection(prop.uuid, confirme ? { confirmeEcrasement: true } : undefined);
        if (!r.ok && r.confirmationRequise && r.confirmationRequise.length > 0) {
          setConfirmation(r.confirmationRequise);
          // Pas une erreur à afficher : on montre la confirmation à la place.
          return { ok: true as const, attente: true as const };
        }
        if (r.ok) {
          setConfirmation(null);
          ctx.setDernierResultat(r);
          return { ok: true as const, attente: false as const };
        }
        return r;
      },
      (r) => {
        if ("attente" in r && !r.attente) ctx.aller("applique");
      },
    );
  };

  return (
    <div className="ag-etape-corps">
      <EnteteProposition prop={prop} />

      {groupes.length === 0 ? <p className="ag-vide">Cette proposition ne contient aucun changement.</p> : null}

      {groupes.map((g) => (
        <GroupeChangements key={g.id} groupe={g} prop={prop} ctx={ctx} lecture={appliquee} rangDe={rangDe} />
      ))}

      <div className="ag-barre-revue">
        <p className="ag-compteurs" role="status">
          {resumeCompteurs(prop.compteurs)}
          {prop.compteurs.inventions > 0 ? ` · ${prop.compteurs.inventions} invention${prop.compteurs.inventions > 1 ? "s" : ""} déclarée${prop.compteurs.inventions > 1 ? "s" : ""}` : ""}
        </p>

        {confirmation ? (
          <div className="ag-confirmation" role="alertdialog" aria-label="Confirmer l'écrasement">
            <strong>Confirmer l&rsquo;écrasement</strong>
            <p className="tiny-note">Ces éléments déjà validés seront remplacés. Cette action ne s&rsquo;annule pas.</p>
            <ul>
              {confirmation.map((e) => (
                <li key={e.changementId}>
                  <span className="ag-conf-nom">{e.libelle}</span>
                  <span className="tiny-note">Sera écrasé : {e.ecrase}</span>
                </li>
              ))}
            </ul>
            <div className="gd-row">
              <button type="button" className="btn btn-gold" onClick={() => void appliquer(true)} disabled={occupe}>
                {occupe ? "…" : "Écraser et appliquer"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmation(null)} disabled={occupe}>
                Retour à la revue
              </button>
            </div>
          </div>
        ) : null}

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
              disabled={occupe || prop.compteurs.selectionnes === 0 || confirmation != null}
              onClick={() => (nbEcrasements > 0 ? setConfirmation(prop.ecrasements) : void appliquer(false))}
              title={prop.compteurs.selectionnes === 0 ? "Rien n'est sélectionné" : undefined}
            >
              {occupe ? "…" : `Appliquer la sélection (${prop.compteurs.selectionnes})`}
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
      {prop.consigne ? <p className="tiny-note">Ta demande : « {prop.consigne} »</p> : null}
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
}: {
  groupe: VueGroupe;
  prop: VueProposition;
  ctx: ContexteEtape;
  lecture: boolean;
  rangDe: (uuid: string) => number | null;
}) {
  const etat = etatCochage(groupe);
  const special = groupe.id === GROUPE_ECRASEMENT;
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
        <span className="num tiny-note">
          {groupe.coches}/{groupe.total}
        </span>
      </header>
      {special ? (
        <p className="tiny-note ag-groupe-note">
          Ces éléments existent déjà et seraient remplacés. Rien n&rsquo;est écrasé sans que tu les aies cochés puis confirmés.
        </p>
      ) : null}
      <ul className="ag-chgs">
        {groupe.changements.map((c) => (
          <Changement key={c.id} c={c} ctx={ctx} lecture={lecture} ouvert={special} rangDe={rangDe} />
        ))}
      </ul>
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
  const diff = useMemo(() => lignesDiff(c.avant, c.apres), [c.avant, c.apres]);
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

      {diff.lignes.length > 0 ? (
        <details className="ag-diff-bloc" open={ouvert || undefined}>
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
