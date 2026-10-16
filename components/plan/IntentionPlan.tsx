"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { genererIteration, ouvrirConversation, rejeter } from "@/app/agents/actions";
import { lirePropositionVue } from "@/app/agents/lecture";
import { annulerLaDemande, demanderIteration, lireDemande } from "@/app/demandes/actions";
import { preparerBaseIteration, rouvrirIteration, validerPretUpscale } from "@/app/plans/actions";
import { useBrouillon } from "@/components/plan/BrouillonPlan";
import { ajouterSuggestion, decisionIteration, passagesDeChangement, SUGGESTIONS_CONSIGNE, type DecisionIteration, type EtatPlan } from "@/lib/fiche-plan";
import type { VueProposition } from "@/lib/agents/types";

const EXEMPLES = [
  "Plus de mouvement, la caméra suit le personnage.",
  "Plan plus serré sur son visage.",
  "Lumière de fin de journée, plus chaude.",
  "Ralentis : on veut sentir qu'il savoure.",
];
const ATTENTE_MAX_MS = 15 * 60_000;
const INTERVALLE_MS = 2000;
/** Ce qu'on demande à l'agent quand « Analyser » est lancé sans consigne : l'analyse libre. */
const CONSIGNE_ANALYSE_LIBRE = "Analyse libre : regarde le rendu, dis ce qui ne correspond pas à l'intention du plan et propose la plus petite correction du prompt.";

type Phase = "repos" | "preparation" | "agent" | "lancement";
/** L'analyse manuelle (« Analyser ») : le diagnostic et la proposition, affichés ; rien n'est appliqué ni généré tant que l'utilisateur ne clique pas. */
type Revue = { propositionUuid: string; decision: Extract<DecisionIteration, { action: "appliquer" | "rien" }>; proposition: VueProposition };

/** Ce que l'agent regarde : la planche de vignettes du rendu (case « Montrer au chef opérateur », ou « Analyser »), ou seulement la consigne
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
 * « Analyser » (manuel, planche forcée) n'applique ni ne génère rien : il AFFICHE le diagnostic et la proposition (revue compacte) ; c'est
 * l'utilisateur qui déclenche ensuite « Appliquer et générer ». Sans rendu, il n'y a rien à analyser ni à corriger (jamais à l'aveugle) :
 * « Itérer » devient « Générer la prévisualisation » et lance la fiche telle quelle.
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
  const [revue, setRevue] = useState<Revue | null>(null);
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

  /** Applique la correction et crée l'essai (une transaction côté serveur) ; garde la consigne, la base et les notes sur l'essai. */
  const appliquerEtLancer = async (propositionUuid: string, consigneEssai: string): Promise<boolean> => {
    setPhase("lancement");
    const r = await b.lancerIteration(propositionUuid, { consigne: consigneEssai, depuisNumero: base?.numero ?? null });
    if (!r.ok) {
      setErreur(r.erreur);
      setPhase("repos");
      return false;
    }
    setConsigne("");
    setMontrer(false);
    setRevue(null);
    setInfo(r.notes.length ? `Essai n°${r.numeroRendu} lancé. À savoir, gardé sur l'essai : ${r.notes.join(" ")}` : null);
    setPhase("repos");
    router.push(hrefApresLancement, { scroll: false });
    return true;
  };

  /** Attend la fin de la tâche de l'agent (sondage de la proposition) ; null si on a quitté, annulé ou dépassé le délai. */
  const attendre = async (propositionUuid: string): Promise<VueProposition | null> => {
    const debut = Date.now();
    while (!demonte.current && !annule.current && Date.now() - debut < ATTENTE_MAX_MS) {
      const p = await lirePropositionVue(propositionUuid);
      if (!p) return null;
      if (p.statut !== "en_generation") return p;
      await new Promise((r) => setTimeout(r, INTERVALLE_MS));
    }
    return null;
  };

  /** Prépare l'essai de base, écrit les retouches du prompt et ouvre la conversation du plan. Renvoie null (erreur déjà affichée) si on s'arrête. */
  const preparerConversation = async (avecPlanche: boolean): Promise<string | null> => {
    if (!base) return null;
    if (!base.estDernier && retouches) {
      setErreur("Tes retouches du prompt ne sont pas figées : lance-les d'abord (Réglages) ou annule-les, puis repars de cet essai.");
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

  /** Lance l'agent d'itération et attend sa proposition (« Analyser » : rien n'est appliqué sans geste). */
  const interroger = async (retour: string, avecPlanche: boolean): Promise<{ propositionUuid: string; proposition: VueProposition; conversationUuid: string } | null> => {
    if (!base) return null;
    const conversationUuid = await preparerConversation(avecPlanche);
    if (!conversationUuid) return null;
    const g = await genererIteration(conversationUuid, { retour, renduId: base.id, planche: avecPlanche });
    if (!g.ok) {
      setErreur(g.erreur);
      setPhase("repos");
      return null;
    }
    setPhase("agent");
    const prop = await attendre(g.propositionUuid);
    if (demonte.current) return null;
    if (!prop) {
      setErreur(annule.current ? null : "L'agent n'a pas répondu à temps. Sa proposition reste dans le panneau des tâches.");
      setPhase("repos");
      return null;
    }
    return { propositionUuid: g.propositionUuid, proposition: prop, conversationUuid };
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
        setRevue(null);
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
    setRevue(null);
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

  /** « Analyser » : l'agent regarde le rendu (planche forcée), on AFFICHE son diagnostic et sa proposition ; rien n'est appliqué ni généré. */
  const analyser = async () => {
    if (occupe || enCours || !aUnRendu) return;
    setErreur(null);
    setInfo(null);
    setRevue(null);
    annule.current = false;
    try {
      const r = await interroger(texte || CONSIGNE_ANALYSE_LIBRE, true);
      if (!r) return;
      const decision = decisionIteration(r.proposition);
      if (decision.action === "echec") {
        setErreur(decision.erreur);
      } else if (decision.action === "rien" || decision.action === "appliquer") {
        setRevue({ propositionUuid: r.propositionUuid, decision, proposition: r.proposition });
      } else if (decision.action === "reecrire") {
        setInfo(`L'agent propose de réécrire le plan (la consigne change ce qui s'y passe) : ${decision.description} Lance « Itérer » pour le réécrire.`);
      }
      setPhase("repos");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Quelque chose a échoué.");
      setPhase("repos");
    }
  };

  const appliquerEtGenerer = async () => {
    if (!revue || revue.decision.action !== "appliquer" || occupe) return;
    setErreur(null);
    try {
      const d = revue.proposition.diagnostic;
      await appliquerEtLancer(revue.propositionUuid, texte || (d ? `Analyse : ${d.symptome}` : "Analyse de l'agent."));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Quelque chose a échoué.");
      setPhase("repos");
    }
  };

  const abandonner = () => {
    if (!revue) return;
    const uuid = revue.propositionUuid;
    setRevue(null);
    startTransition(async () => {
      await rejeter(uuid);
    });
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
      ? "Écris d'abord ce que tu veux changer (ou lance « Analyser » pour une analyse libre)."
      : "Ctrl + Entrée";

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
      {aUnRendu ? (
        <div className="tm-puces">
          {SUGGESTIONS_CONSIGNE.map((s) => (
            <button
              key={s}
              type="button"
              className="tm-puce"
              disabled={phase === "agent"}
              onClick={() => {
                setConsigne((c) => ajouterSuggestion(c, s));
                champ.current?.focus();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {base ? (
        <p className="tm-base">
          Base : <b>essai n°{base.numero}</b>. Ta consigne s&rsquo;applique à son prompt, pas forcément à celui du dernier essai
          {!base.estDernier ? " : le plan reprendra le prompt, la seed et la durée de cet essai." : "."}
        </p>
      ) : null}

      {aUnRendu && !montrer && /(?<![a-zàâçéèêëîïôûùüÿ])(dos|face|côté|cote|gauche|droite|derrière|derriere|devant|position|tourné|tourne|visage|regarde)(?![a-zàâçéèêëîïôûùüÿ])/i.test(texte) ? (
        <p className="tiny-note" role="note">
          Pour une question de position ou de côté, coche « Montrer au chef opérateur » : l&rsquo;agent voit alors le rendu au lieu de deviner.
        </p>
      ) : null}
      {aUnRendu ? (
        <label className="tm-montrer">
          <input type="checkbox" checked={montrer} disabled={occupe} onChange={(e) => setMontrer(e.target.checked)} />
          <span>
            Montrer au chef opérateur <small>L&rsquo;agent regarde le rendu (une vignette par seconde) : plus lent, plus précis. Sinon il travaille depuis ta consigne et la fiche.</small>
          </span>
        </label>
      ) : null}

      <div className="tm-actions">
        <button type="button" className="btn tm-btn-itere" disabled={occupe || enCours || consigneAbsente} onClick={() => void iterer()} title={titreIterer}>
          {libelleIterer}
        </button>
        <button
          type="button"
          className="btn tm-btn-ligne"
          disabled={occupe || enCours || !aUnRendu}
          onClick={() => void analyser()}
          title={!aUnRendu ? "Il n'y a pas encore de rendu à analyser : génère d'abord une prévisualisation." : "L'agent regarde le rendu et propose une correction, sans rien appliquer ni générer."}
        >
          Analyser
        </button>
        <button type="button" className="btn tm-btn-ligne" disabled={occupe || enCours || (etat !== "pret" && !base)} onClick={validerOuRouvrir}>
          {libellePret}
        </button>
        <span className="tm-actions-aide num">{retouches ? "retouches du prompt prises en compte" : "Ctrl + Entrée"}</span>
      </div>
      {!aUnRendu ? <p className="tiny-note">Analyser est désactivé : il n&rsquo;y a pas encore de rendu à regarder.</p> : null}

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

      {revue ? <RevueCompacte revue={revue} occupe={occupe} onAppliquer={() => void appliquerEtGenerer()} onAbandonner={abandonner} /> : null}
    </section>
  );
}

/** La revue compacte de l'ANALYSE manuelle : le diagnostic, les passages avant → après, ce que l'agent ou les contrôles signalent. Rien n'est
 * écrit ni généré tant que l'utilisateur ne clique pas « Appliquer et générer ». */
function RevueCompacte({ revue, occupe, onAppliquer, onAbandonner }: { revue: Revue; occupe: boolean; onAppliquer: () => void; onAbandonner: () => void }) {
  const d = revue.proposition.diagnostic;
  const passages = revue.proposition.groupes.flatMap((g) => g.changements).flatMap((c) => passagesDeChangement(c.apres));
  const decision = revue.decision;
  return (
    <div className="tm-revue" role="region" aria-label="Analyse de l'agent">
      <p className="tm-revue-titre">{decision.action === "rien" ? "L'agent ne propose aucun changement du prompt" : "Analyse de l'agent : rien n'est appliqué tant que tu ne l'as pas décidé"}</p>
      {d ? (
        <p className="tm-revue-diag">
          <b>{d.symptome}</b> {d.cause}
        </p>
      ) : revue.proposition.resume ? (
        <p className="tm-revue-diag">{revue.proposition.resume}</p>
      ) : null}
      {decision.action === "rien" ? (
        <p className="tiny-note">{decision.message} Reformule ta consigne, ou change la seed (onglet Réglages) pour une autre variante.</p>
      ) : decision.notes.length > 0 ? (
        <p className="tiny-note">À savoir : {decision.notes.join(" ")}</p>
      ) : null}
      {passages.length > 0 ? (
        <ul className="tm-revue-passages">
          {passages.map((p, i) => (
            <li key={`${p.section}-${i}`}>
              <span className="tm-revue-section">{p.section}</span>
              <del>{p.avant || "(rien)"}</del>
              <ins>{p.apres || "(supprimé)"}</ins>
            </li>
          ))}
        </ul>
      ) : null}
      {d?.verification ? <p className="tiny-note">À regarder ensuite : {d.verification}</p> : null}
      <div className="tm-revue-actions">
        {decision.action === "appliquer" ? (
          <button type="button" className="btn tm-btn-itere" disabled={occupe} onClick={onAppliquer}>
            Appliquer et générer
          </button>
        ) : null}
        <button type="button" className="btn" disabled={occupe} onClick={onAbandonner}>
          {decision.action === "rien" ? "Fermer" : "Abandonner"}
        </button>
      </div>
    </div>
  );
}
