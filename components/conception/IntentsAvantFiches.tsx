"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { ecrireFichesProjet, modifierIntentPlan } from "@/app/creation/actions";
import type { PlanIntent, SuiviFichePlan } from "@/lib/agents/creation-vue";
import { plansAEcrire } from "@/lib/agents/creation";

const pad = (n: number) => String(n).padStart(2, "0");

/** Un champ d'intent qui s'agrandit avec son texte : l'intent se relit en entier, sans défiler dans un petit bloc (CR-01 du cahier de tests). */
function ChampIntent({ valeur, onChange, etiquette }: { valeur: string; onChange: (v: string) => void; etiquette: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [valeur]);
  return <textarea ref={ref} aria-label={etiquette} value={valeur} onChange={(e) => onChange(e.target.value)} />;
}
/** Sondage du suivi tant qu'une fiche s'écrit (une route, pas une action serveur : voir app/api/creation/[projectId]/fiches). */
const SONDAGE_MS = 3000;

/** Après la création (lib/agents/creation.ts) : les intents des plans (leur description), à relire AVANT d'écrire les fiches — une fiche écrite sur un
 * intent faux coûte un rendu et une itération pour rien. Un plan sans fiche se corrige ici ; un plan qui a déjà sa fiche se lit, et se retouche dans
 * son atelier. « Écrire les fiches » pose une demande de fiche PAR PLAN (sans fiche par défaut, ou tous), hors création ; chaque plan montre ensuite
 * l'étape de sa demande (références, assets, images, compilation), « Fiche écrite » ou son échec. « Plus tard » laisse les plans tels quels (chaque
 * fiche reste possible depuis l'atelier du plan, ou en lot depuis la page Scénario). */
export function IntentsAvantFiches({
  projectId,
  initial,
  suiviInitial,
  onPlusTard,
  onLancees,
}: {
  projectId: number;
  initial: PlanIntent[];
  suiviInitial: SuiviFichePlan[];
  onPlusTard: () => void;
  /** Des fiches viennent d'être lancées : la page relit l'état de la création (nombre de plans sans fiche). */
  onLancees?: () => void;
}) {
  const [plans, setPlans] = useState<PlanIntent[]>(initial);
  const [suivi, setSuivi] = useState<SuiviFichePlan[]>(suiviInitial);
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [erreurs, setErreurs] = useState<Record<string, string | null>>({});
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [tous, setTous] = useState(false);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [pending, demarrer] = useTransition();
  const enVol = useRef(false);

  const relire = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch(`/api/creation/${projectId}/fiches`, { cache: "no-store" });
      if (!res.ok) return;
      const lu = (await res.json()) as { plans: PlanIntent[]; suivi: SuiviFichePlan[] };
      setPlans(lu.plans);
      setSuivi(lu.suivi);
    } catch {
      /* serveur qui redémarre : au prochain tour */
    } finally {
      enVol.current = false;
    }
  }, [projectId]);

  // La page a pu être chargée pendant la création (plans pas encore écrits) : on relit à l'ouverture.
  useEffect(() => {
    void relire();
  }, [relire]);

  const suiviDe = new Map(suivi.map((s) => [s.planUuid, s]));
  const enCours = suivi.filter((s) => s.statut === "en_cours").length;
  useEffect(() => {
    if (enCours === 0) return;
    const t = setInterval(() => void relire(), SONDAGE_MS);
    return () => clearInterval(t);
  }, [enCours, relire]);

  const aLancer = plansAEcrire(plans.map((p) => ({ uuid: p.uuid, aUneFiche: p.aUneFiche, demandeEnCours: suiviDe.get(p.uuid)?.statut === "en_cours" })), tous).length;
  const avecFiche = plans.filter((p) => p.aUneFiche).length;
  const modifies = Object.keys(brouillons).filter((u) => brouillons[u] !== plans.find((p) => p.uuid === u)?.description);

  const enregistrer = (uuid: string) =>
    demarrer(async () => {
      const texte = brouillons[uuid] ?? "";
      const r = await modifierIntentPlan(projectId, uuid, texte);
      if (!r.ok) {
        setErreurs((e) => ({ ...e, [uuid]: r.erreur }));
        return;
      }
      setErreurs((e) => ({ ...e, [uuid]: null }));
      await relire();
      setBrouillons((b) => {
        const n = { ...b };
        delete n[uuid];
        return n;
      });
      setEnregistre(uuid);
      setTimeout(() => setEnregistre((x) => (x === uuid ? null : x)), 1500);
    });

  const ecrire = () =>
    demarrer(async () => {
      setMessage(null);
      const r = await ecrireFichesProjet(projectId, { tous });
      if (!r.ok) setMessage({ texte: r.erreur, erreur: true });
      else
        setMessage({
          texte: `${r.lancees} fiche${r.lancees > 1 ? "s" : ""} lancée${r.lancees > 1 ? "s" : ""}, dans l'ordre du scénario.${r.erreurs.length ? ` Refus : ${r.erreurs.join(" ; ")}` : ""}`,
          erreur: false,
        });
      await relire();
      onLancees?.();
    });

  let sceneAffichee: string | null | undefined;
  return (
    <div className="cn-intents">
      <div className="cn-intents-tete">
        <b>Relis les intents avant d&rsquo;écrire les fiches</b>
        <span>
          Le scénario est écrit et relu. Chaque fiche met en images l&rsquo;intent de son plan : corrige ici ce qui est faux, pendant que les images de référence se fabriquent.
          Pour chaque plan, Open H3 IR choisit les références, crée les assets qui manquent, attend leurs images, puis compile la fiche (créativité et style de mise en scène compris).
        </span>
      </div>
      <ul className="cn-intents-liste" aria-label="Intents des plans">
        {plans.map((p) => {
          const entete = p.scene !== sceneAffichee;
          sceneAffichee = p.scene;
          const valeur = brouillons[p.uuid] ?? p.description;
          const change = valeur !== p.description;
          const s = suiviDe.get(p.uuid);
          const tourne = s?.statut === "en_cours";
          return (
            <li key={p.uuid}>
              {entete && p.scene ? <div className="cn-intents-scene">{p.scene}</div> : null}
              <div className={`cn-intent${s ? ` f-${s.statut}` : ""}`}>
                <div className="cn-intent-hd">
                  <span className="num">{pad(p.position)}</span>
                  <b>{p.titre}</b>
                  {s ? (
                    <span className="cn-intent-suivi" role={s.statut === "echoue" ? "alert" : "status"}>
                      {tourne ? <i className="cn-intent-pouls" aria-hidden="true" /> : null}
                      {s.libelle}
                    </span>
                  ) : null}
                  <Link href={p.atelierHref} className="cn-lien">
                    Ouvrir l&rsquo;atelier
                  </Link>
                </div>
                {p.aUneFiche || tourne ? (
                  <>
                    <p>{p.description || "(pas d'intent)"}</p>
                    <div className="cn-intent-pied">
                      {tourne
                        ? "Fiche en cours d'écriture : l'intent est figé jusqu'à la fin."
                        : "Fiche déjà écrite : l'intent se corrige dans l'atelier (« Itérer » réécrit la fiche avec)."}
                    </div>
                  </>
                ) : (
                  <>
                    <ChampIntent
                      etiquette={`Intent du plan ${pad(p.position)} · ${p.titre}`}
                      valeur={valeur}
                      onChange={(v) => setBrouillons((b) => ({ ...b, [p.uuid]: v }))}
                    />
                    <div className="cn-intent-pied">
                      {change ? (
                        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => enregistrer(p.uuid)}>
                          Enregistrer
                        </button>
                      ) : enregistre === p.uuid ? (
                        <span role="status">Enregistré</span>
                      ) : null}
                      {erreurs[p.uuid] ? (
                        <span className="cn-erreur" role="alert">
                          {erreurs[p.uuid]}
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {enCours > 0 ? (
        <p className="cn-note" role="status">
          {enCours} fiche{enCours > 1 ? "s" : ""} en cours d&rsquo;écriture. Tu peux quitter cette page : les demandes continuent sur le serveur (panneau des tâches).
        </p>
      ) : null}
      <div className="cn-clap-actions">
        <button
          type="button"
          className="btn btn-gold"
          disabled={pending || modifies.length > 0 || aLancer === 0}
          title={modifies.length > 0 ? "Enregistre d'abord les intents modifiés" : aLancer === 0 ? "Aucun plan à écrire" : undefined}
          onClick={ecrire}
        >
          {aLancer > 0 ? `Écrire les fiches (${aLancer} plan${aLancer > 1 ? "s" : ""})` : "Écrire les fiches"}
        </button>
        <button type="button" className="btn" disabled={pending} onClick={onPlusTard}>
          Plus tard
        </button>
        {avecFiche > 0 ? (
          <label className="cn-intent-tous">
            <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
            Réécrire aussi les {avecFiche} plan{avecFiche > 1 ? "s" : ""} qui {avecFiche > 1 ? "ont" : "a"} déjà une fiche
          </label>
        ) : null}
        {modifies.length > 0 ? <span className="cn-note">{modifies.length} intent{modifies.length > 1 ? "s" : ""} modifié{modifies.length > 1 ? "s" : ""}, pas encore enregistré{modifies.length > 1 ? "s" : ""}.</span> : null}
      </div>
      {message ? (
        <p className={message.erreur ? "cn-erreur" : "cn-note"} role={message.erreur ? "alert" : "status"}>
          {message.texte}
        </p>
      ) : null}
    </div>
  );
}
