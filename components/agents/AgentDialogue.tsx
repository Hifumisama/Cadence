"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { nouvelleConversation, ouvrirConversation, reinitialiser } from "@/app/agents/actions";
import { annulerTache } from "@/app/taches/actions";
import { lireBriefVue, lireConversationVue, lirePropositionCouranteVue } from "@/app/agents/lecture";
import type { DemandeAgent } from "@/components/agents/AgentsProvider";
import type { ContexteEtape } from "@/components/agents/contexte";
import { ChoixAssets } from "@/components/agents/ChoixAssets";
import { ChoixIteration } from "@/components/agents/ChoixIteration";
import { ChoixPlans } from "@/components/agents/ChoixPlans";
import { ChoixVoix } from "@/components/agents/ChoixVoix";
import { EtatTacheAgent } from "@/components/agents/EtatTacheAgent";
import { EtapeApplique } from "@/components/agents/EtapeApplique";
import { EtapeBrief } from "@/components/agents/EtapeBrief";
import { EtapeConsigne } from "@/components/agents/EtapeConsigne";
import { EtapeConversation } from "@/components/agents/EtapeConversation";
import { EtapeProposition } from "@/components/agents/RevueProposition";
import { FilEtapes } from "@/components/agents/FilEtapes";
import { SelecteurPortee } from "@/components/agents/SelecteurPortee";
import { estLotActif, estTacheActive, etapeValide, filEtapes } from "@/lib/agents-affichage";
import { LIBELLE_SKILL } from "@/lib/taches";
import type { Etape, ResultatApplication, VueBrief, VueConversation, VueProposition } from "@/lib/agents/types";
import { Icone } from "@/components/ui/Icone";

const INTERVALLE_SONDAGE_MS = 3000;
const INTERVALLE_FLUX_MS = 1200;

/** La popup d'agent (variante hybride validée) : UNE fenêtre large, ouverte depuis un point
 * d'entrée contextuel qui lui donne la portée. Deux profondeurs : COURTE (Consigne →
 * Proposition → Appliqué) et COMPLÈTE (Conversation → Brief → Proposition → Appliqué).
 * Le serveur fait foi : la popup relit l'état toutes les 3 s tant qu'une tâche d'agent est
 * active, et la vue suit l'étape du serveur (on peut revenir en arrière, pas sauter en avant).
 * Fermer la fenêtre n'interrompt rien : la file continue, le panneau du header y ramène. */
export function AgentDialogue({ demande, onFermer }: { demande: DemandeAgent; onFermer: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [uuid, setUuid] = useState<string | null>(demande.conversationUuid ?? null);
  const [conv, setConv] = useState<VueConversation | null>(null);
  const [prop, setProp] = useState<VueProposition | null>(null);
  const [brief, setBrief] = useState<VueBrief | null>(null);
  const [chargement, setChargement] = useState(true);
  const [reprise, setReprise] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // La tâche qui a fait refuser la dernière action (« une tâche est déjà en cours ») : on propose de l'annuler.
  const [bloquante, setBloquante] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [affichee, setAffichee] = useState<Etape>("consigne");
  const [confirmation, setConfirmation] = useState<"reinit" | "nouvelle" | null>(null);
  const [dernierResultat, setDernierResultat] = useState<Extract<ResultatApplication, { ok: true }> | null>(null);
  // Ignore une réponse de lecture arrivée après une plus récente (sondage + action).
  const sequence = useRef(0);

  // La fenêtre s'ouvre à son montage (le fournisseur la monte à neuf à chaque ouverture).
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const lire = useCallback(async (conversationUuid: string): Promise<VueConversation | null> => {
    const n = ++sequence.current;
    const c = await lireConversationVue(conversationUuid);
    if (n !== sequence.current) return null;
    if (!c) {
      setConv(null);
      setErreur("Cette conversation n'existe plus (elle a peut-être été écrasée).");
      return null;
    }
    const [p, b] = await Promise.all([
      lirePropositionCouranteVue(conversationUuid),
      c.profondeur === "complete" ? lireBriefVue(c.projectId) : Promise.resolve(null),
    ]);
    if (n !== sequence.current) return null;
    setConv(c);
    setProp(p);
    setBrief(b);
    return c;
  }, []);

  const rafraichir = useCallback(async () => {
    if (!uuid) return;
    try {
      await lire(uuid);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible.");
    }
  }, [uuid, lire]);

  // Ouverture : on reprend la conversation de la cible (ou on rouvre celle d'une tâche).
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        let id = demande.conversationUuid ?? null;
        if (!id) {
          if (demande.projectId == null || !demande.portee) {
            setErreur("Demande d'ouverture incomplète.");
            return;
          }
          const r = await ouvrirConversation(demande.projectId, demande.portee, demande.cible ?? null, demande.profondeur);
          if (!r.ok) {
            setErreur(r.erreur);
            return;
          }
          id = r.conversationUuid;
          if (!annule) setReprise(r.reprise);
        }
        if (annule) return;
        setUuid(id);
        await lire(id);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Ouverture impossible.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
    // L'ouverture ne se rejoue pas : le fournisseur remonte la popup à chaque demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La vue suit l'étape du serveur (une tâche finie la fait avancer) ; revenir en arrière
  // reste possible tant que l'étape du serveur ne bouge pas.
  const etapeServeur = conv ? etapeValide(conv.profondeur, conv.etape) : null;
  // Entrée directe « créer le registre » (page des assets) : le sélecteur tient lieu de vue tant qu'aucune
  // proposition n'est en cours ; dès que le lot est posé (étape « proposition » du serveur), c'est la
  // revue habituelle qui prend le relais, comme pour toute proposition.
  // Seule une proposition DE CETTE ÉTAPE (registre, voix) prend la place du sélecteur : une proposition d'une
  // autre étape restée sur la conversation du projet (des scénarios, parfois échouée) ne doit pas s'afficher
  // à sa place, sinon « créer les voix » montre la revue des scénarios.
  const vueDirecteDe = (vue: "registre" | "voix") =>
    demande.vue === vue && !!conv && !((etapeServeur === "proposition" || etapeServeur === "applique") && (!prop || prop.skill === vue));
  const vueRegistre = vueDirecteDe("registre");
  // Même principe pour « créer les voix manquantes » (page du casting vocal).
  const vueVoix = vueDirecteDe("voix");
  // Lancer l'étape rejette la proposition qui attend encore sa revue : on le dit avant.
  const autreEnAttente = (vueRegistre || vueVoix) && prop && (prop.statut === "prete" || prop.statut === "en_generation") ? prop : null;
  // … et pour « écrire la fiche » (page d'un plan) ou « écrire les fiches » (épisode).
  // Même règle : seule une proposition de fiche (un plan : « plan-h3 », un lot : « fiches ») prend sa place.
  const vueFiches =
    demande.vue === "fiches" &&
    !!conv &&
    !((etapeServeur === "proposition" || etapeServeur === "applique") && (!prop || prop.skill === "plan-h3" || prop.skill === "fiches"));
  const autreQueFiche = vueFiches && prop && (prop.statut === "prete" || prop.statut === "en_generation") ? prop : null;
  // … et pour « corriger après visionnage » (page d'un plan qui a un rendu) : seule une proposition iteration-plan.
  const vueIteration =
    demande.vue === "iteration" && !!conv && !((etapeServeur === "proposition" || etapeServeur === "applique") && (!prop || prop.skill === "iteration-plan"));
  const autreQuIteration = vueIteration && prop && (prop.statut === "prete" || prop.statut === "en_generation") ? prop : null;
  const vueDirecte = vueRegistre || vueVoix || vueFiches || vueIteration;
  useEffect(() => {
    if (etapeServeur) setAffichee(etapeServeur);
  }, [etapeServeur, conv?.uuid]);

  // Sondage : seulement tant qu'une tâche de cette conversation est active.
  const actif = estTacheActive(conv?.tache) || estTacheActive(prop?.tache) || estLotActif(prop?.lot);
  // Plus vite pendant qu'un appel s'écrit (streaming : la réponse et la réflexion s'affichent au fil de l'eau).
  const enDirect = conv?.tache?.statut === "en_cours" || prop?.tache?.statut === "en_cours";
  useEffect(() => {
    if (!actif) return;
    const t = setInterval(() => void rafraichir(), enDirect ? INTERVALLE_FLUX_MS : INTERVALLE_SONDAGE_MS);
    return () => clearInterval(t);
  }, [actif, enDirect, rafraichir]);

  const lancer = useCallback<ContexteEtape["lancer"]>(
    async (action, apres) => {
      setOccupe(true);
      setErreur(null);
      setBloquante(null);
      try {
        const r = await action();
        if (!r.ok) {
          setErreur((r as { erreur?: string }).erreur ?? "L'action a échoué.");
          setBloquante((r as { bloquante?: { runUuid: string } }).bloquante?.runUuid ?? null);
        }
        else apres?.(r);
        await rafraichir();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
      } finally {
        setOccupe(false);
      }
    },
    [rafraichir],
  );

  const appliquerResultat = useCallback(
    (r: Extract<ResultatApplication, { ok: true }> | null) => {
      setDernierResultat(r);
      // Les pages serveur (épisode, plans, assets…) doivent montrer ce qui vient d'être écrit.
      if (r) router.refresh();
    },
    [router],
  );

  const confirmer = async () => {
    if (!conv) return;
    const quoi = confirmation;
    setConfirmation(null);
    if (quoi === "reinit") {
      await lancer(() => reinitialiser(conv.uuid), () => setDernierResultat(null));
    } else if (quoi === "nouvelle") {
      await lancer(
        () => nouvelleConversation(conv.projectId, conv.portee, demande.cible ?? (conv.cibleId != null ? { id: conv.cibleId } : null), conv.profondeur),
        (r) => {
          if ("conversationUuid" in r && typeof r.conversationUuid === "string") {
            setUuid(r.conversationUuid);
            setReprise(false);
            setDernierResultat(null);
            void lire(r.conversationUuid);
          }
        },
      );
    }
  };

  const ctx: ContexteEtape | null = conv
    ? {
        demande,
        conv,
        prop,
        brief,
        occupe,
        dernierResultat,
        lancer,
        rafraichir,
        aller: setAffichee,
        setErreur,
        setDernierResultat: appliquerResultat,
        demanderReinitialisation: () => setConfirmation("reinit"),
      }
    : null;

  const libelleCible = conv?.cibleLibelle ?? demande.libelle ?? "";
  const reprend = reprise && conv != null && (conv.messages.length > 0 || conv.consigne.trim() !== "" || conv.propositionUuid != null);

  return (
    <dialog
      ref={ref}
      className="gd ag"
      aria-labelledby="ag-titre"
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="gd-head">
        <h2 id="ag-titre">
          Demander à l&rsquo;agent <Icone nom="agent" taille={14} />
          {libelleCible ? <span className="ag-chip">{libelleCible}</span> : null}
        </h2>
        <div className="gd-head-r">
          {conv ? <span className="ag-profondeur tiny-note">{conv.profondeur === "complete" ? "Création complète" : "Itération courte"}</span> : null}
          {conv ? (
            <Link href={`/p/${conv.projectId}/brief`} className="ag-lien tiny-note" onClick={onFermer}>
              Brief du projet →
            </Link>
          ) : null}
          <button type="button" className="gd-x" onClick={onFermer} aria-label="Fermer">
            <Icone nom="fermer" />
          </button>
        </div>
      </div>

      {conv ? <SelecteurPortee conversationUuid={conv.uuid} projectId={conv.projectId} porteeActuelle={conv.portee} /> : null}

      {conv && !vueDirecte ? (
        <div className="ag-sous-tete">
          <FilEtapes etapes={filEtapes(conv.profondeur, etapeServeur ?? "consigne", affichee)} onAller={setAffichee} />
          {reprend ? (
            <span className="ag-reprise tiny-note" role="status">
              Conversation en cours reprise
            </span>
          ) : null}
        </div>
      ) : null}

      {confirmation && conv ? (
        <div className="ag-confirmation ag-confirmation-haut" role="alertdialog" aria-label="Confirmation">
          <strong>{confirmation === "reinit" ? "Réinitialiser ?" : "Démarrer une nouvelle conversation ?"}</strong>
          <p className="tiny-note">
            Seront perdus : {conv.messages.length} message{conv.messages.length > 1 ? "s" : ""}, la consigne, le brouillon de brief et la proposition en cours.{" "}
            {confirmation === "nouvelle" ? "La nouvelle conversation écrase la précédente sur cette cible. " : ""}
            Le brief validé du projet n&rsquo;est pas touché.
          </p>
          <div className="gd-row">
            <button type="button" className="btn btn-gold" onClick={() => void confirmer()} disabled={occupe}>
              {occupe ? "…" : confirmation === "reinit" ? "Réinitialiser" : "Écraser et recommencer"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmation(null)} disabled={occupe}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <div className="ag-corps">
        {chargement ? <p className="ag-vide">Ouverture de la conversation…</p> : null}
        {!chargement && !ctx ? (
          <p className="ag-erreur" role="alert">
            {erreur ?? "Impossible d'ouvrir l'agent."}
          </p>
        ) : null}
        {ctx && autreEnAttente ? (
          <p className="ag-eps-alerte tiny-note" role="status">
            Une proposition « {LIBELLE_SKILL[autreEnAttente.skill] ?? autreEnAttente.skill} » attend encore sa revue : la lancer ici la rejettera.
          </p>
        ) : null}
        {ctx && vueRegistre ? (
          <>
            <ChoixAssets ctx={ctx} />
            <div className="ag-etape-corps">
              <EtatTacheAgent tache={ctx.conv.tache} />
            </div>
          </>
        ) : null}
        {ctx && vueVoix ? (
          <>
            <ChoixVoix ctx={ctx} />
            <div className="ag-etape-corps">
              <EtatTacheAgent tache={ctx.conv.tache} />
            </div>
          </>
        ) : null}
        {ctx && autreQueFiche ? (
          <p className="ag-eps-alerte tiny-note" role="status">
            Une proposition « {LIBELLE_SKILL[autreQueFiche.skill] ?? autreQueFiche.skill} » attend encore sa revue sur cette conversation : écrire la fiche la rejettera.
          </p>
        ) : null}
        {ctx && vueFiches ? (
          <>
            <ChoixPlans ctx={ctx} />
            <div className="ag-etape-corps">
              <EtatTacheAgent tache={ctx.conv.tache} />
            </div>
          </>
        ) : null}
        {ctx && autreQuIteration ? (
          <p className="ag-eps-alerte tiny-note" role="status">
            Une proposition « {LIBELLE_SKILL[autreQuIteration.skill] ?? autreQuIteration.skill} » attend encore sa revue sur ce plan : lancer la correction la rejettera.
          </p>
        ) : null}
        {ctx && vueIteration ? (
          <>
            <ChoixIteration ctx={ctx} />
            <div className="ag-etape-corps">
              <EtatTacheAgent tache={ctx.conv.tache} />
            </div>
          </>
        ) : null}
        {ctx && !vueDirecte ? (
          <>
            {affichee === "consigne" ? <EtapeConsigne ctx={ctx} /> : null}
            {affichee === "conversation" ? <EtapeConversation ctx={ctx} /> : null}
            {affichee === "brief" ? <EtapeBrief ctx={ctx} /> : null}
            {affichee === "proposition" ? <EtapeProposition ctx={ctx} /> : null}
            {affichee === "applique" ? <EtapeApplique ctx={ctx} onFermer={onFermer} /> : null}
          </>
        ) : null}
      </div>

      <div className="gd-foot">
        <span className={`gd-raison${erreur ? " bloque" : ""}`} role={erreur ? "alert" : "status"}>
          {erreur ?? (actif ? "Tu peux fermer cette fenêtre : l'agent continue et le panneau des générations te prévient." : "")}
          {erreur && bloquante ? (
            <>
              {" "}
              <button
                type="button"
                className="btn btn-ghost btn-mini"
                disabled={occupe}
                onClick={() => {
                  setOccupe(true);
                  void annulerTache(`llm:${bloquante}`)
                    .then(() => {
                      setErreur(null);
                      setBloquante(null);
                      return rafraichir();
                    })
                    .finally(() => setOccupe(false));
                }}
              >
                Annuler cette tâche
              </button>
            </>
          ) : null}
        </span>
        <div className="gd-row">
          {conv && affichee !== "applique" ? (
            <>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setConfirmation("reinit")} disabled={occupe}>
                Réinitialiser…
              </button>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setConfirmation("nouvelle")} disabled={occupe}>
                Nouvelle conversation…
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </div>
    </dialog>
  );
}
