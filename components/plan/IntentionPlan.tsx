"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ouvrirConversation } from "@/app/agents/actions";
import { annulerLaDemande, corrigerConsigneIteration, demanderIteration, lireDemande } from "@/app/demandes/actions";
import { preparerBaseIteration, rouvrirIteration, validerPretUpscale, type ConflitDescription } from "@/app/plans/actions";
import { intentAffichee } from "@/lib/clips/intent";
import { CONSIGNE_TEXTE_MODIFIE, EVENEMENT_ITERER_TEXTE } from "@/lib/clips/iteration-text";
import { useBrouillon } from "@/components/plan/BrouillonPlan";
import { DecisionsIteration } from "@/components/plan/DecisionsIteration";
import type { DecisionsAffichees } from "@/lib/agents/types";
import type { EtatPlan } from "@/lib/clips/clip-sheet";

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

const message = (phase: Exclude<Phase, "repos">, vision: Vision, etape: string | null): string =>
  phase === "preparation"
    ? "Je prépare l'essai de départ…"
    : phase === "agent"
      ? etape && /^(Création d'assets|Prompts d'assets|Images)/.test(etape)
        ? `En attente d'images : ${etape}. Les assets décidés par l'agent sont générés, puis la fiche est recompilée ; tu peux quitter la page, la demande continue dans le panneau des tâches.`
        : `${vision === "planche" ? "L'agent regarde le rendu et décide quoi changer" : "L'agent lit ta consigne et décide quoi changer"}, puis la fiche est recompilée. Compte une à quelques minutes ; tu peux quitter la page, la demande continue dans le panneau des tâches.`
      : "Mise en file de la prévisualisation…";

/** Le bloc « Qu'est-ce qu'on change ? » : la consigne en langage naturel est la boucle d'itération.
 *
 * « Itérer » est UNE transaction indissociable, sans aucune confirmation (docs/FRICTIONS.md, 2026-10-12) : (1) l'agent `iteration-plan` analyse la
 * consigne et DÉCIDE (intent, durée, références, réglages : `DecisionsIteration`, affichées ici), puis la fiche est recompilée par Open H3 IR avec ces
 * décisions (2026-11-09), (2) l'application de la fiche compilée, qui écrit les décisions avec elle, (3) une prévisualisation avec le
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
  enAttente,
  iterationEnCours,
}: {
  /** L'itération de ce plan qui attend son tour dans la file : sa consigne se corrige ici jusqu'à son départ. */
  enAttente: { demandeId: number; consigne: string } | null;
  /** L'itération de ce plan en cours de route (agent, recompilation, rendu) : sa consigne reste affichée jusqu'à la fin, même après avoir quitté la page. */
  iterationEnCours: { consigne: string; etape: string | null } | null;
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
  const [consigne, setConsigne] = useState(enAttente?.consigne ?? "");
  const [montrer, setMontrer] = useState(false);
  const [phase, setPhase] = useState<Phase>("repos");
  const [vision, setVision] = useState<Vision>("fiche");
  /** L'étape en cours de la demande (« Images (1/2) ») : dite quand l'itération attend des images. */
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** Les décisions de l'agent (avant → après), dès qu'il a répondu : gardées jusqu'à la prochaine consigne. */
  const [decisions, setDecisions] = useState<DecisionsAffichees | null>(null);
  /** Repartir de l'essai remplacerait un texte de plan modifié depuis : les deux versions, en attendant l'accord de l'utilisateur. */
  const [conflit, setConflit] = useState<(ConflitDescription & { pour: "iterer" | "valider" }) | null>(null);
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

  /** « Itérer à partir de cet essai » (plan périmé pour son seul texte, PlateauEssais) : la consigne est toujours la même, l'agent et la retouche voient la différence. */
  const itererRef = useRef<(c?: string) => Promise<void>>(async () => undefined);
  useEffect(() => {
    const surDemande = () => void itererRef.current(CONSIGNE_TEXTE_MODIFIE);
    window.addEventListener(EVENEMENT_ITERER_TEXTE, surDemande);
    return () => window.removeEventListener(EVENEMENT_ITERER_TEXTE, surDemande);
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
        // Le texte du plan a été modifié à la main depuis cet essai : on ne l'écrase pas sans le dire (les deux versions s'affichent plus bas).
        if (p.conflit) setConflit({ ...p.conflit, pour: "iterer" });
        else setErreur(p.erreur);
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

  /** « Itérer » = UNE demande (lib/tasks/requests.ts) que le worker mène de la consigne au rendu (agent, réécriture de la fiche si la consigne change
   * le plan, application, essai). La page ne fait que la suivre : on affiche l'étape en cours, et quand le rendu part, le même accusé qu'un
   * lancement. Quitter la page ne coupe rien (la ligne du panneau des tâches reste). */
  const suivreDemande = async (demandeId: number): Promise<void> => {
    let dernier = "";
    while (!demonte.current && !annule.current) {
      const v = await lireDemande(demandeId);
      if (!v) break;
      if (v.decisions) setDecisions(v.decisions);
      if (v.etapeLibelle && v.etapeLibelle !== dernier) {
        dernier = v.etapeLibelle;
        setEtape(v.etapeLibelle);
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

  const iterer = async (consigneAuto?: string) => {
    if (occupe || enCours) return;
    const texte = consigneAuto ?? consigne.trim();
    setErreur(null);
    setInfo(null);
    setDecisions(null);
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
      // Une autre itération tient la place : celle-ci attend son tour dans la file (panneau des tâches), sa consigne reste modifiable là-bas jusqu'à son
      // départ. Rien à suivre ici : on peut passer au plan suivant.
      if (g.enAttente) {
        setConsigne("");
        setMontrer(false);
        setInfo("Itération mise en file : elle partira dès que celle en cours sera terminée. Tu peux encore corriger sa consigne depuis le panneau des tâches, et passer au plan suivant.");
        setPhase("repos");
        return;
      }
      await suivreDemande(g.demandeId);
      return;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Quelque chose a échoué.");
      setPhase("repos");
    }
  };

  itererRef.current = iterer;

  /** Corrige la consigne de l'itération en file. Si elle vient de démarrer entre-temps, la page se recharge : elle est partie à l'agent. */
  const corrigerEnAttente = () => {
    if (!enAttente || !texte) return;
    setErreur(null);
    setInfo(null);
    startTransition(async () => {
      const r = await corrigerConsigneIteration(enAttente.demandeId, texte);
      if (r.ok) setInfo("Consigne enregistrée : elle partira telle quelle avec l'itération.");
      else {
        setErreur(r.erreur);
        router.refresh();
      }
    });
  };

  const retirerDeLaFile = () => {
    if (!enAttente) return;
    setErreur(null);
    startTransition(async () => {
      await annulerLaDemande(enAttente.demandeId);
      setConsigne("");
      router.refresh();
    });
  };

  /** L'utilisateur a vu les deux versions : le plan reprend le texte de l'essai (le sien est remplacé), puis il relance « Itérer ». */
  const remplacerLeTexte = () => {
    if (!base) return;
    setErreur(null);
    startTransition(async () => {
      const p = await preparerBaseIteration(planId, base.id, true);
      if (!p.ok) {
        setErreur(p.erreur);
        return;
      }
      setConflit(null);
      setInfo(`Le texte du plan est celui de l'essai n°${base.numero}. Relance « Itérer » pour appliquer ta consigne.`);
      router.refresh();
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
      // Valider un essai met le texte du plan à celui de l'essai : le scénario dit ce qu'on retient pour le film. Un texte retouché à la main depuis demande d'abord l'accord.
      const r = await validerPretUpscale(planId, base!.id);
      if (!r.ok) {
        if (r.conflit) setConflit({ ...r.conflit, pour: "valider" });
        else setErreur(r.erreur);
        return;
      }
      if (hrefSuivant) router.push(hrefSuivant, { scroll: false });
    });
  };

  /** Le texte du plan est modifié à la main : l'utilisateur choisit s'il prend celui de l'essai retenu ou garde le sien, et la validation se termine. */
  const validerAvecTexte = (reponse: "remplacer" | "garder") => {
    if (!base) return;
    setErreur(null);
    startTransition(async () => {
      const r = await validerPretUpscale(planId, base.id, reponse);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setConflit(null);
      if (hrefSuivant) router.push(hrefSuivant, { scroll: false });
      else router.refresh();
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

  // Un plan validé n'itère plus : la consigne et « Itérer » n'ont pas de sens. « Rouvrir l'itération » les ramène.
  if (etat === "pret") {
    return (
      <section className="tm-intention tm-pret" aria-label="Plan prêt à upscaler">
        <p className="tm-pret-texte">
          <b>Plan prêt à upscaler.</b> Il partira avec le prochain lot d&rsquo;upscale.
        </p>
        <div className="tm-actions">
          <button type="button" className="btn tm-btn-ligne" disabled={pending} onClick={validerOuRouvrir}>
            {libellePret}
          </button>
          {hrefSuivant ? (
            <button type="button" className="btn tm-btn-ligne" onClick={() => router.push(hrefSuivant, { scroll: false })}>
              Plan suivant →
            </button>
          ) : null}
        </div>
        {erreur ? (
          <p className="tm-erreur" role="alert">
            {erreur}
          </p>
        ) : null}
      </section>
    );
  }

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
        disabled={!aUnRendu || phase === "agent" || iterationEnCours != null}
        onChange={(e) => setConsigne(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void iterer();
          }
        }}
      />
      {iterationEnCours ? (
        <div className="tm-iteration-en-cours" role="status">
          <p className="tm-base">
            <b>Itération en cours</b>
            {iterationEnCours.etape ? ` · ${iterationEnCours.etape}` : ""}
          </p>
          <div className="tm-barre-essai-consigne">
            <q>{iterationEnCours.consigne}</q>
          </div>
        </div>
      ) : null}
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

      {enAttente ? (
        <>
          <p className="tm-base">
            <b>Cette itération attend son tour</b> dans la file : tu peux encore corriger sa consigne, elle partira telle qu&rsquo;elle est à ce moment-là.
          </p>
          <div className="tm-actions">
            <button type="button" className="btn tm-btn-itere" disabled={pending || !texte || texte === enAttente.consigne} onClick={corrigerEnAttente}>
              Enregistrer la consigne
            </button>
            <button type="button" className="btn tm-btn-ligne" disabled={pending} onClick={retirerDeLaFile}>
              Retirer de la file
            </button>
          </div>
        </>
      ) : (
      <div className="tm-actions">
        <button type="button" className="btn tm-btn-itere" disabled={occupe || enCours || consigneAbsente} onClick={() => void iterer()} title={titreIterer}>
          {libelleIterer}
        </button>
        <button type="button" className="btn tm-btn-ligne" disabled={occupe || enCours || !base} onClick={validerOuRouvrir}>
          {libellePret}
        </button>
      </div>
      )}

      {phase !== "repos" ? (
        <p className="tm-etat" role="status">
          <span className="tm-fil tm-fil-petit">
            <i />
          </span>
          {message(phase, vision, etape)}
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
      {conflit ? (
        <div className="tm-conflit" role="alertdialog" aria-labelledby="tm-conflit-titre">
          <p id="tm-conflit-titre">
            <b>Le texte du plan a changé depuis l&rsquo;essai n°{conflit.numeroRendu}.</b>{" "}
            {conflit.pour === "valider"
              ? "Le valider pour le film remplacerait le texte du plan par celui de l'essai, pour que le scénario soit celui que tu retiens."
              : "Repartir de cet essai le remplacerait par celui de l'essai."}
          </p>
          <div className="tm-conflit-versions">
            <section>
              <h4>Texte actuel</h4>
              <pre>{intentAffichee(conflit.actuelle) || "(vide)"}</pre>
            </section>
            <section>
              <h4>Texte de l&rsquo;essai n°{conflit.numeroRendu}</h4>
              <pre>{intentAffichee(conflit.essai) || "(vide)"}</pre>
            </section>
          </div>
          <div className="tm-actions">
            <button type="button" className="btn tm-btn-ligne" disabled={pending} onClick={conflit.pour === "valider" ? () => validerAvecTexte("remplacer") : remplacerLeTexte}>
              {conflit.pour === "valider" ? "Valider et remplacer le texte" : "Remplacer par le texte de l’essai"}
            </button>
            {conflit.pour === "valider" ? (
              <button type="button" className="btn tm-btn-ligne" disabled={pending} onClick={() => validerAvecTexte("garder")} title="Le plan est validé, son texte reste le tien ; le repère « texte modifié » reste affiché.">
                Valider en gardant mon texte
              </button>
            ) : null}
            <button type="button" className="btn tm-btn-ligne" disabled={pending} onClick={() => setConflit(null)}>
              {conflit.pour === "valider" ? "Annuler" : "Garder mon texte"}
            </button>
          </div>
        </div>
      ) : null}
      {decisions ? <DecisionsIteration d={decisions} /> : null}
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
