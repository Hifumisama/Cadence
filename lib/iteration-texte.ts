/** « Itérer à partir de cet essai » sur un plan périmé pour son seul texte (PlateauEssais → IntentionPlan) : le bouton n'a pas de consigne à écrire, la consigne est
 * toujours celle-ci, et c'est la différence entre le texte de l'essai et celui du plan qui dit quoi reporter dans son prompt (skill `retouche-prompt`). */
export const EVENEMENT_ITERER_TEXTE = "cadence:iterer-texte";
export const CONSIGNE_TEXTE_MODIFIE =
  "Le texte du plan a changé depuis cet essai : reporte ce changement dans le prompt de l'essai, et ne change rien d'autre.";
