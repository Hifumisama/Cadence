"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ouvrirConversation } from "@/app/agents/actions";
import { annulerLaDemande, demanderIteration, lireDemande } from "@/app/demandes/actions";
import { preparerBaseIteration, rouvrirIteration, validerPretUpscale } from "@/app/plans/actions";
import { useBrouillon } from "@/components/plan/BrouillonPlan";
import type { EtatPlan } from "@/lib/fiche-plan";

const EXEMPLES = [
  "Plus de mouvement, la caméra suit le personnage.",
  "Plan plus serré sur son visage.",
  "Lumière de fin de journée, plus chaude.",
  "Ralentis : on veut sentir qu'il savoure.",
];
const INTERVALLE_MS = 2000;

type Phase = "repos" | "preparation" | "agent" | "lancement";

/** Ce que l'agent regarde : la planche de vignettes du rendu (case « Montrer le rendu à l'agent »), ou seulement la consigne
 * et la fiche actuelle (par défaut : la planche n'est jamais automatique). */
type Vision = "planche" | "fiche";

const message = (phase: Exclude<Phase, "repos">, vision: Vision): string =>
  phase === "preparation"
    ? "Je prépare l'essai de départ…"
    : phase === "agent"
      ? `${vision === "planche" ? "L'agent regarde le rendu et réécrit la fiche" : "L'agent réécrit la fiche depuis ta consigne"}. Compte une à quelques minutes ; tu peux quitter la page, la proposition t'attendra dans le panneau des tâches.`
      : "Mise en file de la prévisualisation…";

/** Le bloc « Qu'est-ce qu'on change ? » : la consigne en langage naturel est la boucle d'itération.
 *
 * « Itérer » est UNE transaction indissociable, sans aucune confirmation (docs/FRICTIONS.md, 2026-10-12) : (1) la réécriture de la fiche par
 * l'agent `iteration-plan` depuis la consigne et la fiche actuelle, (2) l'application de sa proposition, (3) une prévisualisation avec le
 * prompt obtenu, qui garde la consigne, l'essai de base et ce que l'agent ou les contrôles ont signalé (`decisionIteration` : des notes, jamais
 * un arrêt). Les étapes 2 et 3 s'écrivent en une seule transaction côté serveur (`appliquerIterationEtGenerer`). Le prompt remplacé reste dans
 * l'essai précédent (« Repartir de là »). Les seuls arrêts : l'agent échoue, ou rien n'est appliquable (message, aucun essai créé). La
 * consigne est requise. La planche de vignettes n'est JAMAIS automatique : seulement si la case « Montrer au chef opérateur » est cochée
 * (décochée par défaut, non mémorisée).
 *
 * Sans rendu, il n'y a rien à corriger (jamais à l'aveugle) : « Itérer » devient « Générer la prévisualisation » et lance la fiche telle quelle.
 *
 * « Prêt à upscaler · plan suivant » valide l'essai affiché, puis passe au plan suivant dans l'ordre ; sur un plan déjà prêt : « Rouvrir
 * l'itération ». */
export function IntentionPlan({
  projectId,
  planId,
  planUuid,
  base,
  etat,
  enCours,
  nbEssais,
  hrefSuivant,
  hrefApresLancement,
}: {
  projectId: number;
  planId: number;
  planUuid: string;
  /** L'essai affiché (A) quand on peut le regarder : c'est la base de la consigne. */
  base: { id: number; numero: number; estDernier: boolean } | null;
  etat: EtatPlan;
  /** Un essai de ce plan est en file ou en cours. */
  enCours: boolean;
  nbEssais: number;
  /** Le plan qui suit dans l'ordre (null pour le dernier). */
  hrefSuivant: string | null;
  /** Le plan sans ?rendu : après un lancement on revient au plus récent essai. */
  hrefApresLancement: string;
}) {
  const router = useRouter();
  const b = useBrouillon();
  const [consigne, setConsigne] = useState("");
  const [montrer, setMontrer] = useState(false);
  const [phase, setPhase] = useState<Phase>("repos");
  const [vision, setVision] = useState<Vision>("fiche");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const champ = useRef<HTMLTextAreaElement>(null);
  const demonte = useRef(false);
  const annule = useRef(false);

  useEffect(() => {
    demonte.current = false;
    return () => {
      demonte.current = true;
    };
  }, []);

  const occupe = phase !== "repos" || pending;
  const aUnRendu = base != null;
  const retouches = b.modifications.length > 0;
  const texte = consigne.trim();

  /** Première génération d'un plan sans rendu : la fiche telle qu'elle est (pas d'agent). */
  const lancerEssai = async (): Promise<boolean> => {
    setPhase("lancement");
    const r = await b.lancer("previsualiser", { consigne: null, depuisNumero: null });
    if (!r.ok) {
      setErreur(r.erreur);
      setPhase("repos");
      return false;
    }
    setConsigne("");
    setPhase("repos");
    router.push(hrefApresLancement, { scroll: false });
    return true;
  };

  /** Prépare l'essai de base, écrit les retouches du prompt et ouvre la conversation du plan. Renvoie null (erreur déjà affichée) si on s'arrête. */
  const preparerConversation = async (avecPlanche: boolean): Promise<string | null> => {
    if (!base) return null;
    if (!base.estDernier && retouches) {
      setErreur("Tes réglages retouchés (durée, FPS, seed) ne sont pas lancés : lance-les d'abord (Réglages) ou annule-les, puis repars de cet essai.");
      return null;
    }
    setVision(avecPlanche ? "planche" : "fiche");
    setPhase("preparation");
    // L'essai de base n'est pas le dernier : le plan reprend SON prompt, sa seed et sa durée.
    if (!base.estDernier) {
      const p = await preparerBaseIteration(planId, base.id);
      if (!p.ok) {
        setErreur(p.erreur);
        setPhase("repos");
        return null;
      }
    }
    // Des retouches du prompt à la main : on les écrit, l'agent doit les voir.
    if (retouches) await b.avecSectionsEcrites(async () => undefined);

    const conv = await ouvrirConversation(projectId, "plan", { uuid: planUuid }, "courte");
    if (!conv.ok) {
      setErreur(conv.erreur);
      setPhase("repos");
      return null;
    }
    return conv.conversationUuid;
  };

  /** « Itérer » = UNE demande (lib/demandes.ts) que le worker mène de la consigne au rendu (agent, réécriture de la fiche si la consigne change
   * le plan, application, essai). La page ne fait que la suivre : on affiche l'étape en cours, et quand le rendu part, le même accusé qu'un
   * lancement. Quitter la page ne coupe rien (la ligne du panneau des tâches reste). */
  const suivreDemande = async (demandeId: number): Promise<void> => {
    let dernier = "";
    while (!demonte.current && !annule.current) {
      const v = await lireDemande(demandeId);
      if (!v) break;
      if (v.etapeLibelle && v.etapeLibelle !== dernier) {
        dernier = v.etapeLibelle;
        if (v.etapes.find((e) => e.cle === "reecriture")?.statut === "en_cours") setVision("fiche");
        setPhase("agent");
      }
      if (v.numeroRendu != null) {
        b.accuserLancement(v.numeroRendu);
        setConsigne("");
        setMontrer(false);
            setInfo(v.notes.length ? `Essai n°${v.numeroRendu} lancé. À savoir, gardé sur l'essai : ${v.notes.join(" ")}` : null);
        setPhase("repos");
        router.push(hrefApresLancement, { scroll: false });
        return;
      }
      if (v.statut !== "en_cours") {
        if (v.statut === "echoue") setErreur(v.erreur ?? "L'itération a échoué.");
        setPhase("repos");
        return;
      }
      await new Promise((r) => setTimeout(r, INTERVALLE_MS));
    }
    if (annule.current && !demonte.current) {
      await annulerLaDemande(demandeId);
      setPhase("repos");
    }
  };

  const iterer = async () => {
    if (occupe || enCours) return;
    setErreur(null);
    setInfo(null);
    annule.current = false;

    // Sans rendu : la première prévisualisation de la fiche telle qu'elle est.
    if (!aUnRendu) {
      await lancerEssai();
      return;
    }
    // La consigne est requise : l'analyse libre passe par « Analyser ».
    if (!texte) {
      champ.current?.focus();
      return;
    }
    try {
      // Les mêmes préparatifs qu'une analyse (essai de base, retouches écrites, conversation du plan), puis UNE demande.
      const c = await preparerConversation(montrer);
      if (!c) return;
      setPhase("agent");
      const g = await demanderIteration(c, { retour: texte, renduId: base?.id ?? null, planche: montrer, depuisNumero: base?.numero ?? null, reglages: b.reglagesRetouches() });
      if (!g.ok) {
        setErreur(g.erreur);
        setPhase("repos");
        return;
      }
      await suivreDemande(g.demandeId);
      return;
      setPhase("repos");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Quelque chose a échoué.");
      setPhase("repos");
    }
  };

  const validerOuRouvrir = () => {
    if (!base && etat !== "pret") return;
    setErreur(null);
    startTransition(async () => {
      if (etat === "pret") {
        const r = await rouvrirIteration(planId);
        if (!r.ok) setErreur(r.erreur);
        return;
      }
      const r = await validerPretUpscale(planId, base!.id);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      if (hrefSuivant) router.push(hrefSuivant, { scroll: false });
    });
  };

  const placeholder = aUnRendu ? `Ex. ${EXEMPLES[nbEssais % EXEMPLES.length]}` : "Pas encore de rendu : le premier essai part de la fiche telle qu'elle est.";
  const libelleIterer = !aUnRendu ? "Générer la prévisualisation" : occupe ? "…" : "Itérer";
  const libellePret = etat === "pret" ? "Rouvrir l'itération" : hrefSuivant ? "Prêt à upscaler · plan suivant" : "Prêt à upscaler";
  const consigneAbsente = aUnRendu && !texte;
  const titreIterer = enCours
    ? "Un essai est déjà en file ou en cours sur ce plan."
    : consigneAbsente
      ? "Écris d'abord ce que tu veux changer."
      : undefined;

  return (
    <section className="tm-intention" aria-labelledby="tm-intention-titre">
      <label htmlFor="tm-consigne" id="tm-intention-titre" className="tm-intention-titre">
        Qu&rsquo;est-ce qu&rsquo;on change&nbsp;? <small>Dis-le comme tu le dirais à un chef opérateur.</small>
      </label>
      <textarea
        id="tm-consigne"
        ref={champ}
        className="tm-consigne"
        rows={3}
        value={consigne}
        placeholder={placeholder}
        disabled={!aUnRendu || phase === "agent"}
        onChange={(e) => setConsigne(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void iterer();
          }
        }}
      />
      {base && !base.estDernier ? (
        <p className="tm-base">
          Base : <b>essai n°{base.numero}</b>. Le plan reprendra son prompt, sa seed et sa durée.
        </p>
      ) : null}
      {aUnRendu ? (
        <label className="tm-montrer" title="L'agent regarde le rendu (une vignette par seconde) : plus lent, plus précis. Sinon il travaille depuis ta consigne et la fiche.">
          <input type="checkbox" checked={montrer} disabled={occupe} onChange={(e) => setMontrer(e.target.checked)} />
          <span>Montrer le rendu à l&rsquo;agent</span>
        </label>
      ) : null}

      <div className="tm-actions">
        <button type="button" className="btn tm-btn-itere" disabled={occupe || enCours || consigneAbsente} onClick={() => void iterer()} title={titreIterer}>
          {libelleIterer}
        </button>
        <button type="button" className="btn tm-btn-ligne" disabled={occupe || enCours || (etat !== "pret" && !base)} onClick={validerOuRouvrir}>
          {libellePret}
        </button>
      </div>

      {phase !== "repos" ? (
        <p className="tm-etat" role="status">
          <span className="tm-fil tm-fil-petit">
            <i />
          </span>
          {message(phase, vision)}
          {phase === "agent" ? (
            <button
              type="button"
              className="tm-lien"
              onClick={() => {
                annule.current = true;
              }}
            >
              Ne plus attendre
            </button>
          ) : null}
        </p>
      ) : null}
      {info ? (
        <p className="tiny-note" role="status">
          {info}
        </p>
      ) : null}
      {erreur ? (
        <p className="tm-erreur" role="alert">
          {erreur}
        </p>
      ) : null}
      {b.erreur ? (
        <p className="tm-erreur" role="alert">
          {b.erreur}
        </p>
      ) : null}

    </section>
  );
}
