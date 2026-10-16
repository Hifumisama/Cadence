"use client";

import "./assets.css";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { supprimerAssets, validerAssets } from "@/app/assets/actions";
import { lancerGenerationsLot } from "@/app/assets/generation-actions";
import { useRouter } from "next/navigation";
import { BoutonGenererImages, useEtatImages } from "@/components/images/ImagesProjet";
import { Icone } from "@/components/ui/Icone";
import type { EtatImages } from "@/lib/images-projet";
import { filtresUtiles, plageDeCodes } from "@/lib/registre-filtres";
import { LIBELLE_STATUT, LIBELLE_TYPE_ASSET, type LigneRegistre } from "@/lib/registre-types";
import { AssetCard, LigneAsset } from "./AssetCard";

/** Durée d'appui qui déclenche la sélection (clic long). */
const DUREE_APPUI = 450;
const CLE_VUE = "cadence:registre-vue";
const ORDRE_TYPES = ["personnage", "decor", "prop", "vfx", "sfx", "keyframe", "oth"];

/** Pourquoi un asset ne partira pas dans un lot, ou null. Un asset qui a déjà une image n'est jamais renvoyé dans un lot :
 * le résultat d'un lot s'adopte tout seul et remplacerait l'image — on la régénère depuis sa fiche. */
const raisonEcarte = (l: LigneRegistre): string | null =>
  l.raisonLot ?? (l.etat === "ok" ? "a déjà une image : régénère-la depuis sa fiche" : null);

type Retour = { ok: boolean; texte: string };

/** Le registre : recherche, filtres, grille ou liste. Un clic ouvre la fiche ; un clic long (ou Maj+clic, ou Espace)
 * sélectionne, et une barre propose alors de générer ou de supprimer les assets cochés. */
export function RegistreAssets({
  projectId,
  lignes,
  typeInitial,
  imagesInitial,
}: {
  projectId: number;
  lignes: LigneRegistre[];
  /** Voix du casting : hors de la grille, un lien les ramène à leur module. */
  typeInitial: string | null;
  /** Où en sont les images du projet (lib/images-projet.ts) : alimente la ligne « Il reste N images à générer ». */
  imagesInitial: EtatImages;
}) {
  const router = useRouter();
  const { etat: images, recharger: rechargerImages } = useEtatImages(projectId, imagesInitial);
  // Une image adoptée par le worker change la grille : on relit la page quand le compte bouge.
  const avecImage = images?.avecImage;
  const dernierCompte = useRef(avecImage);
  useEffect(() => {
    if (dernierCompte.current !== avecImage) {
      dernierCompte.current = avecImage;
      router.refresh();
    }
  }, [avecImage, router]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string | null>(typeInitial);
  const [statut, setStatut] = useState<string>("");
  const [sansPlan, setSansPlan] = useState(false);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [vue, setVue] = useState<"grille" | "liste">("grille");
  const [choisis, setChoisis] = useState<Set<string>>(() => new Set());
  const [vient, setVient] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [pending, startTransition] = useTransition();
  const rechercheRef = useRef<HTMLInputElement>(null);
  /** Le dernier asset coché : borne de départ d'une sélection par plage (Maj+clic). */
  const dernier = useRef<string | null>(null);

  const modeSelection = choisis.size > 0;

  // La vue (grille ou liste) est une préférence de l'utilisateur : lue après le montage pour ne pas créer d'écart d'hydratation.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CLE_VUE);
      if (v === "liste" || v === "grille") setVue(v);
    } catch {
      // stockage indisponible : la grille reste la vue par défaut
    }
  }, []);
  const changerVue = (v: "grille" | "liste") => {
    setVue(v);
    try {
      window.localStorage.setItem(CLE_VUE, v);
    } catch {
      // ignoré
    }
  };

  // ---- Filtres ----
  const typesPresents = useMemo(() => ORDRE_TYPES.filter((t) => lignes.some((l) => l.type === t)), [lignes]);
  const compteurType = (t: string) => lignes.filter((l) => l.type === t).length;
  const nbSansPlan = useMemo(() => lignes.filter((l) => l.nbPlans === 0).length, [lignes]);
  const nbAProduire = useMemo(() => lignes.filter((l) => l.statut === "a_produire").length, [lignes]);
  const compteStatut = (s: string) => lignes.filter((l) => l.statut === s).length;

  // Quels filtres ont un sens selon le nombre d'assets (lib/registre-filtres.ts) ; un filtre que le registre ne propose plus ne s'applique plus :
  // on ne filtre jamais en cachette.
  const utiles = useMemo(() => filtresUtiles(lignes), [lignes]);
  const typeActif = utiles.types ? type : null;
  const statutActif = utiles.avances ? statut : "";
  const sansPlanActif = utiles.avances && sansPlan;
  const termeActif = utiles.recherche ? q.trim().toLowerCase() : "";

  const visibles = useMemo(
    () =>
      lignes.filter(
        (l) =>
          (!typeActif || l.type === typeActif) &&
          (!statutActif || l.statut === statutActif) &&
          (!sansPlanActif || l.nbPlans === 0) &&
          (!termeActif ||
            l.code.toLowerCase().includes(termeActif) ||
            l.libelle.toLowerCase().includes(termeActif) ||
            (l.description ?? "").toLowerCase().includes(termeActif) ||
            (LIBELLE_TYPE_ASSET[l.type] ?? "").toLowerCase().includes(termeActif)),
      ),
    [lignes, typeActif, statutActif, sansPlanActif, termeActif],
  );

  const filtresActifs = termeActif !== "" || typeActif != null || statutActif !== "" || sansPlanActif;
  const nbFiltresAvances = (statutActif !== "" ? 1 : 0) + (sansPlanActif ? 1 : 0);
  const toutEffacer = () => {
    setQ("");
    setType(null);
    setStatut("");
    setSansPlan(false);
  };

  // ---- Sélection ----
  const parCode = useMemo(() => new Map(lignes.map((l) => [l.code, l])), [lignes]);
  // Un asset supprimé (ou filtré hors de la liste des lignes) ne reste pas coché.
  useEffect(() => {
    setChoisis((cur) => {
      const reste = new Set([...cur].filter((c) => parCode.has(c)));
      return reste.size === cur.size ? cur : reste;
    });
  }, [parCode]);

  const sortirSelection = useCallback(() => {
    setChoisis(new Set());
    setConfirmer(false);
    setVient(null);
  }, []);

  const toutSelectionner = () => {
    setConfirmer(false);
    setVient(null);
    setChoisis(new Set(visibles.map((l) => l.code)));
  };

  const basculer = (code: string, plage = false) => {
    setConfirmer(false);
    const suite = new Set(choisis);
    if (plage && dernier.current && dernier.current !== code) {
      // Maj+clic : tout ce qui sépare le dernier asset coché de celui-ci, dans l'ordre d'affichage.
      for (const c of plageDeCodes(visibles.map((l) => l.code), dernier.current, code)) suite.add(c);
      setVient(code);
    } else if (suite.has(code)) {
      suite.delete(code);
      setVient(null);
    } else {
      suite.add(code);
      setVient(code);
    }
    dernier.current = code;
    setChoisis(suite);
  };

  // ---- Clic long : une onde dorée gagne la carte pendant l'appui, puis l'asset se sélectionne ----
  const appui = useRef<{ el: HTMLElement; x: number; y: number; timer: number; code: string } | null>(null);
  const longFait = useRef(false);

  const finAppui = useCallback(() => {
    const a = appui.current;
    if (!a) return;
    window.clearTimeout(a.timer);
    a.el.classList.remove("is-appui");
    appui.current = null;
  }, []);
  useEffect(() => finAppui, [finAppui]);

  const surAppui = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const cible = e.target as HTMLElement;
    const el = cible.closest<HTMLElement>("[data-code]");
    if (!el || cible.closest("button")) return;
    longFait.current = false;
    if (modeSelection) return; // déjà en sélection : un simple clic bascule, pas besoin de durée
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty("--rx", `${x}px`);
    el.style.setProperty("--ry", `${y}px`);
    el.style.setProperty("--rd", `${Math.ceil(2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)))}px`);
    el.classList.add("is-appui");
    const code = el.dataset.code!;
    appui.current = {
      el,
      x: e.clientX,
      y: e.clientY,
      code,
      timer: window.setTimeout(() => {
        longFait.current = true;
        el.classList.remove("is-appui");
        appui.current = null;
        setChoisis(new Set([code]));
        setVient(code);
        if (navigator.vibrate) {
          try {
            navigator.vibrate(12);
          } catch {
            // ignoré
          }
        }
      }, DUREE_APPUI),
    };
  };
  const surDeplacement = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = appui.current;
    if (a && Math.hypot(e.clientX - a.x, e.clientY - a.y) > 8) finAppui(); // défilement : on annule
  };

  const surActivation = (e: React.MouseEvent<HTMLAnchorElement>, code: string) => {
    if (longFait.current) {
      // Le relâchement qui suit un clic long ne doit rien ouvrir.
      e.preventDefault();
      longFait.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // nouvel onglet : comportement du navigateur
    // La coche de la carte, Maj+clic, ou n'importe quel clic une fois en sélection : on coche au lieu d'ouvrir la fiche.
    const surCoche = (e.target as HTMLElement).closest(".as-coche") != null;
    if (surCoche || modeSelection || e.shiftKey) {
      e.preventDefault();
      basculer(code, e.shiftKey);
    }
  };

  const surClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== " ") return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-code]");
    if (!el) return;
    e.preventDefault();
    basculer(el.dataset.code!);
  };

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const dansChamp = e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (e.key === "/" && !dansChamp && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        rechercheRef.current?.focus();
      } else if (e.key === "Escape" && !dansChamp) {
        sortirSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !dansChamp && modeSelection) {
        e.preventDefault();
        setChoisis(new Set(visibles.map((l) => l.code)));
      }
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [sortirSelection, modeSelection, visibles]);

  // Retour d'une action en lot : visible quelques secondes dans la barre, puis disparaît.
  useEffect(() => {
    if (!retour) return;
    const t = window.setTimeout(() => setRetour(null), 6000);
    return () => window.clearTimeout(t);
  }, [retour]);

  // ---- Actions sur la sélection ----
  const selection = useMemo(() => lignes.filter((l) => choisis.has(l.code)), [lignes, choisis]);
  const partants = selection.filter((l) => raisonEcarte(l) == null);
  const ecartes = selection.filter((l) => raisonEcarte(l) != null);
  const supprimables = selection.filter((l) => l.blocageSuppression == null);
  const bloques = selection.filter((l) => l.blocageSuppression != null);
  /** Ce qui peut être validé : un fichier présent, pas encore validé. */
  const validables = selection.filter((l) => l.statut === "en_cours");

  const generer = () =>
    startTransition(async () => {
      const r = await lancerGenerationsLot(projectId, partants.map((l) => l.id));
      if (!r.ok) {
        setRetour({ ok: false, texte: r.erreur });
        return;
      }
      const ecartesServeur = r.ecartes.length ? ` · ${r.ecartes.length} écartée${r.ecartes.length > 1 ? "s" : ""} : ${r.ecartes.map((e) => `${e.code} (${e.raison})`).join(" ; ")}` : "";
      setRetour({ ok: true, texte: `${r.lancees} génération${r.lancees > 1 ? "s" : ""} en file${ecartesServeur}` });
      sortirSelection();
    });

  const valider = () =>
    startTransition(async () => {
      const r = await validerAssets(validables.map((l) => l.id));
      setRetour({ ok: true, texte: `${r.valides} asset${r.valides > 1 ? "s" : ""} validé${r.valides > 1 ? "s" : ""}` });
      sortirSelection();
    });

  const supprimer = () =>
    startTransition(async () => {
      const r = await supprimerAssets(supprimables.map((l) => l.id));
      const reste = r.bloques.length ? ` · ${r.bloques.length} bloqué${r.bloques.length > 1 ? "s" : ""} : ${r.bloques.map((b) => `${b.code} (${b.erreur})`).join(" ; ")}` : "";
      setRetour({ ok: r.bloques.length === 0, texte: `${r.supprimes} asset${r.supprimes > 1 ? "s" : ""} supprimé${r.supprimes > 1 ? "s" : ""}${reste}` });
      sortirSelection();
    });

  const href = (l: LigneRegistre) => `/p/${projectId}/assets/${l.code}`;
  const barreVisible = modeSelection || retour != null;

  return (
    <>
      {images && images.sansImage > 0 ? (
        <div className="im-registre">
          <span>
            Il reste <b>{images.sansImage} image{images.sansImage > 1 ? "s" : ""}</b> à générer
            {images.enFile > 0 ? ` (${images.enFile} déjà en file ou en cours)` : ""}.
          </span>
          <BoutonGenererImages projectId={projectId} etat={images} recharger={rechargerImages} petit />
        </div>
      ) : null}
      <div className="as-outils" role="search">
        {utiles.recherche ? (
          <label className="as-recherche">
            <Icone nom="recherche" taille={16} />
            <input
              ref={rechercheRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher un asset, une description…"
              aria-label="Chercher un asset"
              autoComplete="off"
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
        ) : null}

        {utiles.types ? (
          <div className="as-puces" role="group" aria-label="Filtrer par type">
            <button type="button" className="as-puce" aria-pressed={type == null} onClick={() => setType(null)}>
              Tous <em>{lignes.length}</em>
            </button>
            {typesPresents.map((t) => (
              <button key={t} type="button" className="as-puce" aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>
                {LIBELLE_TYPE_ASSET[t] ?? t} <em>{compteurType(t)}</em>
              </button>
            ))}
          </div>
        ) : null}

        {utiles.avances ? (
          <button type="button" className="as-puce as-filtres-bouton" aria-pressed={filtresOuverts || nbFiltresAvances > 0} aria-expanded={filtresOuverts} onClick={() => setFiltresOuverts(!filtresOuverts)}>
            Filtres {nbFiltresAvances > 0 ? <em>{nbFiltresAvances}</em> : null}
          </button>
        ) : null}

        <div className="as-vues" role="group" aria-label="Affichage">
          <button type="button" aria-pressed={vue === "grille"} onClick={() => changerVue("grille")} aria-label="Grille" title="Grille">
            <Icone nom="grille" taille={16} />
          </button>
          <button type="button" aria-pressed={vue === "liste"} onClick={() => changerVue("liste")} aria-label="Liste" title="Liste">
            <Icone nom="liste" taille={16} />
          </button>
        </div>
      </div>

      {utiles.avances && filtresOuverts ? (
        <div className="as-filtres-plus" role="group" aria-label="Filtres avancés">
          <select className="as-select" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Filtrer par statut">
            <option value="">Tous les statuts</option>
            {(["a_produire", "en_cours", "valide"] as const).map((s) => (
              <option key={s} value={s}>
                {LIBELLE_STATUT[s]} ({compteStatut(s)})
              </option>
            ))}
          </select>
          <button type="button" className="as-puce" aria-pressed={sansPlan} onClick={() => setSansPlan(!sansPlan)} title="Assets qu'aucune fiche de plan ne cite : ce qu'on peut nettoyer">
            Sans plan <em>{nbSansPlan}</em>
          </button>
        </div>
      ) : null}

      <p className="as-astuce">
        {lignes.length > 1 ? (
          <>
            Clic pour ouvrir la fiche · la <b style={{ fontWeight: 500, color: "var(--ink-3)" }}>coche</b> d&rsquo;une carte (ou un clic long) pour en sélectionner plusieurs, <kbd>Maj</kbd>+clic pour une plage
            {" · "}
          </>
        ) : null}
        <span className="num" style={{ fontFamily: "var(--font-mono), monospace" }}>
          {visibles.length === lignes.length ? `${lignes.length} sujet${lignes.length > 1 ? "s" : ""}` : `${visibles.length} sur ${lignes.length}`}
          {nbAProduire > 0 ? `, ${nbAProduire} à produire` : ""}
        </span>
      </p>

      <div
        className={modeSelection ? "is-selection" : undefined}
        onPointerDown={surAppui}
        onPointerMove={surDeplacement}
        onPointerUp={finAppui}
        onPointerCancel={finAppui}
        onPointerLeave={finAppui}
        onKeyDown={surClavier}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest("[data-code]")) e.preventDefault();
        }}
      >
        {visibles.length === 0 ? (
          <div className="as-vide">
            {lignes.length === 0 ? (
              <>
                Aucun asset en base. Lancer <code>npm run db:import</code> ou en ajouter un avec « Nouveau sujet ».
              </>
            ) : (
              <>
                Aucun asset ne correspond.{" "}
                {filtresActifs ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={toutEffacer} style={{ marginLeft: 8 }}>
                    Effacer les filtres
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : vue === "grille" ? (
          <div className="as-grille">
            {visibles.map((l) => (
              <AssetCard key={l.id} ligne={l} href={href(l)} choisi={choisis.has(l.code)} vient={vient === l.code} onActiver={surActivation} />
            ))}
          </div>
        ) : (
          <div className={`as-liste${modeSelection ? " is-selection" : ""}`}>
            <div className="as-ligne as-tete" aria-hidden="true">
              <span />
              <span />
              <span>Code</span>
              <span className="as-cache-s">Type</span>
              <span>Statut</span>
              <span className="as-cache-s">Plans</span>
              <span className="as-cache-s">Voix</span>
            </div>
            {visibles.map((l) => (
              <LigneAsset key={l.id} ligne={l} href={href(l)} choisi={choisis.has(l.code)} vient={vient === l.code} onActiver={surActivation} />
            ))}
          </div>
        )}
      </div>

      {barreVisible ? (
        <div className="as-lot" role="region" aria-label="Actions sur la sélection">
          {retour && !modeSelection ? (
            <>
              <span className="as-lot-detail" role="status" style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
                {retour.texte}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetour(null)}>
                Fermer
              </button>
            </>
          ) : confirmer ? (
            <>
              <span className="as-lot-n">
                Supprimer <b>{supprimables.length}</b> asset{supprimables.length > 1 ? "s" : ""} ? Les fichiers sont effacés.
              </span>
              <div className="as-lot-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmer(false)} disabled={pending}>
                  Retour
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={supprimer} disabled={pending}>
                  {pending ? "…" : "Supprimer pour de bon"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="as-lot-fermer" onClick={sortirSelection} disabled={pending} aria-label="Annuler la sélection" title="Annuler la sélection (Échap)">
                <Icone nom="fermer" taille={14} />
              </button>
              <div className="as-lot-texte">
                <span className="as-lot-n">
                  <b>{choisis.size}</b> sélectionné{choisis.size > 1 ? "s" : ""}
                </span>
                <span className="as-lot-detail">
                  {partants.length} à générer
                  {ecartes.length ? (
                    <>
                      {" · "}
                      <u title={ecartes.map((l) => `${l.code} : ${raisonEcarte(l)}`).join("\n")}>
                        {ecartes.length} écarté{ecartes.length > 1 ? "s" : ""}
                      </u>
                    </>
                  ) : null}
                  {bloques.length ? (
                    <>
                      {" · "}
                      <u title={bloques.map((l) => `${l.code} : ${l.blocageSuppression}`).join("\n")}>
                        {bloques.length} non supprimable{bloques.length > 1 ? "s" : ""}
                      </u>
                    </>
                  ) : null}
                </span>
              </div>
              <div className="as-lot-actions">
                {choisis.size < visibles.length ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={toutSelectionner} disabled={pending}>
                    Tout ({visibles.length})
                  </button>
                ) : null}
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmer(true)} disabled={pending || supprimables.length === 0}>
                  {supprimables.length ? `Supprimer ${supprimables.length}` : "Rien à supprimer"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={valider} disabled={pending || validables.length === 0} title="Marque comme validées les images déjà là (un fichier présent, pas encore validé)">
                  <Icone nom="valide" taille={14} /> {validables.length ? `Valider ${validables.length}` : "Rien à valider"}
                </button>
                <button type="button" className="btn btn-gold btn-sm" onClick={generer} disabled={pending || partants.length === 0}>
                  {pending ? "…" : partants.length ? `Générer ${partants.length} image${partants.length > 1 ? "s" : ""}` : "Rien à générer"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
