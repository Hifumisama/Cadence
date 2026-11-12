/** « Itérer à partir de cet essai » on a clip that is stale for its text alone (PlateauEssais → IntentionPlan): the button has no instruction to write, the instruction
 * is always this one, and the difference between the attempt's text and the clip's tells what to carry over into its prompt (skill `retouche-prompt`). */
export const EVENEMENT_ITERER_TEXTE = "cadence:iterer-texte";
export const CONSIGNE_TEXTE_MODIFIE =
  "Le texte du plan a changé depuis cet essai : reporte ce changement dans le prompt de l'essai, et ne change rien d'autre.";
