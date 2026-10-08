"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { regenererApresChangementReference } from "@/app/voix/actions";
import { changementDemandeConfirmation, type ImpactReference } from "@/lib/voix";

/** Levée quand la confirmation est refusée : rien n'a été modifié. Les zones de dépôt la montrent telle quelle. */
export const MESSAGE_CHANGEMENT_ANNULE = "Changement annulé : la voix de référence n'a pas été modifiée.";

export type RetourChangement = { ok: true; message: string } | { ok: false; erreur: string; annule?: boolean };

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** Changer la voix de référence (garder une candidate, déposer, rogner un audio) alors que des répliques de la voix ont déjà une prise
 * ou que le test vidéo existe : une confirmation (dialogue modal, annulable) dit ce qui sera regénéré. À la confirmation, le
 * changement s'applique puis `regenererApresChangementReference` remet en file les prises et le test ; la fiche repasse « à valider ».
 * Sans prise ni test, ou pour la toute première référence, le changement est direct. */
export function useChangementReference({ assetId, aDejaUneReference, impact }: { assetId: number; aDejaUneReference: boolean; impact: ImpactReference }): {
  changer: (appliquer: () => Promise<{ ok: true } | { ok: false; erreur: string }>) => Promise<RetourChangement>;
  dialogue: ReactNode;
} {
  const ref = useRef<HTMLDialogElement>(null);
  const resolveur = useRef<((ok: boolean) => void) | null>(null);
  const confirmation = changementDemandeConfirmation(aDejaUneReference, impact);

  const demander = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolveur.current = resolve;
        ref.current?.showModal();
      }),
    [],
  );
  const fermer = (ok: boolean) => {
    const r = resolveur.current;
    resolveur.current = null;
    if (ref.current?.open) ref.current.close();
    r?.(ok);
  };

  const changer = async (appliquer: () => Promise<{ ok: true } | { ok: false; erreur: string }>): Promise<RetourChangement> => {
    if (confirmation && !(await demander())) return { ok: false, erreur: MESSAGE_CHANGEMENT_ANNULE, annule: true };
    const r = await appliquer();
    if (!r.ok) return r;
    if (!confirmation) return { ok: true, message: aDejaUneReference ? "Voix de référence changée : la fiche repasse « à valider »." : "Voix de référence rattachée. Écoute-la, puis valide la voix." };
    const c = await regenererApresChangementReference(assetId);
    if (!c.ok) return { ok: false, erreur: c.erreur };
    const parts = [
      c.repliques > 0 ? pluriel(c.repliques, "réplique", "répliques") : null,
      c.testVideo ? "le test vidéo" : null,
    ].filter(Boolean);
    const lancees = parts.length > 0 ? `${parts.join(" et ")} ${c.repliques > 1 || (c.repliques > 0 && c.testVideo) ? "sont" : "est"} en regénération.` : "Rien n'a pu être remis en file.";
    return { ok: true, message: `Voix de référence changée, la fiche repasse « à valider ». ${lancees}${c.ignorees.length > 0 ? ` Non relancé : ${c.ignorees.join(" ; ")}` : ""}` };
  };

  const prises = impact.nbPrises;
  const dialogue = (
    <dialog
      ref={ref}
      className="dlg-confirm"
      aria-labelledby="dlg-ref-titre"
      aria-describedby="dlg-ref-texte"
      onCancel={(e) => {
        e.preventDefault();
        fermer(false);
      }}
      onClose={() => fermer(false)}
    >
      <div className="dlg-confirm-in">
        <h2 id="dlg-ref-titre">Changer la voix de référence ?</h2>
        <div id="dlg-ref-texte" className="dlg-confirm-warn" role="alert">
          {prises > 0 ? (
            <p>
              <b>{pluriel(prises, "réplique sera regénérée", "répliques seront regénérées")}</b> avec la nouvelle voix : les prises actuelles seront remplacées.
            </p>
          ) : null}
          {impact.testVideo ? <p>Le test vidéo sera aussi regénéré pour rester synchronisé avec la nouvelle voix.</p> : null}
          <p className="tiny-note">La fiche repasse « à valider ». L&rsquo;opération prend plusieurs minutes, et se suit dans l&rsquo;icône du bandeau.</p>
        </div>
        <div className="dlg-confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={() => fermer(false)} autoFocus>
            Annuler
          </button>
          <button type="button" className="btn btn-gold" onClick={() => fermer(true)}>
            Confirmer et regénérer
          </button>
        </div>
      </div>
    </dialog>
  );

  return { changer, dialogue };
}
