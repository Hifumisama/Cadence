"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { supprimerGeneration } from "@/app/assets/generation-actions";
import { appliquerRetouche, deposerVideoTest, enregistrerVerdict, lancerTestVideo, proposerRetouche, retenirEssaiTest } from "@/app/voix/actions";
import { METHODE_TEST_VIDEO } from "@/lib/asset-generation";
import { differenceMots, memeTexte } from "@/lib/diff-mots";
import type { GenerationVue } from "@/lib/queries-generations";
import { LIBELLE_VERDICT, dureeVideoPourAudio, promptTestVoix, type EssaiVoix, type VerdictVoix } from "@/lib/voix";
import { useAssistantVoix } from "./AssistantVoix";
import { CopierBouton } from "./CopierBouton";
import { useGenerationsVoix } from "./useGenerationsVoix";

type Option = { id: number; code: string; description: string | null };
type Decor = Option & { src: string | null };

const METHODES: string[] = [METHODE_TEST_VIDEO];
const estActif = (g: { statut: string }) => g.statut === "en_attente" || g.statut === "en_cours";
const court = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** Ce qui peut ne pas aller, en un mot : l'IA les lit pour retoucher l'instruction. */
const REMARQUES = ["Plus grave", "Plus aigu", "Plus lent", "Plus rapide", "Plus chaleureux", "Plus froid", "Plus jeune", "Plus âgé", "Trop robotique", "Trop théâtral"];

/** Scène 5 — « Et en situation ? » La zone d'aperçu est la scène : le DÉCOR choisi s'y affiche en fond, la vidéo de test par-dessus ; quand
 * il n'y a rien à voir, un grand bouton lance le test (ou on glisse une vidéo faite ailleurs sur la zone). À côté, la liste des
 * TENTATIVES, petite : un clic sur l'une la rejoue dans la zone, ce qui permet d'essayer plusieurs répliques avant de juger. Les
 * tentatives sont TEMPORAIRES (elles partent dès que le timbre est retouché, repris ou que la voix de référence change) ; une seule se
 * garde, la « référence ressenti » (★). Puis le verdict : « C'est bon » valide la voix, « À ajuster » ouvre la retouche (l'IA modifie
 * l'instruction d'après ce qui ne va pas et d'après le journal des essais ; rien ne se lance sans accord), « À refaire » ramène au
 * timbre. Une voix fournie n'a pas de texte à réécrire : la scène propose d'autres pistes. */
export function SceneRessenti({
  assetId,
  nomVoix,
  instruction,
  referenceFichier,
  referenceSrc,
  statut,
  decors,
  personnages,
  initial,
  refText,
  testVideoSrc,
  testVideoNom,
  generations,
  generationInitiale,
  simule,
  essais,
  langue,
  referenceDuree,
}: {
  /** Langue de la voix (nom du moteur) : la balise de langue du prompt vidéo la suit. */
  langue: string;
  /** Durée mesurée de la voix de référence (null = format non mesurable) : la vidéo du test sur la réplique d'écoute est calée dessus. */
  referenceDuree: number | null;
  assetId: number;
  nomVoix: string;
  instruction: string;
  referenceFichier: string | null;
  referenceSrc: string | null;
  statut: string;
  decors: Decor[];
  personnages: Option[];
  /** `texte` : le texte de la référence ressenti, ou celui du dernier test écrit sur la fiche (vide = on suit la réplique d'écoute). */
  initial: { decorId: number | null; personnageId: number | null; texte: string };
  refText: string;
  testVideoSrc: string | null;
  testVideoNom: string | null;
  generations: GenerationVue[];
  generationInitiale: string | null;
  simule: boolean;
  essais: EssaiVoix[];
}) {
  const router = useRouter();
  const { aller, source } = useAssistantVoix();
  const { vivantes, annuler } = useGenerationsVoix({ assetId, generations, generationInitiale, methodes: METHODES, etape: "ressenti" });

  const [decorId, setDecorId] = useState<number | null>(initial.decorId);
  const [personnageId, setPersonnageId] = useState<number | null>(initial.personnageId);
  // null = le champ suit la réplique d'écoute ; dès qu'on écrit autre chose, le texte est libre.
  const [texteLibre, setTexteLibre] = useState<string | null>(initial.texte.trim() && initial.texte.trim() !== refText.trim() ? initial.texte : null);
  const dernier = essais[essais.length - 1] ?? null;
  const [verdict, setVerdict] = useState<VerdictVoix | null>(statut === "valide" ? "ok" : (dernier?.verdict ?? null));
  // La voix peut repasser « à valider » ailleurs (une nouvelle référence gardée) : « C'est bon » ne reste pas affiché pour autant.
  useEffect(() => {
    setVerdict((v) => (statut === "valide" ? "ok" : v === "ok" ? null : v));
  }, [statut]);
  const [remarques, setRemarques] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [proposition, setProposition] = useState<{ instruction: string; resume: string } | null>(null);
  const [tirage, setTirage] = useState<"meme" | "nouveau">("meme");
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [survol, setSurvol] = useState(false);
  const [lancement, startLancement] = useTransition();
  const [pending, startTransition] = useTransition();
  const [reflexion, startReflexion] = useTransition();

  const texte = texteLibre ?? refText;
  const decor = decors.find((d) => d.id === decorId) ?? null;
  const perso = personnages.find((p) => p.id === personnageId) ?? null;
  // La vidéo dure autant que l'AUDIO. Sur la réplique d'écoute, c'est la voix de référence elle-même (durée connue) ; sur un autre texte, la
  // voix le dit d'abord (un audio de test) et la vidéo est calée dessus une fois l'audio produit.
  const texteIdentique = texte.replace(/\s+/g, " ").trim() === refText.replace(/\s+/g, " ").trim();
  const duree = texteIdentique && referenceDuree != null ? dureeVideoPourAudio(referenceDuree) : null;
  const tropLong = duree != null && !duree.ok;
  const prompt = useMemo(
    () => promptTestVoix({ texte, personnage: perso, decor, avecAudio: referenceSrc != null, langue, dureeSecondes: duree?.ok ? duree.duree : undefined }),
    [texte, perso, decor, referenceSrc, langue, duree],
  );
  const sansReference = referenceSrc == null;
  const fournie = source === "reference";

  // — Les tentatives : la référence ressenti d'abord, puis les essais du plus récent au plus ancien. —
  const actifs = vivantes.filter(estActif);
  const prets = vivantes.filter((g) => g.statut === "termine" && g.src);
  const autres = vivantes.filter((g) => !estActif(g) && !(g.statut === "termine" && g.src));
  const [selection, setSelection] = useState<"ref" | number | null>(null);
  const choix = selection ?? (testVideoSrc ? "ref" : (prets[0]?.id ?? null));
  const videoSrc = choix === "ref" ? testVideoSrc : choix != null ? (vivantes.find((g) => g.id === choix)?.src ?? null) : null;
  // Une tentative qui vient de finir se montre toute seule dans la zone.
  const plusRecente = useRef(prets[0]?.id ?? null);
  const idPlusRecente = prets[0]?.id ?? null;
  useEffect(() => {
    if (idPlusRecente != null && idPlusRecente !== plusRecente.current) setSelection(idPlusRecente);
    plusRecente.current = idPlusRecente;
  }, [idPlusRecente]);
  const premierActif = actifs[0] ?? null;
  const zoneVide = videoSrc == null && premierActif == null;

  const lancer = () =>
    startLancement(async () => {
      const r = await lancerTestVideo(assetId, { decorId, personnageId, texte }, { avecReference: true });
      setRetour(r.ok ? { ok: true, texte: r.position > 1 ? `Test ajouté à la file, position ${r.position}. Tu peux quitter la page : le suivi est dans l’icône du bandeau.` : "Test lancé. Tu peux quitter la page : le suivi est dans l’icône du bandeau." } : { ok: false, texte: r.erreur });
    });

  const garder = (id: number) =>
    startTransition(async () => {
      const r = await retenirEssaiTest(id);
      setRetour(r.ok ? { ok: true, texte: "Gardée comme référence ressenti : elle remplace la précédente." } : { ok: false, texte: r.erreur });
      if (r.ok) {
        setSelection("ref");
        router.refresh();
      }
    });

  const retirer = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
      if (r.ok) {
        if (choix === id) setSelection(null);
        router.refresh();
      }
    });

  const deposer = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) return setRetour({ ok: false, texte: "Dépose une vidéo (MP4, WebM ou MOV)." });
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("fichier", f);
        await deposerVideoTest(assetId, fd);
        setSelection("ref");
        setRetour({ ok: true, texte: "Vidéo déposée : c’est la nouvelle référence ressenti." });
        router.refresh();
      } catch (e) {
        setRetour({ ok: false, texte: e instanceof Error ? e.message : "Échec du dépôt." });
      }
    });
  };

  const rendre = (v: VerdictVoix) =>
    startTransition(async () => {
      const r = await enregistrerVerdict(assetId, v);
      if (!r.ok) return setRetour({ ok: false, texte: r.erreur });
      setVerdict(v);
      setProposition(null);
      router.refresh();
      if (v === "ok") setRetour({ ok: true, texte: `${nomVoix} est validée. Les répliques peuvent être produites.` });
      else if (v === "refaire") {
        setRetour(null);
        setSelection(null);
        aller("voix");
      } else setRetour(null);
    });

  const demanderRetouche = () =>
    startReflexion(async () => {
      setRetour(null);
      const r = await proposerRetouche(assetId, { remarques, note, instruction });
      if (r.ok) {
        if (memeTexte(r.instruction, instruction)) setRetour({ ok: false, texte: "L’IA n’a rien changé : précise ce qui ne va pas, ou modifie l’instruction à la main." });
        else setProposition({ instruction: r.instruction, resume: r.resume });
      } else setRetour({ ok: false, texte: r.erreur });
    });

  const appliquer = () => {
    if (!proposition) return;
    startTransition(async () => {
      const r = await appliquerRetouche(assetId, { instruction: proposition.instruction, tirage, remarques, note });
      if (!r.ok) return setRetour({ ok: false, texte: r.erreur });
      setProposition(null);
      setVerdict(null);
      setRemarques([]);
      setNote("");
      setSelection(null);
      router.refresh();
      aller("reference");
    });
  };

  const segments = proposition ? differenceMots(instruction, proposition.instruction) : [];
  const numero = (id: number) => vivantes.length - vivantes.findIndex((g) => g.id === id);

  return (
    <>
      <p className="cn-acte">Scène 5 · Ressenti</p>
      <h2 className="cn-titre">
        Et <em>en situation</em> ?
      </h2>
      <p className="cn-sous">Mets la voix sur un visage, puis dis ce que ça donne. Si elle plaît les yeux fermés mais gêne à l&rsquo;image, c&rsquo;est l&rsquo;âge perçu ou l&rsquo;énergie, pas le timbre.</p>

      <div className="av-ressenti">
        <div>
          <div
            className={`av-ecran${survol ? " is-survol" : ""}`}
            aria-label="Aperçu du test vidéo"
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              deposer(e.dataTransfer.files[0]);
            }}
          >
            {decor?.src ? <img className="av-ecran-decor" src={decor.src} alt={`Décor : ${decor.code}`} /> : null}
            {videoSrc ? <video key={videoSrc} controls src={videoSrc} /> : null}
            {zoneVide ? (
              <div className="av-ecran-centre">
                {sansReference ? (
                  <>
                    <p>Il faut d&rsquo;abord une voix de référence.</p>
                    <button type="button" className="btn btn-primary" onClick={() => aller("reference")}>
                      Créer la voix d&rsquo;abord
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary av-gros-bouton" onClick={lancer} disabled={lancement || !texte.trim() || tropLong}>
                      {lancement ? "…" : "Lancer le test vidéo"}
                    </button>
                    <small>ou glisse ici une vidéo faite ailleurs</small>
                  </>
                )}
              </div>
            ) : null}
            {videoSrc == null && premierActif ? (
              <div className="av-ecran-centre">
                <p>{premierActif.statut === "en_attente" ? `Test en file${premierActif.position ? ` · n°${premierActif.position}` : ""}` : (premierActif.progression?.etape ?? "Test en cours…")}</p>
                {premierActif.progression ? <progress className="gd-bar" value={premierActif.progression.valeur} max={premierActif.progression.max} aria-label="Progression" /> : <progress className="gd-bar" aria-label="Test en cours" />}
                <small>Cela prend plusieurs minutes. Tu peux quitter la page.</small>
              </div>
            ) : null}
            {decor ? <span className="av-ecran-decor-nom">Décor · {decor.code}</span> : null}
            {survol ? <div className="av-ecran-depot">Dépose la vidéo : elle devient la référence ressenti</div> : null}
          </div>

          <div className="av-lancer">
            <label className="cn-note" htmlFor="av-decor" style={{ margin: 0 }}>
              Décor
            </label>
            <select id="av-decor" value={decorId ?? ""} onChange={(e) => setDecorId(e.target.value ? Number(e.target.value) : null)} disabled={sansReference}>
              <option value="">Fond neutre</option>
              {decors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                  {d.src ? "" : " (sans image)"}
                </option>
              ))}
            </select>
            <label className="cn-note" htmlFor="av-perso" style={{ margin: 0 }}>
              Personnage
            </label>
            <select id="av-perso" value={personnageId ?? ""} onChange={(e) => setPersonnageId(e.target.value ? Number(e.target.value) : null)} disabled={sansReference}>
              <option value="">Générique</option>
              {personnages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
            {!zoneVide ? (
              <button type="button" className="btn btn-primary" onClick={lancer} disabled={lancement || sansReference || !texte.trim() || tropLong} style={{ marginLeft: "auto" }}>
                {lancement ? "…" : "Lancer un nouveau test"}
              </button>
            ) : null}
          </div>
          <label htmlFor="av-texte-test" className="cn-sr-seul">
            Réplique à tester
          </label>
          <textarea
            id="av-texte-test"
            className="av-texte-test"
            rows={2}
            value={texte}
            onChange={(e) => setTexteLibre(e.target.value)}
            disabled={sansReference}
            placeholder="Une réplique hors épisode : on ne teste jamais avec une ligne du découpage."
          />
          <p className="cn-note">
            {texteLibre != null ? (
              <>
                Texte libre.{" "}
                <button type="button" className="cn-lien" onClick={() => setTexteLibre(null)}>
                  Reprendre la réplique d&rsquo;écoute
                </button>
              </>
            ) : (
              "La réplique testée est la réplique d’écoute ; écris autre chose pour juger la voix sur un autre texte."
            )}{" "}
            Aperçu seulement : le rendu final se fait dans la fiche de plan.
            {simule ? " Mode simulé : la vidéo est un fichier factice." : ""}
          </p>
          {tropLong && duree && !duree.ok ? (
            <p className="av-retour is-erreur" role="alert">
              {duree.erreur} La voix de référence lit toute la réplique d&rsquo;écoute : écris un texte plus court ci-dessus, la voix le dira d&rsquo;abord.
            </p>
          ) : !sansReference ? (
            <p className="cn-note">
              {texteIdentique && duree?.ok
                ? `La vidéo dure ${duree.duree} s : la voix de référence (${String(Math.round((referenceDuree ?? 0) * 10) / 10).replace(".", ",")} s) plus une seconde de silence.`
                : texteIdentique
                  ? "La vidéo est calée sur la durée de l’audio."
                  : "Ce texte n’est pas la réplique d’écoute : la voix le dira d’abord (un audio de test), puis la vidéo est calée sur sa durée. Compte quelques minutes de plus."}
            </p>
          ) : null}
          <details className="av-details" style={{ marginTop: 8 }}>
            <summary>Prompt vidéo du test</summary>
            <div className="av-actions" style={{ marginTop: 10 }}>
              <span className="cn-note" style={{ margin: 0 }}>Composé depuis le décor, le personnage et la réplique ci-dessus.</span>
              <CopierBouton texte={prompt} />
            </div>
            <pre className="test-prompt-txt num">{prompt}</pre>
          </details>
        </div>

        <aside className="av-essais" aria-label="Tentatives">
          <p className="av-bloc-titre" style={{ marginTop: 0 }}>
            Tentatives
          </p>
          <ul>
            {testVideoSrc || testVideoNom ? (
              <li className={`av-essai is-ref${choix === "ref" ? " is-choisi" : ""}`}>
                <button type="button" className="av-essai-btn" onClick={() => setSelection("ref")} disabled={!testVideoSrc} aria-pressed={choix === "ref"}>
                  <b>★ Référence ressenti</b>
                  <span>{initial.texte.trim() ? court(initial.texte.trim(), 60) : (testVideoSrc ? "Vidéo gardée" : "Rendu introuvable sur le stockage")}</span>
                </button>
              </li>
            ) : null}
            {actifs.map((g) => (
              <li key={g.id} className="av-essai">
                <div className="av-essai-btn">
                  <b>Test {g.statut === "en_cours" ? "en cours" : `en file${g.position ? ` · n°${g.position}` : ""}`}</b>
                  <span>{g.texteReference ? court(g.texteReference, 60) : "—"}</span>
                  {g.progression ? <progress className="gd-bar" value={g.progression.valeur} max={g.progression.max} aria-label="Progression" /> : null}
                </div>
                <div className="av-essai-actions">
                  <button type="button" className="btn btn-ghost btn-mini" onClick={() => annuler(g)} disabled={g.annulationDemandee}>
                    {g.annulationDemandee ? "Annulation…" : g.statut === "en_cours" ? "Annuler" : "Retirer de la file"}
                  </button>
                </div>
              </li>
            ))}
            {prets.map((g) => (
              <li key={g.id} className={`av-essai${choix === g.id ? " is-choisi" : ""}`}>
                <button type="button" className="av-essai-btn" onClick={() => setSelection(g.id)} aria-pressed={choix === g.id}>
                  <b>Tentative {numero(g.id)}</b>
                  <span>{g.texteReference ? court(g.texteReference, 60) : "Réplique non notée"}</span>
                </button>
                <div className="av-essai-actions">
                  <button type="button" className="btn btn-ghost btn-mini" onClick={() => garder(g.id)} disabled={pending} title="La garder comme référence ressenti : elle remplace la précédente">
                    ★ Garder
                  </button>
                  <button type="button" className="btn btn-ghost btn-mini" onClick={() => retirer(g.id)} disabled={pending} aria-label={`Retirer la tentative ${numero(g.id)}`}>
                    ✕
                  </button>
                </div>
              </li>
            ))}
            {autres.map((g) => (
              <li key={g.id} className="av-essai is-echec">
                <div className="av-essai-btn">
                  <b>{g.statut === "annulee" ? "Annulée" : "Échouée"}</b>
                  <span>{g.erreur ? court(g.erreur, 90) : "Sans message."}</span>
                </div>
                <div className="av-essai-actions">
                  <button type="button" className="btn btn-ghost btn-mini" onClick={() => retirer(g.id)} disabled={pending}>
                    Retirer
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {!testVideoSrc && vivantes.length === 0 ? <p className="cn-note">Chaque test lancé apparaît ici. Clique sur l&rsquo;un pour le revoir et essaie d&rsquo;autres répliques avant de juger.</p> : null}
          <p className="cn-note">
            Les tentatives sont <b>temporaires</b> : elles disparaissent si le timbre est retouché ou repris. Seule la ★ référence ressenti se garde.
          </p>
        </aside>
      </div>

      <div className="av-verdicts" role="group" aria-label="Verdict sur la voix">
        <button type="button" className="av-verdict" aria-pressed={verdict === "ok"} disabled={pending || sansReference} onClick={() => rendre("ok")}>
          <b>C&rsquo;est bon</b>
          <span>Je valide la voix.</span>
        </button>
        <button type="button" className="av-verdict" aria-pressed={verdict === "ajuster"} disabled={pending || sansReference} onClick={() => rendre("ajuster")}>
          <b>À ajuster</b>
          <span>Presque, mais…</span>
        </button>
        <button type="button" className="av-verdict" aria-pressed={verdict === "refaire"} disabled={pending || sansReference} onClick={() => rendre("refaire")}>
          <b>À refaire</b>
          <span>Je repars du timbre.</span>
        </button>
      </div>

      {verdict === "ajuster" ? (
        <div className="av-retouche">
          {fournie ? (
            <p className="av-alerte" style={{ margin: 0 }}>
              <b>Voix fournie</b> : il n&rsquo;y a pas de description à réécrire. Essaie une autre fenêtre de la source, un nettoyage plus poussé, ou une autre source.{" "}
              <button type="button" className="cn-lien" onClick={() => aller("voix")}>
                Revoir la source
              </button>
            </p>
          ) : (
            <>
              <p className="av-q" style={{ marginTop: 0 }}>Qu&rsquo;est-ce qui ne va pas ?</p>
              <div className="av-puces" role="group" aria-label="Ce qui ne va pas">
                {REMARQUES.map((m) => (
                  <button key={m} type="button" className="cn-puce" aria-pressed={remarques.includes(m)} onClick={() => setRemarques((r) => (r.includes(m) ? r.filter((x) => x !== m) : [...r, m]))}>
                    {m}
                  </button>
                ))}
              </div>
              <label htmlFor="av-note" className="av-q">
                Et en une phrase, si tu veux
              </label>
              <input id="av-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Elle sonne comme une présentatrice. Je la veux plus intime." maxLength={400} />
              <button type="button" className="btn btn-primary" onClick={demanderRetouche} disabled={reflexion || (remarques.length === 0 && !note.trim())}>
                {reflexion ? "L’IA réfléchit…" : "Proposer une retouche"}
              </button>

              {proposition ? (
                <>
                  <p className="av-q">{proposition.resume ? `Retouche proposée : ${proposition.resume}` : "Retouche proposée"}</p>
                  <p className="av-diff" aria-label="Différence avec l'instruction actuelle">
                    {segments.map((s, i) =>
                      s.type === "meme" ? <span key={i}>{s.texte} </span> : s.type === "retire" ? <del key={i}>{s.texte} </del> : <ins key={i}>{s.texte} </ins>,
                    )}
                  </p>
                  <div className="av-puces" role="group" aria-label="Tirage de la retouche">
                    <button type="button" className="cn-puce" aria-pressed={tirage === "meme"} onClick={() => setTirage("meme")}>
                      Même tirage
                    </button>
                    <button type="button" className="cn-puce" aria-pressed={tirage === "nouveau"} onClick={() => setTirage("nouveau")}>
                      Nouveau tirage
                    </button>
                    <span className="cn-note" style={{ margin: 0 }}>Le même tirage isole l’effet du texte.</span>
                  </div>
                  <div className="av-actions" style={{ marginTop: 14 }}>
                    <button type="button" className="btn btn-primary" onClick={appliquer} disabled={pending}>
                      Appliquer et régénérer
                    </button>
                    <button type="button" className="btn" onClick={() => aller("voix")}>
                      Modifier moi-même
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setProposition(null)}>
                      Pas celle-là
                    </button>
                  </div>
                  <p className="cn-note">
                    La nouvelle voix arrive à la scène « Référence » comme une prise à garder ; l’adopter regénère les répliques, avec confirmation.
                    Appliquer efface les tentatives de test (la ★ référence ressenti reste, refaite avec la nouvelle voix).
                  </p>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {retour ? (
        <p className={`av-retour ${retour.ok ? "is-ok" : "is-erreur"}`} role={retour.ok ? "status" : "alert"}>
          {retour.texte}
        </p>
      ) : null}

      {essais.length > 0 ? (
        <div className="av-pelli" aria-label="Journal des essais de timbre">
          {essais.map((e, i) => (
            <div key={e.n} className={`av-im${i === essais.length - 1 ? " is-courant" : ""}`} title={e.instruction}>
              <b>Essai {e.n}</b>
              <span className="av-pill">{e.instruction.length > 70 ? `${e.instruction.slice(0, 70)}…` : e.instruction || "—"}</span>
              <span className="av-pill" style={{ color: e.verdict === "ok" ? "var(--or-glow)" : undefined }}>
                {e.verdict ? LIBELLE_VERDICT[e.verdict] : "pas encore jugé"}
                {e.note ? ` · ${e.note}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
