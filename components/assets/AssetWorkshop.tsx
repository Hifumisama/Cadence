"use client";

import "./fiche-asset.css";
import "./fiche-asset-mise-en-page.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { lancerEssai, type BaseEssai, type ImageJointe } from "@/app/assets/essai-actions";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { ImagesJointes, type Jointe, type JointeDisponible } from "@/components/assets/AttachedImages";
import { UploadFichierForm } from "@/components/assets/UploadFileForm";
import { Icone } from "@/components/ui/Icon";
import { CANDIDATS_GARDES, STATUT_TRADUCTION, maxImagesJointes } from "@/lib/assets/asset-generation";
import { urlMiniature } from "@/lib/thumbnails";
import type { GenerationVue } from "@/lib/assets/queries-generations";
import { ilYa } from "@/lib/relative-time";

/** The workshop of an asset sheet (images), « comme la fiche de plan » (like the clip sheet): on the left the image in its mat and its caption; on the right, in sight from arrival,
 * the instruction in French then the attempt log. Without a base image, the instruction CREATES the image; with a base image —
 * the current image or the attempt being viewed —, it RETOUCHES it. An agent translates the instruction into a prompt: the user never writes a prompt, and
 * never chooses a model. Each attempt keeps its instruction, its base image and its prompt. Mockup: docs/maquettes/fiche-asset.html. */

type Selection = "actuelle" | string | null; // « actuelle », the uuid of an attempt, or nothing

const ACTIFS = ["traduction", "en_attente", "en_cours"];
const estActif = (e: GenerationVue) => ACTIFS.includes(e.statut);
const estPret = (e: GenerationVue) => e.statut === "termine" && e.src != null;
const pourcent = (e: GenerationVue) => (e.progression ? Math.round((e.progression.valeur / e.progression.max) * 100) : 0);

/** A stable hue derived from the asset's code: the scene takes a glow in its color. */
const teinteDe = (code: string) => {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 42% 52%)`;
};

export function AtelierAsset({
  assetId,
  code,
  libelle,
  imageSrc,
  fichierAt,
  valide,
  essais,
  essaiInitial,
  description,
  plansRendus,
  registre,
  affiche = false,
  jointesInitiales = [],
}: {
  assetId: number;
  code: string;
  libelle: string;
  /** The asset's image (with its version in `?v=`), null if it has none. */
  imageSrc: string | null;
  /** When the asset's image was set (ms): the « retenu » (kept) attempt is the one carrying the same date. */
  fichierAt: number | null;
  /** The asset is validated. */
  valide: boolean;
  /** The image attempts, from newest to oldest. */
  essais: GenerationVue[];
  /** uuid of an attempt to open by default (`?generation=` link from the task indicator). */
  essaiInitial: string | null;
  description: string;
  /** Clips already rendered with this image: replacing the image makes them stale. */
  plansRendus: number;
  /** The registry images that can be attached to an instruction. */
  registre: JointeDisponible[];
  /** The asset is a presentation poster (portrait 2:3): the kept image becomes the project's, no direct import. */
  affiche?: boolean;
  /** Images attached by default to the first instruction (the main character of a poster); they can be removed. */
  jointesInitiales?: Jointe[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Selection>(essaiInitial && essais.some((e) => e.uuid === essaiInitial) ? essaiInitial : imageSrc ? "actuelle" : null);
  const [consigne, setConsigne] = useState("");
  const [jointes, setJointes] = useState<Jointe[]>(jointesInitiales);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [aJeter, setAJeter] = useState<string | null>(null);
  const [secoue, setSecoue] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [dims, setDims] = useState<Record<string, { l: number; h: number }>>({});
  const [pending, startTransition] = useTransition();
  const lances = useRef<Set<string>>(new Set());
  const liste = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const dialogue = useRef<HTMLDialogElement>(null);

  // Number of an attempt: its rank in arrival order (the oldest is #1).
  const numeros = useMemo(() => new Map([...essais].sort((a, b) => a.id - b.id).map((e, i) => [e.uuid, i + 1])), [essais]);
  const essai = (uuid: string | null) => (uuid ? (essais.find((e) => e.uuid === uuid) ?? null) : null);

  // What is being viewed: the current image, an attempt, or nothing. A deleted attempt goes back to the current image.
  const choisi = selection && selection !== "actuelle" ? essai(selection) : null;
  const regarde: "actuelle" | GenerationVue | null = choisi ?? (selection && imageSrc ? "actuelle" : null);

  // The base of the next attempt: what is being viewed, if it is a ready image; otherwise the current image; otherwise nothing (the image is created from scratch).
  const base: BaseEssai = regarde === "actuelle" ? "actuelle" : regarde && estPret(regarde) ? { essai: regarde.uuid } : imageSrc ? "actuelle" : null;
  const retouche = base != null;
  const baseSrc = base === "actuelle" ? imageSrc : base ? (essai(base.essai)?.src ?? null) : null;
  // Qwen Image Edit takes 3 images: creating attaches up to 3, retouching leaves only one more next to the base.
  // A poster created from images starts from an empty canvas as image 1 (which counts as the base): two attached images at most.
  const maxJointes = maxImagesJointes(retouche || affiche);
  const trop = jointes.length > maxJointes;
  const libelleBase = base === "actuelle" ? "l'image actuelle" : base ? `l'essai n°${numeros.get(base.essai)}` : null;

  const retenu = (e: GenerationVue) => e.adopteAt != null && fichierAt != null && e.adopteAt === fichierAt;
  const retenuActuel = essais.find(retenu);

  // While an attempt is working, the page re-reads (progress, preview, end of translation).
  const actifs = essais.some(estActif);
  useEffect(() => {
    if (!actifs) return;
    const t = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(t);
  }, [actifs, router]);

  // An attempt launched from here is shown as soon as it is ready.
  useEffect(() => {
    for (const uuid of [...lances.current]) {
      const e = essais.find((x) => x.uuid === uuid);
      if (e && estPret(e)) {
        lances.current.delete(uuid);
        setSelection(uuid);
      } else if (e && !estActif(e)) lances.current.delete(uuid);
    }
  }, [essais]);

  // The attempt being viewed re-centers in the log: only the log scrolls, never the page.
  const courant = regarde === "actuelle" ? "actuelle" : (regarde?.uuid ?? null);
  useEffect(() => {
    const l = liste.current;
    const el = l?.querySelector<HTMLElement>("[data-courant='true']");
    if (!l || !el) return;
    const vertical = getComputedStyle(l).flexDirection === "column";
    if (vertical) l.scrollTo({ top: el.offsetTop - l.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
    else l.scrollTo({ left: el.offsetLeft - l.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
  }, [courant]);

  // ↑ ↓ move from one attempt to another (outside the input).
  const ordre = useMemo<Selection[]>(() => [...(imageSrc ? ["actuelle"] : []), ...essais.map((e) => e.uuid)], [imageSrc, essais]);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable || t.closest("[role='tablist']"))) return;
      const i = ordre.indexOf(courant);
      const suivant = ordre[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (suivant) {
        e.preventDefault();
        setSelection(suivant);
      }
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [ordre, courant]);

  // Fullscreen.
  useEffect(() => {
    const d = dialogue.current;
    if (!d) return;
    if (zoom && !d.open) d.showModal();
    if (!zoom && d.open) d.close();
  }, [zoom]);

  const noterDims = (cle: string, img: HTMLImageElement) => {
    if (!img.naturalWidth) return;
    setDims((d) => (d[cle]?.l === img.naturalWidth ? d : { ...d, [cle]: { l: img.naturalWidth, h: img.naturalHeight } }));
  };
  const cleVue = regarde === "actuelle" ? "actuelle" : (regarde?.uuid ?? "");

  const lancer = (texte = consigne, depuis: BaseEssai = base) => {
    if (trop) {
      setRetour({ ok: false, texte: `Pour retoucher, une seule image peut s'ajouter à la base : retire-en ${jointes.length - maxJointes}.` });
      return;
    }
    if ((retouche || (jointes.length > 0 && !affiche)) && !texte.trim()) {
      setSecoue(true);
      window.setTimeout(() => setSecoue(false), 400);
      champ.current?.focus();
      setRetour({ ok: false, texte: retouche ? "Écris ce qu'on change : l'image sert de base." : "Écris ce que tu veux faire de ces images." });
      return;
    }
    startTransition(async () => {
      setRetour(null);
      const r = await lancerEssai(assetId, {
        consigne: texte,
        base: depuis,
        jointes: jointes.map((j): ImageJointe => (j.origine === "asset" ? { origine: "asset", assetId: j.assetId } : { origine: "import", fichier: j.fichier })),
      });
      if (!r.ok) {
        setRetour({ ok: false, texte: r.erreur });
        return;
      }
      if (r.uuid) {
        lances.current.add(r.uuid);
        setSelection(r.uuid);
      }
      setConsigne("");
      setJointes([]);
      router.refresh();
    });
  };

  const adopter = (e: GenerationVue) =>
    startTransition(async () => {
      const r = await adopterGeneration(e.id);
      setRetour(
        r.ok
          ? {
              ok: true,
              texte: `Essai n°${numeros.get(e.uuid)} adopté : c'est maintenant ${affiche ? "l'image de présentation." : "l'image de l'asset (à revalider)."}${plansRendus ? ` ${plansRendus} plan${plansRendus > 1 ? "s" : ""} déjà rendu${plansRendus > 1 ? "s" : ""} ${plansRendus > 1 ? "sont périmés" : "est périmé"}.` : ""}`,
            }
          : { ok: false, texte: r.erreur },
      );
      if (r.ok) setSelection("actuelle");
      router.refresh();
    });

  const jeter = (e: GenerationVue) =>
    startTransition(async () => {
      const r = await supprimerGeneration(e.id);
      setAJeter(null);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
      if (r.ok) setSelection(imageSrc ? "actuelle" : null);
      router.refresh();
    });

  const surClavier = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !pending) {
      e.preventDefault();
      lancer();
    }
  };

  const nbEssais = essais.length;
  const numeroRegarde = regarde && regarde !== "actuelle" ? numeros.get(regarde.uuid) : undefined;

  return (
    <div className="atelier" style={{ "--teinte": teinteDe(code) } as React.CSSProperties}>
      <div className="atelier-g">
        <div className="outils">
          <h2>
            Atelier <small>{imageSrc ? (nbEssais ? `${nbEssais} essai${nbEssais > 1 ? "s" : ""}` : "aucun essai") : "pas encore d'image"}</small>
          </h2>
          {affiche ? null : <UploadFichierForm assetId={assetId} classe="btn btn-fant btn-sm" libelle="Importer une image" />}
        </div>

        {/* ---- The scene ---- */}
        <div className={`scene${regarde === "actuelle" && valide ? " valide" : ""}`}>
          {regarde === "actuelle" && imageSrc ? (
            <>
              <span className={`etiq hg${valide ? " or" : ""}`}>Image actuelle{valide ? " · validée" : ""}</span>
              {dims.actuelle ? <span className="etiq hd">{dims.actuelle.l}×{dims.actuelle.h}</span> : null}
              <div className="passe entre" key={imageSrc}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="zoom-image" src={urlMiniature(imageSrc, 768)} alt={`${libelle}, image actuelle`} onClick={() => setZoom(imageSrc)} onLoad={(e) => noterDims("actuelle", e.currentTarget)} />
              </div>
              <button type="button" className="zoom-btn" onClick={() => setZoom(imageSrc)}>
                <Icone nom="agrandir" taille={14} /> Agrandir
              </button>
            </>
          ) : regarde && regarde !== "actuelle" ? (
            regarde.statut === "termine" && regarde.src ? (
              <>
                <span className={`etiq hg${retenu(regarde) ? " or" : ""}`}>
                  Essai n°{numeroRegarde}
                  {retenu(regarde) ? " · retenu" : ""}
                </span>
                {dims[regarde.uuid] ? <span className="etiq hd">{dims[regarde.uuid]!.l}×{dims[regarde.uuid]!.h}</span> : null}
                <div className="passe entre" key={regarde.uuid}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="zoom-image" src={urlMiniature(regarde.src, 768)} alt={`Essai n°${numeroRegarde}`} onClick={() => setZoom(regarde.src)} onLoad={(e) => noterDims(regarde.uuid, e.currentTarget)} />
                </div>
                <button type="button" className="zoom-btn" onClick={() => setZoom(regarde.src)}>
                  <Icone nom="agrandir" taille={14} /> Agrandir
                </button>
              </>
            ) : regarde.statut === "echoue" || regarde.statut === "annulee" ? (
              <>
                <span className="etiq hg">Essai n°{numeroRegarde}</span>
                <div className="boite plein echec entre" key={regarde.uuid}>
                  {regarde.baseSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="fantome" src={urlMiniature(regarde.baseSrc, 384)} alt="" />
                  ) : null}
                  <div className="boite-contenu">
                    <div>
                      <b>{regarde.statut === "annulee" ? "Cet essai a été annulé" : "Cet essai n'a rien produit"}</b>
                      <p>{regarde.erreur ?? "La génération s'est arrêtée."}</p>
                      <div className="ligne">
                        {regarde.consigne || !retouche ? (
                          <button type="button" className="btn btn-or btn-sm" onClick={() => lancer(regarde.consigne ?? "")} disabled={pending}>
                            Relancer la même consigne
                          </button>
                        ) : null}
                        {regarde.consigne ? (
                          <button
                            type="button"
                            className="btn btn-fant btn-sm"
                            onClick={() => {
                              setConsigne(regarde.consigne ?? "");
                              champ.current?.focus();
                            }}
                          >
                            Modifier la consigne
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="etiq hg">Essai n°{numeroRegarde} · en travail</span>
                <div className="boite plein chatoie entre" key={regarde.uuid}>
                  {regarde.apercuSrc || regarde.baseSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="flou"
                        src={regarde.apercuSrc ?? urlMiniature(regarde.baseSrc!, 384)}
                        alt=""
                        style={{ "--flou": `${(22 * (1 - pourcent(regarde) / 100)).toFixed(1)}px`, "--sat": (regarde.statut === "en_cours" ? 0.6 + 0.4 * (pourcent(regarde) / 100) : 0.25).toFixed(2), opacity: regarde.statut === "en_cours" ? 1 : 0.45 } as React.CSSProperties}
                      />
                    ) : null}
                </div>
                <Travail essai={regarde} numero={numeroRegarde ?? 0} />
              </>
            )
          ) : (
            <div className="passe entre">
              <div className="boite vierge" style={{ "--ar": affiche ? "2 / 3" : "16 / 9" } as React.CSSProperties}>
                <div>
                  <Icone nom="image" taille={42} />
                  <b>Pas encore d&rsquo;image</b>
                  <p>Décris ce que tu veux voir à droite. L&rsquo;agent s&rsquo;occupe du reste.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---- The caption ---- */}
        <div className="legende glisse" key={cleVue || "vide"} aria-live="polite">
          {!regarde ? (
            <>
              <div className="leg-tete">
                <span className="qui">Première image</span>
              </div>
              <div className="leg-corps">
                <span className="sans">Aucune image pour l&rsquo;instant. Écris ta consigne, ou laisse-la vide : l&rsquo;agent partira de la description de l&rsquo;asset.</span>
              </div>
            </>
          ) : regarde === "actuelle" ? (
            <>
              <div className="leg-tete">
                <span className="qui">
                  <b>Image actuelle</b>
                  {retenuActuel ? ` · issue de l'essai n°${numeros.get(retenuActuel.uuid)}` : ""}
                </span>
                <span className="leg-actions">
                  {valide ? (
                    <span className="retenu-badge">
                      <Icone nom="valide" taille={14} />
                      Validée
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="leg-corps">
                <span className="sans">C&rsquo;est l&rsquo;image que les plans utilisent. Choisis un essai dans le journal pour le comparer, ou écris une consigne pour la retoucher.</span>
              </div>
            </>
          ) : (
            <>
              <div className="leg-tete">
                <span className="qui">
                  <b className="num">Essai n°{numeroRegarde}</b> · {regarde.methode === "edition" ? "retouche" : "création"} ·{" "}
                  <span suppressHydrationWarning>{ilYa(regarde.createdAt)}</span>
                </span>
                <span className="leg-actions">
                  {regarde.statut === "termine" ? (
                    retenu(regarde) ? (
                      <span className="retenu-badge">
                        <Icone nom="valide" taille={14} />
                        Image retenue
                      </span>
                    ) : (
                      <button type="button" className="btn btn-or btn-sm" onClick={() => adopter(regarde)} disabled={pending}>
                        <Icone nom="valide" taille={14} /> Utiliser cet essai
                      </button>
                    )
                  ) : null}
                  {regarde.consigne ? (
                    <button
                      type="button"
                      className="btn btn-fant btn-sm"
                      onClick={() => {
                        setConsigne(regarde.consigne ?? "");
                        champ.current?.focus();
                      }}
                      title="Remet cette consigne dans le champ pour la modifier"
                    >
                      Reprendre la consigne
                    </button>
                  ) : null}
                  {estActif(regarde) ? null : aJeter === regarde.uuid ? (
                    <>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => jeter(regarde)} disabled={pending}>
                        Supprimer l&rsquo;essai
                      </button>
                      <button type="button" className="btn btn-fant btn-sm" onClick={() => setAJeter(null)}>
                        Garder
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-fant btn-ico" onClick={() => setAJeter(regarde.uuid)} aria-label="Supprimer cet essai" title="Supprimer cet essai">
                      <Icone nom="supprimer" taille={15} />
                    </button>
                  )}
                </span>
              </div>
              <div className="leg-corps">
                {regarde.consigne ? <q>{regarde.consigne}</q> : <span className="sans">Sans consigne : créé à partir de la description de l&rsquo;asset.</span>}
                {regarde.jointesSrc.map((src, k) => (
                  <button key={src} type="button" className="depart" onClick={() => setZoom(src)} title={`Image ${k + 2} jointe à cet essai`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src.startsWith("blob:") ? src : urlMiniature(src, 96)} alt="" />
                    <span>image {k + 2}</span>
                  </button>
                ))}
                {regarde.baseSrc ? (
                  <button type="button" className="depart" onClick={() => setZoom(regarde.baseSrc)} title="Voir l'image dont cet essai est parti">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlMiniature(regarde.baseSrc, 96)} alt="" />
                    <span>à partir de</span>
                  </button>
                ) : null}
              </div>
              {regarde.statut === "echoue" && regarde.erreur ? <p className="erreur-txt">{regarde.erreur}</p> : null}
              {regarde.prompt ? (
                <details className="prompt">
                  <summary>
                    <Icone nom="droite" taille={12} />
                    Voir le prompt écrit par l&rsquo;agent
                  </summary>
                  <p>{regarde.prompt}</p>
                </details>
              ) : regarde.statut === STATUT_TRADUCTION ? (
                <p className="aide">Le prompt sera visible ici dès que l&rsquo;agent l&rsquo;aura écrit.</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="atelier-d">
        {/* ---- The instruction ---- */}
        <section className="consigne" aria-labelledby="fa-consigne-titre" onKeyDown={surClavier}>
          <label htmlFor="fa-consigne">
            <b id="fa-consigne-titre">{retouche ? "Qu'est-ce qu'on change ?" : "Quelle image veut-on ?"}</b>
            <small>{retouche ? "Dis-le en français, comme à un retoucheur. L'agent écrit le prompt et retouche l'image." : "Dis-le en français. L'agent écrit le prompt et crée l'image."}</small>
          </label>
          <textarea
            id="fa-consigne"
            ref={champ}
            className={secoue ? "secoue" : undefined}
            value={consigne}
            onChange={(e) => setConsigne(e.target.value)}
            disabled={pending}
            placeholder={
              !retouche && jointes.length > 0
                ? "Ce qu'on fait de ces images : « elle porte la veste de l'image 2 », « dans le décor de l'image 3 »…"
                : retouche
                ? "Les cheveux plus courts, une fine cicatrice sur la joue gauche, la lumière d'une loge juste avant d'entrer en scène…"
                : description.trim()
                  ? "Laisse vide pour partir de la description, ou précise : l'heure, la lumière, le point de vue…"
                  : "Une danseuse aux cheveux roux, regard calme, tenue de scène sombre…"
            }
          />
          <ImagesJointes
            assetId={assetId}
            base={baseSrc ? { src: baseSrc, libelle: libelleBase ?? "" } : null}
            jointes={jointes}
            max={maxJointes}
            registre={registre}
            desactive={pending}
            onChange={setJointes}
          />
          {trop ? (
            <p className="retour ko" role="alert">
              Une retouche garde l&rsquo;image de base et une seule image de plus : retire-en {jointes.length - maxJointes}.
            </p>
          ) : null}
          <p className="base">
            {baseSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlMiniature(baseSrc, 96)} alt="" />
                Base : <b>{libelleBase}</b>
                {imageSrc && base !== "actuelle" ? (
                  <>
                    {" · "}
                    <button type="button" className="lien" onClick={() => setSelection("actuelle")}>
                      Reprendre l&rsquo;image actuelle
                    </button>
                  </>
                ) : null}
                {!imageSrc ? (
                  <>
                    {" · "}
                    <button type="button" className="lien" onClick={() => setSelection(null)}>
                      Repartir de zéro
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              jointes.length > 0 ? "Pas d'image de base : l'image est créée à partir des images jointes." : "Aucune image de base : l'image sera créée de zéro."
            )}
          </p>
          {retour ? (
            <p className={`retour ${retour.ok ? "ok" : "ko"}`} role={retour.ok ? "status" : "alert"}>
              {retour.texte}
            </p>
          ) : null}
          <div className="envoi">
            <button type="button" className="btn btn-or" onClick={() => lancer()} disabled={pending}>
              <Icone nom="agent" taille={15} /> {pending ? "Envoi…" : retouche ? "Retoucher l'image" : "Créer l'image"}
            </button>
            <span className="aide">
              <span className="kbd">Ctrl</span>+<span className="kbd">Entrée</span>
            </span>
            <span className="aide compte num">
              {nbEssais} / {CANDIDATS_GARDES} essais gardés
            </span>
          </div>
        </section>

        {/* ---- The attempt log ---- */}
        <aside className="journal" aria-label="Journal d'essais">
          <div className="j-tete">
            <h3>Journal d&rsquo;essais</h3>
            <span className="num">
              {nbEssais} / {CANDIDATS_GARDES}
            </span>
          </div>
          <div className="j-liste" ref={liste} role="listbox" aria-label="Image actuelle et essais, du plus récent au plus ancien">
            {imageSrc ? (
              <button type="button" role="option" aria-selected={regarde === "actuelle"} data-courant={regarde === "actuelle"} className={`j-item arrive${regarde === "actuelle" ? " on" : ""}`} style={{ "--i": 0 } as React.CSSProperties} onClick={() => setSelection("actuelle")}>
                <span className="vign">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlMiniature(imageSrc, 192)} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="j-m">
                  <span className="j-l1">
                    <span className={`drap ${valide ? "or" : "neutre"}`}>{valide ? "validée" : "actuelle"}</span>
                  </span>
                  <span className="j-txt titre">Image de l&rsquo;asset</span>
                </span>
              </button>
            ) : null}
            {nbEssais > 0 ? <div className="j-sep">Essais · du plus récent</div> : <p className="j-vide">{imageSrc ? "Aucun essai pour l'instant." : "Le premier essai apparaîtra ici, avec sa consigne."}</p>}
            {essais.map((e, i) => {
              const on = regarde !== "actuelle" && regarde?.uuid === e.uuid;
              const vignette = e.src ?? e.apercuSrc ?? e.baseSrc;
              const p = pourcent(e);
              return (
                <button
                  key={e.uuid}
                  type="button"
                  role="option"
                  aria-selected={on}
                  data-courant={on}
                  className={`j-item arrive${on ? " on" : ""}`}
                  style={{ "--i": i + 1 } as React.CSSProperties}
                  onClick={() => setSelection(e.uuid)}
                >
                  <span className={`vign${e.statut === "termine" ? "" : e.statut === "echoue" || e.statut === "annulee" ? " echec" : " run flou"}${vignette ? "" : " vide"}`}>
                    {vignette ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.src ? urlMiniature(e.src, 192) : vignette} alt="" loading="lazy" decoding="async" />
                    ) : null}
                    {estActif(e) ? (
                      <span className="mini-p">
                        <b style={{ "--p": `${p}%` } as React.CSSProperties} />
                      </span>
                    ) : null}
                  </span>
                  <span className="j-m">
                    <span className="j-l1">
                      <span className="num">n°{numeros.get(e.uuid)}</span>
                      {retenu(e) ? (
                        <span className="drap or">retenu</span>
                      ) : e.statut === STATUT_TRADUCTION ? (
                        <span className="drap rouge">traduction</span>
                      ) : e.statut === "en_attente" ? (
                        <span className="drap rouge">en file</span>
                      ) : e.statut === "en_cours" ? (
                        <span className="drap rouge">en cours</span>
                      ) : e.statut === "echoue" ? (
                        <span className="drap echec">échoué</span>
                      ) : e.statut === "annulee" ? (
                        <span className="drap neutre">annulé</span>
                      ) : null}
                      <span className="quand" suppressHydrationWarning>
                        {ilYa(e.createdAt)}
                      </span>
                    </span>
                    <span className="j-txt">{e.consigne ? e.consigne : e.methode === "edition" ? "retouche" : "création depuis la description"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="j-pied">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> pour passer d&rsquo;un essai à l&rsquo;autre
          </div>
        </aside>
      </div>

      <dialog
        ref={dialogue}
        className="zoom-dialog"
        onClose={() => setZoom(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setZoom(null);
        }}
      >
        <button type="button" className="btn btn-fant btn-sm fermer" onClick={() => setZoom(null)}>
          <Icone nom="fermer" taille={14} /> Fermer
        </button>
        {zoom ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={zoom} alt={libelle} onClick={() => setZoom(null)} />
        ) : null}
      </dialog>
    </div>
  );
}

/** The veil of an attempt in progress: three steps (translation, queue, generation), the last one with its progress. */
function Travail({ essai, numero }: { essai: GenerationVue; numero: number }) {
  const etapes = [
    [STATUT_TRADUCTION, "Traduction"],
    ["en_attente", "File d'attente"],
    ["en_cours", "Génération"],
  ] as const;
  const idx = etapes.findIndex((x) => x[0] === essai.statut);
  const p = pourcent(essai);
  const msg =
    essai.statut === STATUT_TRADUCTION
      ? "L'agent traduit ta consigne en prompt…"
      : essai.statut === "en_attente"
        ? "En file d'attente…"
        : `Génération en cours${essai.progression?.etape ? ` · ${essai.progression.etape}` : ""} · ${p} %`;
  return (
    <div className="travail" role="status">
      <div className="msg">
        <span className="num">n°{numero}</span>
        <span>{msg}</span>
      </div>
      <div className="etapes">
        {etapes.map((e, i) => (
          <div key={e[0]} className={`etape${i < idx ? " fait" : i === idx ? ` actif${e[0] === "en_cours" && essai.progression ? "" : " indet"}` : ""}`}>
            <i>
              <b style={e[0] === "en_cours" ? ({ "--p": `${p}%` } as React.CSSProperties) : undefined} />
            </i>
            {e[1]}
          </div>
        ))}
      </div>
    </div>
  );
}
