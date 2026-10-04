"use client";

import { useState } from "react";
import { genererInventaire } from "@/app/agents/actions";
import type { ContexteEtape } from "@/components/agents/contexte";

/** « Inventaire des assets » : l'étape entre le registre issu du brief et les fiches de plan. UN appel lit tous les plans
 * des scénarios, le registre et le brief, et propose en une liste consolidée les assets qui manquent (accessoires, états
 * d'un décor, effets). Les fiches s'appuient ensuite sur ce registre au lieu d'inventer chacune ses assets : c'est ce qui
 * évite les doublons. Tu relis la liste avant qu'elle soit écrite ; les prompts d'image s'écrivent à l'étape suivante. */
export function ChoixInventaire({ ctx, titre }: { ctx: ContexteEtape; titre?: string }) {
  const { conv, occupe } = ctx;
  const [consigne, setConsigne] = useState("");
  const lancer = () => void ctx.lancer(() => genererInventaire(conv.uuid, { consigne: consigne.trim() || undefined }));

  return (
    <div className="ag-etape-corps ag-eps">
      <div>
        <h3 className="ag-eps-titre">{titre ?? "Faire l'inventaire des assets"}</h3>
        <p className="tiny-note">
          L&rsquo;agent lit tous les plans et le registre, puis liste ce qui manque (accessoires, états d&rsquo;un décor, effets) <em>avant</em> les fiches : chaque fiche réutilise alors le même asset au lieu d&rsquo;en inventer un
          de plus. Il n&rsquo;ajoute que ce que le registre n&rsquo;a pas ; tu relis la liste avant qu&rsquo;elle soit écrite.
        </p>
      </div>
      <div className="gd-grp">
        <label className="gd-lbl" htmlFor="ag-inventaire-consigne">
          Une consigne (facultatif)
        </label>
        <textarea
          id="ag-inventaire-consigne"
          className="field"
          rows={2}
          value={consigne}
          onChange={(e) => setConsigne(e.target.value)}
          placeholder="Ex. Reste sobre : seulement les accessoires qui portent l'histoire."
          disabled={occupe}
        />
      </div>
      <div className="ag-lancer">
        <span className="tiny-note ag-estimation" role="status">
          Un seul appel pour tout le projet.
        </span>
        <button type="button" className="btn btn-gold" onClick={lancer} disabled={occupe}>
          {occupe ? "…" : "Faire l'inventaire"}
        </button>
      </div>
    </div>
  );
}
