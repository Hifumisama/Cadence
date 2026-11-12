"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { modifierReglagesCameraProjet } from "@/app/projects/actions";
import { ChampsReglagesCamera } from "@/components/h3ir/CameraSettingsFields";
import type { DemoDispo } from "@/lib/h3ir/demos";
import { resoudreReglages } from "@/lib/h3ir/settings";

/** The project's staging and creativity: the most general setting of Open H3 IR, for all the sheets it compiles. Each scene, then each clip, can override it
 * (« Modifier » on the scene, « Modifier » on the clip). Empty = the default setting (balanced creativity, no staging style). */
export function ReglagesCameraProjet({ projectId, creativite, styleCamera, demos }: { projectId: number; creativite: string | null; styleCamera: string | null; /** The staging demo videos (lib/media.ts, `demosMiseEnScene`). */ demos?: Record<string, DemoDispo> }) {
  const router = useRouter();
  const [c, setC] = useState(creativite ?? "");
  const [s, setS] = useState(styleCamera ?? "");
  const [pending, startTransition] = useTransition();
  const [enregistre, setEnregistre] = useState(false);
  const modifie = c !== (creativite ?? "") || s !== (styleCamera ?? "");

  const enregistrer = () =>
    startTransition(async () => {
      await modifierReglagesCameraProjet(projectId, { creativite: c || null, styleCamera: s || null });
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 1500);
      router.refresh();
    });

  return (
    <section className="panel" id="bf-camera" aria-labelledby="bf-t-camera" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <h2 id="bf-t-camera">Mise en scène et créativité</h2>
        <span className="eyebrow">Fiches compilées par Open H3 IR</span>
      </div>
      <div className="panel-bd form-grid">
        <ChampsReglagesCamera creativite={c} styleCamera={s} onCreativite={setC} onStyleCamera={setS} heritage={resoudreReglages({})} idPrefixe="projet" demos={demos} />
        <p className="tiny-note wide">
          Valables pour tout le film. Une scène (« Modifier ») ou un plan (« Modifier » sur sa page) peut régler autre chose, ou choisir « Aucun style ». Sans effet sur les fiches écrites par l&rsquo;ancien moteur.
        </p>
        <div className="form-actions wide">
          <button type="button" className="btn btn-gold" onClick={enregistrer} disabled={pending || !modifie}>
            {pending ? "Enregistrement…" : enregistre ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      </div>
    </section>
  );
}
