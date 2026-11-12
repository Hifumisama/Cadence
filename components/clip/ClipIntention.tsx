"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ouvrirConversation } from "@/app/agents/actions";
import { annulerLaDemande, corrigerConsigneIteration, demanderIteration, lireDemande } from "@/app/demandes/actions";
import { preparerBaseIteration, rouvrirIteration, validerPretUpscale, type ConflitDescription } from "@/app/plans/actions";
import { intentAffichee } from "@/lib/clips/intent";
import { CONSIGNE_TEXTE_MODIFIE, EVENEMENT_ITERER_TEXTE } from "@/lib/clips/iteration-text";
import { useBrouillon } from "@/components/clip/ClipDraft";
import { DecisionsIteration } from "@/components/clip/DecisionsIteration";
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

/** What the agent looks at: the render's contact sheet (« Montrer le rendu à l'agent » checkbox), or only the directive
 * and the current sheet (default: the contact sheet is never automatic). */
type Vision = "planche" | "fiche";

const message = (phase: Exclude<Phase, "repos">, vision: Vision, etape: string | null): string =>
  phase === "preparation"
    ? "Je prépare l'essai de départ…"
    : phase === "agent"
      ? etape && /^(Création d'assets|Prompts d'assets|Images)/.test(etape)
        ? `En attente d'images : ${etape}. Les assets décidés par l'agent sont générés, puis la fiche est recompilée ; tu peux quitter la page, la demande continue dans le panneau des tâches.`
        : `${vision === "planche" ? "L'agent regarde le rendu et décide quoi changer" : "L'agent lit ta consigne et décide quoi changer"}, puis la fiche est recompilée. Compte une à quelques minutes ; tu peux quitter la page, la demande continue dans le panneau des tâches.`
      : "Mise en file de la prévisualisation…";

/** The « Qu'est-ce qu'on change ? » block: the directive in natural language is the iteration loop.
 *
 * « Itérer » is ONE indivisible transaction, with no confirmation at all (docs/FRICTIONS.md, 2026-10-12): (1) the `iteration-plan` agent analyses the
 * directive and DECIDES (intent, duration, references, settings: `DecisionsIteration`, shown here), then the sheet is recompiled by Open H3 IR with these
 * decisions (2026-11-09), (2) the application of the compiled sheet, which writes the decisions with it, (3) a preview with the
 * resulting prompt, which keeps the directive, the base attempt and what the agent or the checks reported (`decisionIteration`: notes, never
 * a stop). Steps 2 and 3 are written in a single server-side transaction (`appliquerIterationEtGenerer`). The replaced prompt stays in the
 * previous attempt (« Repartir de là »). The only stops: the agent fails, or nothing can be applied (message, no attempt created). The
 * directive is required. The contact sheet is NEVER automatic: only if the « Montrer au chef opérateur » box is ticked
 * (unticked by default, not remembered).
 *
 * Without a render, there is nothing to correct (never blind): « Itérer » becomes « Générer la prévisualisation » and launches the sheet as it is.
 *
 * « Prêt à upscaler · plan suivant » validates the displayed attempt, then moves to the next clip in order; on a clip already ready: « Rouvrir
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
  /** The iteration of this clip waiting its turn in the queue: its directive can be corrected here until it starts. */
  enAttente: { demandeId: number; consigne: string } | null;
  /** The iteration of this clip in progress (agent, recompilation, render): its directive stays displayed until the end, even after leaving the page. */
  iterationEnCours: { consigne: string; etape: string | null } | null;
  projectId: number;
  planId: number;
  planUuid: string;
  /** The displayed attempt (A) when it can be watched: it is the base of the directive. */
  base: { id: number; numero: number; estDernier: boolean } | null;
  etat: EtatPlan;
  /** An attempt of this clip is queued or in progress. */
  enCours: boolean;
  nbEssais: number;
  /** The clip that follows in order (null for the last one). */
  hrefSuivant: string | null;
  /** The clip without ?rendu: after a launch we return to the most recent attempt. */
  hrefApresLancement: string;
}) {
  const router = useRouter();
  const b = useBrouillon();
  const [consigne, setConsigne] = useState(enAttente?.consigne ?? "");
  const [montrer, setMontrer] = useState(false);
  const [phase, setPhase] = useState<Phase>("repos");
  const [vision, setVision] = useState<Vision>("fiche");
  /** The request's current step (« Images (1/2) »): shown when the iteration is waiting for images. */
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** The agent's decisions (before → after), as soon as it has answered: kept until the next directive. */
  const [decisions, setDecisions] = useState<DecisionsAffichees | null>(null);
  /** Starting again from the attempt would replace a clip text modified since: the two versions, pending the user's agreement. */
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

  /** « Itérer à partir de cet essai » (clip stale for its text only, PlateauEssais): the directive is always the same; the agent and the retouch see the difference. */
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

  /** First generation of a clip without a render: the sheet as it is (no agent). */
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

  /** Prepares the base attempt, writes the prompt retouches and opens the clip's conversation. Returns null (error already displayed) if we stop. */
  const preparerConversation = async (avecPlanche: boolean): Promise<string | null> => {
    if (!base) return null;
    if (!base.estDernier && retouches) {
      setErreur("Tes réglages retouchés (durée, FPS, seed) ne sont pas lancés : lance-les d'abord (Réglages) ou annule-les, puis repars de cet essai.");
      return null;
    }
    setVision(avecPlanche ? "planche" : "fiche");
    setPhase("preparation");
    // The base attempt is not the latest one: the clip takes back ITS prompt, seed and duration.
    if (!base.estDernier) {
      const p = await preparerBaseIteration(planId, base.id);
      if (!p.ok) {
        // The clip's text was edited by hand since this attempt: we do not overwrite it without saying so (both versions are shown below).
        if (p.conflit) setConflit({ ...p.conflit, pour: "iterer" });
        else setErreur(p.erreur);
        setPhase("repos");
        return null;
      }
    }
    // Hand-made prompt retouches: we write them, the agent must see them.
    if (retouches) await b.avecSectionsEcrites(async () => undefined);

    const conv = await ouvrirConversation(projectId, "plan", { uuid: planUuid }, "courte");
    if (!conv.ok) {
      setErreur(conv.erreur);
      setPhase("repos");
      return null;
    }
    return conv.conversationUuid;
  };

  /** « Itérer » = ONE request (lib/tasks/requests.ts) that the worker carries from the directive to the render (agent, rewriting of the sheet if the directive
   * changes the clip, application, attempt). The page only follows it: we display the current step, and when the render starts, the same acknowledgement as
   * a launch. Leaving the page cuts nothing (the line in the tasks panel stays). */
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

    // Without a render: the first preview of the sheet as it is.
    if (!aUnRendu) {
      await lancerEssai();
      return;
    }
    // The directive is required: free analysis goes through « Analyser ».
    if (!texte) {
      champ.current?.focus();
      return;
    }
    try {
      // The same preparations as an analysis (base attempt, retouches written, clip conversation), then ONE request.
      const c = await preparerConversation(montrer);
      if (!c) return;
      setPhase("agent");
      const g = await demanderIteration(c, { retour: texte, renduId: base?.id ?? null, planche: montrer, depuisNumero: base?.numero ?? null, reglages: b.reglagesRetouches() });
      if (!g.ok) {
        setErreur(g.erreur);
        setPhase("repos");
        return;
      }
      // Another iteration holds the place: this one waits its turn in the queue (tasks panel), its directive stays editable there until
      // it starts. Nothing to follow here: we can move on to the next clip.
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

  /** Corrects the directive of the queued iteration. If it has just started in the meantime, the page reloads: it has gone to the agent. */
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

  /** The user has seen both versions: the clip takes the attempt's text (its own is replaced), then they relaunch « Itérer ». */
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
      // Validating an attempt sets the clip's text to the attempt's: the screenplay says what we keep for the film. A text hand-edited since asks for agreement first.
      const r = await validerPretUpscale(planId, base!.id);
      if (!r.ok) {
        if (r.conflit) setConflit({ ...r.conflit, pour: "valider" });
        else setErreur(r.erreur);
        return;
      }
      if (hrefSuivant) router.push(hrefSuivant, { scroll: false });
    });
  };

  /** The clip's text is edited by hand: the user chooses whether to take the retained attempt's text or keep their own, and the validation completes. */
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

  // A validated clip no longer iterates: the directive and « Itérer » make no sense. « Rouvrir l'itération » brings them back.
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
