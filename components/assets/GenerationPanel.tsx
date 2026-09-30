"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { adopterGeneration, lancerGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import {
  ASPECTS,
  LIBELLE_STATUT_GENERATION,
  MEGAPIXELS_PROPOSES,
  type Aspect,
  type StatutGeneration,
} from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";

const ACTIFS = ["en_attente", "en_cours"];

/** Génération d'images d'un asset. Chaque demande produit un CANDIDAT (jamais
 * l'image de l'asset directement) : on le regarde, on l'adopte ou on le jette.
 * La page se rafraîchit toute seule tant qu'une demande est active. */
export function GenerationPanel({
  assetId,
  raisonBloquee,
  defauts,
  generations,
  simule,
}: {
  assetId: number;
  raisonBloquee: string | null;
  defauts: { aspect: Aspect; megapixels: number; lora: boolean };
  generations: GenerationVue[];
  simule: boolean;
}) {
  const router = useRouter();
  const [aspect, setAspect] = useState<Aspect>(defauts.aspect);
  const [mp, setMp] = useState(defauts.megapixels);
  const [lora, setLora] = useState(defauts.lora);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const actif = generations.some((g) => ACTIFS.includes(g.statut));

  useEffect(() => {
    if (!actif) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [actif, router]);

  const lancer = () =>
    startTransition(async () => {
      const r = await lancerGeneration(assetId, { aspect, megapixels: mp, loraPersonnage: lora });
      setInfo(null);
      setErreur(r.ok ? null : r.erreur);
    });

  const adopter = (id: number) =>
    startTransition(async () => {
      const r = await adopterGeneration(id);
      setErreur(r.ok ? null : r.erreur);
      setInfo(r.ok ? "Image adoptée : l'asset repasse « en cours », à revalider." : null);
    });

  const supprimer = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setErreur(r.ok ? null : r.erreur);
    });

  return (
    <div className="field-group wide gen-panel">
      <label>Générer l&rsquo;image</label>
      {simule ? <p className="tiny-note">Mode simulé : les images produites sont factices (ComfyUI n&rsquo;est pas branché).</p> : null}
      <div className="gen-form">
        <select className="field" value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} aria-label="Format">
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select className="field" value={mp} onChange={(e) => setMp(Number(e.target.value))} aria-label="Mégapixels">
          {MEGAPIXELS_PROPOSES.map((m) => (
            <option key={m} value={m}>
              {m} MP
            </option>
          ))}
        </select>
        <label className="chk" title="LoRA CharacterDesign : fiche personnage à 4 vues">
          <input type="checkbox" checked={lora} onChange={(e) => setLora(e.target.checked)} />
          Fiche 4 vues
        </label>
        <button className="btn btn-gold" type="button" onClick={lancer} disabled={pending || raisonBloquee != null}>
          {pending ? "…" : "Générer"}
        </button>
      </div>
      {raisonBloquee ? <p className="tiny-note">{raisonBloquee}</p> : null}
      {erreur ? <p className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</p> : null}
      {info ? <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>{info}</p> : null}

      {generations.length > 0 ? (
        <ul className="gen-liste">
          {generations.map((g) => (
            <li key={g.id} className={`gen-carte s-${g.statut}`}>
              <div className="gen-vignette">
                {g.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.src} alt="Candidat généré" loading="lazy" />
                ) : (
                  <span className="tiny-note">{ACTIFS.includes(g.statut) ? "…" : g.statut === "termine" ? "introuvable" : "—"}</span>
                )}
              </div>
              <div className="gen-meta">
                <span className={`rep-statut s-${g.statut === "termine" ? "validee" : g.statut}`}>
                  {LIBELLE_STATUT_GENERATION[g.statut as StatutGeneration] ?? g.statut}
                </span>
                <span className="tiny-note num">{g.aspect} · {g.megapixels} MP</span>
                {g.erreur ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }} title={g.erreur}>{g.erreur.slice(0, 90)}</span> : null}
              </div>
              <div className="rep-actions">
                {g.statut === "termine" && g.src ? (
                  <button type="button" className="btn btn-primary btn-mini" onClick={() => adopter(g.id)} disabled={pending}>
                    Utiliser
                  </button>
                ) : null}
                {g.statut !== "en_cours" ? (
                  <button type="button" className="btn btn-ghost btn-mini" onClick={() => supprimer(g.id)} disabled={pending} title="Supprimer ce candidat">
                    ×
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
