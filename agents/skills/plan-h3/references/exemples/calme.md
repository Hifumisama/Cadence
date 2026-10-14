# Example — Held tension — one held shot, locked camera, close-up

> A 6 s plan: Maya listens and her hand drifts toward her dagger. One held shot; the calm plays out over time. Each hooded silhouette is its own asset. This block shows the draft **as you must return it**; the code derives the final prompt from it (labels, `[Shot N]`, timecodes, "Hard cut to").

```json
{
  "titre": "Maya, à l'écoute dans la ruelle",
  "dureeSecondes": 6,
  "references": [
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, à l'écoute", "nom": "Maya", "definition": "in her deep-red dancer's costume with a gilded corset, ruby eyes, alert and still.", "retentionNote": "Maya's identity and controlled alertness are retained."},
    {"asset": "CHAR_silhouette_gauche", "nature": "image", "role": "Première silhouette lointaine", "nom": "the first hooded figure", "definition": "in a dark cloak with the hood pulled over the face, standing far off.", "retention": "weak_reference", "retentionNote": "only the distant cloaked silhouette registers in low moonlight."},
    {"asset": "CHAR_silhouette_droite", "nature": "image", "role": "Seconde silhouette lointaine", "nom": "the second hooded figure", "definition": "in a dark cloak with the hood pulled over the face, standing far off.", "retention": "weak_reference", "retentionNote": "only the distant cloaked silhouette registers in low moonlight."},
    {"asset": "PROP_dague_maya", "nature": "image", "role": "Détail du geste vers la dague", "nom": "the concealed dagger", "definition": "a short utilitarian combat dagger, hilt hidden under a leather strap at Maya's belt.", "retentionNote": "the dagger and its position remain hidden and are referenced by the gesture."},
    {"asset": "DEC_ruelles_bazar", "nature": "image", "role": "Décor, passage dérobé de médina", "nom": "the hidden medina alley passage", "definition": "ochre-plastered walls under striped cloth awnings, in faint moonlight.", "retentionNote": "the passage's moonlit shadow and medina architecture are retained."}
  ],
  "summary": "The target video shows [[CHAR_maya]] catching sight of [[CHAR_silhouette_gauche]] and [[CHAR_silhouette_droite]] in the distance within [[DEC_ruelles_bazar]] and moving two fingers toward [[PROP_dague_maya]].",
  "ouverture": "Faint moonlight against deep shadow.",
  "shots": [
    {"debutSecondes": 0, "texte": "A medium close static shot, the camera locked and the background still, holds on [[CHAR_maya]], Maya, her head turning slightly toward distant voices. One alley over within [[DEC_ruelles_bazar]], [[CHAR_silhouette_gauche]] and [[CHAR_silhouette_droite]], two hooded figures, stand barely visible in the faint moonlight beneath a striped awning. Maya's fingers drift slowly and precisely toward her waist, toward [[PROP_dague_maya]], the concealed dagger, while the rest of her body stays motionless in the shadow."}
  ],
  "overall_soundscape": "Muffled distant voices carry faintly from the neighboring alley, the night air otherwise quiet.",
  "non_diegetic_music": "N/A",
  "assetsManquants": [],
  "notes": "Un seul shot tenu, caméra verrouillée : le calme se joue dans la durée."
}
```
