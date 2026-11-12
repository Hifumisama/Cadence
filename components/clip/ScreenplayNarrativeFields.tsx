"use client";

export type ChampsNarratifs = {
  description: string;
};

/** Narrative fields shared by clip creation (Screenplay page) and editing
 * from the clip sheet — a single component so as not to rewrite the same
 * fields in two places. */
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
