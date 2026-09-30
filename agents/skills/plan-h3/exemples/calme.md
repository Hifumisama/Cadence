# Exemple — Tension retenue — plan tenu, caméra verrouillée, gros plan

> Plan réel de l'épisode 1 (« Les Yeux de Rubis »), rendu et validé en production. Les numéros de plan cités dans les notes sont ceux de la fiche source ; dans l'app, un plan s'identifie par son uuid. Le bloc « Prompt » montre le prompt **final assemblé** (labels `<Subject N>`, `<Picture N>`, `<Audio N>` déjà posés).


| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 6 s | 6 s | 24 | full-reference |

**Références (4/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, à l'écoute |
| `<Picture 2>` | `HUM_silhouettes_encapuchonnees` | Silhouettes lointaines |
| `<Picture 3>` | `PROP_dague_maya` | Détail du geste vers la dague |
| `<Picture 4>` | `DEC_ruelles_bazar` | Décor, passage dérobé de médina |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, alert, hearing distant voices.
<Subject 2> is the two cloaked, hooded figures from <Picture 2>, faintly visible one alley over.
<Subject 3> is the concealed dagger from <Picture 3>, at Maya's waist.
<Subject 4> is the hidden medina alley passage from <Picture 4>.

summary:
[reference generation] The target video shows <Subject 1> catching sight of <Subject 2> in the distance within <Subject 4> and instinctively moving two fingers toward <Subject 3>.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - Maya's identity and controlled alertness are retained.
<Subject 2> (appears in [Shot 1]): weak_reference - only their distant, cloaked silhouettes register in low moonlight.
<Subject 3> (appears in [Shot 1]): fully_preserved - the dagger and its position remain concealed but referenced by the gesture.
<Subject 4> (appears in [Shot 1]): fully_preserved - the passage's moonlit shadow and medina architecture are retained.

detailed_description:
Cinematic anime style, refined linework, faint moonlight against deep shadow. [Shot 1] A medium close shot holds on <Subject 1>, Maya, her head turning slightly as she catches the sound of distant voices. One alley over within <Subject 4>, <Subject 2>, two cloaked, hooded figures, are barely visible in the faint moonlight beneath a striped awning, faces obscured. Without breaking her stillness, Maya's fingers drift slowly and precisely toward her waist, toward <Subject 3>, the concealed dagger, the same cold precision she showed scanning the inn's room earlier. Her body stays otherwise motionless, controlled, invisible in the shadow.

overall_soundscape:
Muffled distant voices carry faintly from the neighboring alley, otherwise near-total stillness on Maya's side.

non_diegetic_music:
N/A — tension carried by silence rather than score.
```

**Notes** — Même logique de regard-qui-évalue que le plan 110 : retenue de mise en scène identique, geste minimal, pour que le lien entre les deux moments reste lisible sans dialogue.
