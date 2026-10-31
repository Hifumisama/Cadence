"use client";

import "./atelier-son.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { lancerEssaiSon } from "@/app/assets/essai-actions";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { DUREE_AUDIO_DEFAUT, DUREE_AUDIO_MAX, DUREE_AUDIO_MIN, LIBELLE_STATUT_GENERATION, type StatutGeneration } from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { ilYa } from "@/lib/temps-relatif";

/** L'atelier d'un son (bruitage), sur le modèle de celui des images : on décrit le son en français et on fixe sa durée, un agent traduit la consigne en
 * prompt pour le modèle audio, et chaque essai reste dans le journal (consigne, durée, prompt, lecteur). On itère en reprenant une consigne pour la
 * modifier ; l'essai qui convient s'adopte, et devient le son de l'asset. */

const ACTIFS = ["traduction", "en_attente", "en_cours"];
const estActif = (e: GenerationVue) => ACTIFS.includes(e.statut);
const pourcent = (e: GenerationVue) => (e.progression ? Math.round((e.progression.valeur / e.progression.max) * 100) : 0);

export function AtelierSon({
  assetId,
  fichierAt,
  promptActuel,
  dureeActuelle,
  description,
  essais,
  raisonBloquee,
}: {
  assetId: number;
  /** Quand le son de l'asset a été posé (ms) : l'essai « retenu » est celui qui porte la même date. */
  fichierAt: number | null;
  /** Le prompt du son actuel (écrit par l'essai adopté), vide s'il n'a pas été généré ici. */
  promptActuel: string;
  dureeActuelle: number | null;
  /** La description de l'asset : ce que dit la consigne vide. */
  description: string;
  /** Les essais audio, du plus récent au plus ancien. */
  essais: GenerationVue[];
  raisonBloquee: string | null;
}) {
  const router = useRouter();
  const [consigne, setConsigne] = useState("");
  const [duree, setDuree] = useState(String(dureeActuelle ?? DUREE_AUDIO_DEFAUT));
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const champ = useRef<HTMLTextAreaElement>(null);

  const numeros = useMemo(() => new Map([...essais].sort((a, b) => a.id - b.id).map((e, i) => [e.uuid, i + 1])), [essais]);
  const retenu = (e: GenerationVue) => e.adopteAt != null && fichierAt != null && e.adopteAt === fichierAt;

  // Tant qu'un essai travaille (traduction, file, génération), la page se relit.
  const actifs = essais.some(estActif);
  useEffect(() => {
    if (!actifs) return;
    const t = window.setInterval(() => router.refresh(), 2500);
    return () => window.clearInterval(t);
  }, [actifs, router]);

  const lancer = (texte = consigne, secondes = Number(duree)) => {
    if (pending || raisonBloquee) return;
    if (!texte.trim() && !description.trim()) {
      setRetour({ ok: false, texte: "Décris le son que tu veux (ou remplis la description de l'asset)." });
      champ.current?.focus();
      return;
    }
    startTransition(async () => {
      setRetour(null);
      const r = await lancerEssaiSon(assetId, { consigne: texte, dureeSecondes: secondes });
      if (!r.ok) {
        setRetour({ ok: false, texte: r.erreur });
        return;
      }
      setConsigne("");
      router.refresh();
    });
  };

  const adopter = (e: GenerationVue) =>
    startTransition(async () => {
      const r = await adopterGeneration(e.id);
      setRetour(r.ok ? { ok: true, texte: `Essai n°${numeros.get(e.uuid)} adopté : c'est maintenant le son de l'asset (à revalider).` } : { ok: false, texte: r.erreur });
      router.refresh();
    });

  const jeter = (e: GenerationVue) =>
    startTransition(async () => {
      const r = await supprimerGeneration(e.id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
      router.refresh();
    });

  const reprendre = (e: GenerationVue) => {
    setConsigne(e.consigne ?? "");
    if (e.dureeSecondes != null) setDuree(String(e.dureeSecondes));
    champ.current?.focus();
  };

  const dureeNombre = Number(duree);
  const dureeOk = Number.isFinite(dureeNombre) && dureeNombre >= DUREE_AUDIO_MIN && dureeNombre <= DUREE_AUDIO_MAX;

  return (
    <div className="son">
      <section className="son-consigne" onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && !pending && dureeOk && (e.preventDefault(), lancer())}>
        <label htmlFor="son-consigne">
          <b>Quel son veut-on ?</b>
          <small>Dis-le en français. L&rsquo;agent écrit le prompt du modèle audio ; laisse vide pour partir de la description de l&rsquo;asset.</small>
        </label>
        <textarea
          id="son-consigne"
          ref={champ}
          className="field"
          rows={3}
          value={consigne}
          maxLength={2000}
          onChange={(e) => setConsigne(e.target.value)}
          placeholder={description ? `Ex. ${description}` : "Ex. une porte en bois lourde qui claque dans un couloir de pierre"}
        />
        <div className="son-ligne">
          <label className="son-duree">
            <span>Durée</span>
            <input className="field field-mono" type="number" inputMode="numeric" min={DUREE_AUDIO_MIN} max={DUREE_AUDIO_MAX} step={1} value={duree} onChange={(e) => setDuree(e.target.value)} />
            <span>s</span>
          </label>
          <button type="button" className="btn btn-gold" onClick={() => lancer()} disabled={pending || !dureeOk || raisonBloquee != null} title={raisonBloquee ?? "Ctrl + Entrée"}>
            {pending ? "Envoi…" : "Créer le son"}
          </button>
        </div>
        {!dureeOk ? (
          <p className="son-retour is-erreur" role="alert">
            La durée va de {DUREE_AUDIO_MIN} à {DUREE_AUDIO_MAX} secondes.
          </p>
        ) : null}
        {retour ? (
          <p className={`son-retour${retour.ok ? "" : " is-erreur"}`} role={retour.ok ? "status" : "alert"}>
            {retour.texte}
          </p>
        ) : null}
        {promptActuel ? (
          <details className="son-prompt">
            <summary>Prompt du son actuel{dureeActuelle != null ? ` · ${dureeActuelle} s` : ""}</summary>
            <p>{promptActuel}</p>
          </details>
        ) : null}
      </section>

      <section className="son-journal" aria-label="Essais">
        <h3>
          Essais <small>{essais.length ? `${essais.length} essai${essais.length > 1 ? "s" : ""}` : "aucun pour l'instant"}</small>
        </h3>
        {essais.length === 0 ? <p className="son-vide">Le premier essai apparaîtra ici, avec sa consigne et son lecteur.</p> : null}
        <ul>
          {essais.map((e) => (
            <li key={e.uuid} className={`son-essai${retenu(e) ? " is-retenu" : ""}`}>
              <div className="son-essai-hd">
                <span className="num">n°{numeros.get(e.uuid)}</span>
                {retenu(e) ? <span className="son-badge">Son actuel</span> : null}
                {e.dureeSecondes != null ? <span className="num son-meta">{e.dureeSecondes} s</span> : null}
                <span className="son-meta">{ilYa(e.createdAt)}</span>
              </div>
              <p className="son-essai-consigne">{e.consigne ? <q>{e.consigne}</q> : <span className="son-meta">Sans consigne : créé à partir de la description de l&rsquo;asset.</span>}</p>
              {e.statut === "termine" && e.src ? (
                <audio controls preload="none" src={e.src} />
              ) : e.statut === "echoue" || e.statut === "annulee" ? (
                <p className="son-retour is-erreur">{e.statut === "annulee" ? "Annulé." : (e.erreur ?? "L'essai a échoué.")}</p>
              ) : (
                <p className="son-attente" role="status">
                  {LIBELLE_STATUT_GENERATION[e.statut as StatutGeneration] ?? e.statut}
                  {e.statut === "en_cours" && e.progression ? ` · ${pourcent(e)} %` : "…"}
                </p>
              )}
              {e.prompt ? (
                <details className="son-prompt">
                  <summary>Voir le prompt écrit par l&rsquo;agent</summary>
                  <p>{e.prompt}</p>
                </details>
              ) : null}
              <div className="son-actions">
                {e.statut === "termine" && e.src && !retenu(e) ? (
                  <button type="button" className="btn btn-gold btn-sm" onClick={() => adopter(e)} disabled={pending}>
                    Adopter
                  </button>
                ) : null}
                {e.consigne ? (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => reprendre(e)}>
                      Reprendre la consigne
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => lancer(e.consigne ?? "", e.dureeSecondes ?? Number(duree))} disabled={pending || raisonBloquee != null}>
                      Relancer
                    </button>
                  </>
                ) : null}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jeter(e)} disabled={pending}>
                  {estActif(e) ? "Annuler" : "Supprimer"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
