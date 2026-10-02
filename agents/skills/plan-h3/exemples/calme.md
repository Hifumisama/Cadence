# Exemple — Tension retenue — plan tenu, caméra verrouillée, gros plan

> Plan réel de l'épisode 1 (« Les Yeux de Rubis »), rendu et validé en production. Ce bloc montre le plan **tel que tu dois le rendre** : le brouillon JSON. Le code en tire le prompt final (labels, `[Shot N]`, timecodes, « Hard cut to »).

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 6 s | 6 s | 24 | full-reference |

**Références (4)**
| Asset | Nature | Rôle dans le plan |
|---|---|---|
| `CHAR_maya` | image | Maya, à l'écoute |
| `HUM_silhouettes_encapuchonnees` | image | Silhouettes lointaines |
| `PROP_dague_maya` | image | Détail du geste vers la dague |
| `DEC_ruelles_bazar` | image | Décor, passage dérobé de médina |

**Brouillon rendu**
```json
{
  "titre": "Maya, à l'écoute dans la ruelle",
  "dureeSecondes": 6,
  "references": [
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, à l'écoute", "nom": "Maya", "definition": "alert, hearing distant voices.", "retentionNote": "Maya's identity and controlled alertness are retained."},
    {"asset": "HUM_silhouettes_encapuchonnees", "nature": "image", "role": "Silhouettes lointaines", "nom": "the two cloaked, hooded figures", "definition": "faintly visible one alley over.", "retention": "weak_reference", "retentionNote": "only their distant, cloaked silhouettes register in low moonlight."},
    {"asset": "PROP_dague_maya", "nature": "image", "role": "Détail du geste vers la dague", "nom": "the concealed dagger", "definition": "at Maya's waist.", "retentionNote": "the dagger and its position remain concealed but referenced by the gesture."},
    {"asset": "DEC_ruelles_bazar", "nature": "image", "role": "Décor, passage dérobé de médina", "nom": "the hidden medina alley passage", "definition": "", "retentionNote": "the passage's moonlit shadow and medina architecture are retained."}
  ],
  "summary": "The target video shows [[CHAR_maya]] catching sight of [[HUM_silhouettes_encapuchonnees]] in the distance within [[DEC_ruelles_bazar]] and instinctively moving two fingers toward [[PROP_dague_maya]].",
  "ouverture": "Cinematic anime style, refined linework, faint moonlight against deep shadow.",
  "shots": [
    {"debutSecondes": 0, "texte": "A medium close shot holds on [[CHAR_maya]], Maya, her head turning slightly as she catches the sound of distant voices. One alley over within [[DEC_ruelles_bazar]], [[HUM_silhouettes_encapuchonnees]], two cloaked, hooded figures, are barely visible in the faint moonlight beneath a striped awning, faces obscured. Without breaking her stillness, Maya's fingers drift slowly and precisely toward her waist, toward [[PROP_dague_maya]], the concealed dagger, the same cold precision she showed scanning the inn's room earlier. Her body stays otherwise motionless, controlled, invisible in the shadow."}
  ],
  "overall_soundscape": "Muffled distant voices carry faintly from the neighboring alley, otherwise near-total stillness on Maya's side.",
  "non_diegetic_music": "N/A — tension carried by silence rather than score.",
  "repliques": [],
  "assetsManquants": [],
  "notes": ""
}
```

**Notes** — Même logique de regard-qui-évalue qu'un plan voisin : retenue de mise en scène identique, geste minimal, pour que le lien entre les deux moments reste lisible sans dialogue. Un seul shot tenu : le calme se joue sur la durée.
