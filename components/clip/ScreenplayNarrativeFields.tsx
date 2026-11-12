"use client";

export type ChampsNarratifs = {
  description: string;
};

/** Champs narratifs partagés par la création de plan (page Scénario) et
 * l'édition depuis la fiche de plan — un seul composant pour ne pas
 * redécrire les mêmes champs à deux endroits. */
export function ScenarioNarratifFields({
  valeurs,
  onChange,
}: {
  valeurs: ChampsNarratifs;
  onChange: (cle: keyof ChampsNarratifs, valeur: string) => void;
}) {
  const maj = (cle: keyof ChampsNarratifs) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    onChange(cle, e.target.value);
  return (
    <>
      <div className="field-group wide">
        <label>Ce qui se passe, et pourquoi</label>
        <textarea
          className="field"
          rows={4}
          value={valeurs.description}
          onChange={maj("description")}
          placeholder="Le morceau d'histoire qu'on veut voir, et son intention. Le cadrage et la lumière se décident dans le prompt."
        />
      </div>
    </>
  );
}
