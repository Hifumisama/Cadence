"use client";

import {
  AIDE_CREATIVITE,
  CREATIVITES,
  DETAIL_STYLE_CAMERA,
  LIBELLE_CREATIVITE,
  LIBELLE_NIVEAU,
  STYLE_AUCUN,
  estStyleCamera,
  libelleStyleComplet,
  type ReglagesResolus,
} from "@/lib/h3ir/reglages";
import { STYLES_CAMERA } from "@/lib/h3ir/styles-camera";

/** Les deux réglages d'Open H3 IR d'un niveau (projet, scène ou plan) : la créativité et le style de mise en scène. Vide = hérite du niveau au-dessus ; l'option vide dit ce qu'il
 * donnerait (`heritage` : ce que ce niveau recevrait s'il ne réglait rien, avec le niveau d'où cela vient). Pour le style, « Aucun style » est un choix à part entière :
 * il force l'absence de style par-dessus un style défini plus haut. Ces réglages ne servent qu'aux fiches compilées par Open H3 IR. */
export function ChampsReglagesCamera({
  creativite,
  styleCamera,
  onCreativite,
  onStyleCamera,
  heritage,
  idPrefixe,
}: {
  creativite: string;
  styleCamera: string;
  onCreativite: (v: string) => void;
  onStyleCamera: (v: string) => void;
  heritage: ReglagesResolus;
  idPrefixe: string;
}) {
  const heriteCreativite = `Hérite : ${LIBELLE_CREATIVITE[heritage.creativite]} (${LIBELLE_NIVEAU[heritage.origine.creativite]})`;
  const heriteStyle = `Hérite : ${heritage.styleCamera ? libelleStyleComplet(heritage.styleCamera) : "aucun style"} (${LIBELLE_NIVEAU[heritage.origine.styleCamera]})`;
  const creativiteChoisie = (CREATIVITES as readonly string[]).includes(creativite) ? creativite : "";
  const styleChoisi = (STYLES_CAMERA as readonly string[]).includes(styleCamera) || styleCamera === STYLE_AUCUN ? styleCamera : "";
  // Ce que le style affiché fait : celui qu'on choisit, ou celui dont on hérite quand le menu est vide.
  const styleVu = estStyleCamera(styleChoisi) ? styleChoisi : styleChoisi === "" ? heritage.styleCamera : null;
  return (
    <>
      <div className="field-group">
        <label htmlFor={`${idPrefixe}-creativite`}>Créativité</label>
        <select id={`${idPrefixe}-creativite`} className="field" value={creativiteChoisie} onChange={(e) => onCreativite(e.target.value)}>
          <option value="">{heriteCreativite}</option>
          {CREATIVITES.map((c) => (
            <option key={c} value={c}>
              {LIBELLE_CREATIVITE[c]} — {AIDE_CREATIVITE[c]}
            </option>
          ))}
        </select>
        <span className="tiny-note">Jusqu&rsquo;où Open H3 IR peut ajouter à ce que tu as écrit (caméra, lumière, musique).</span>
      </div>
      <div className="field-group">
        <label htmlFor={`${idPrefixe}-style-camera`}>Style de mise en scène</label>
        <select id={`${idPrefixe}-style-camera`} className="field" value={styleChoisi} onChange={(e) => onStyleCamera(e.target.value)}>
          <option value="">{heriteStyle}</option>
          <option value={STYLE_AUCUN}>Aucun style</option>
          {STYLES_CAMERA.map((s) => (
            <option key={s} value={s}>
              {libelleStyleComplet(s)}
            </option>
          ))}
        </select>
        <span className="tiny-note">
          {styleVu
            ? DETAIL_STYLE_CAMERA[styleVu]
            : "Une manière de mettre en scène (caméra, cadrage, lumière, jeu, musique) qui ne remplit que ce que ta description et tes images ne précisent pas."}
        </span>
      </div>
    </>
  );
}
