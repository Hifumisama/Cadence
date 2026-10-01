# Exemple — Plan dialogué — une réplique, marge de respiration, timbre en <Audio N>

> Plan réel de l'épisode 1 (« Les Yeux de Rubis »), rendu et validé en production. Les numéros de plan cités dans les notes sont ceux de la fiche source ; dans l'app, un plan s'identifie par son uuid. Le bloc « Prompt » montre le prompt **final assemblé** (labels `<Subject N>`, `<Picture N>`, `<Audio N>` déjà posés).


| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 7 s | 7 s | 24 | full-reference |

**Référence audio (ref2va)** — `S01_shot19_VOX_tenanciere_take01.flac` (5 s de voix)

**Références (3/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_tenanciere` | Tenancière, penchée, menace |
| `<Picture 2>` | `CHAR_maya` | Maya, sous la menace |
| `<Picture 3>` | `DEC_couloir_bois` | Décor, couloir bleu nuit |

**Prompt**
```text
subject_definitions:
<Subject 1> is the Tenancière from <Picture 1>, leaning in close, her stride reduced to a bare, controlled inclination without a full stop.
<Subject 2> is Maya from <Picture 2>, pinned by the proximity and the threat.
<Subject 3> is the narrow wooden corridor from <Picture 3>, its constant deep indigo light now edged with harder shadow.

summary:
[reference generation] The target video holds an extreme close-up as <Subject 1> opens the episode's central threat to <Subject 2> within <Subject 3>, never fully halting her motion.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - her gown, expression, and controlled near-stillness are retained.
<Subject 2> (appears in [Shot 1]): fully_preserved - Maya's identity and fear are retained.
<Subject 3> (appears in [Shot 1]): fully_preserved - the corridor's indigo tone, now hard-edged, is retained.

detailed_description:
Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast, a heavy blue-black shadow cast across Maya's face. [Shot 1] An extreme close-up frames <Subject 1>, the Tenancière (S1), leaning in until her face is only centimeters from <Subject 2>, Maya, within <Subject 3>, her stride slowing to its barest inclination without ever stopping outright. Her voice drops to a slow, glacial murmur, each word measured and unhurried: <d>[Français] Demain, au lever du soleil, si l'or n'est pas sur mon bureau, je ne perdrai plus mon temps avec tes danses.</d> Maya's face, half in hard indigo shadow, holds rigid under the proximity, her breath shallow.

overall_soundscape:
Near-total silence surrounds the murmured threat, Maya's breath tight and controlled.

non_diegetic_music:
A single low, sustained cello note begins to hold unresolved beneath the threat, barely swelling.
```

**Notes** — Premier des trois plans de *La sentence*. Le plan 270 d'origine cumulait les trois répliques (~24 s de voix), très au-delà du plafond H3 de 15 s : il a été scindé en 271 / 274 / 277, générés séparément et raccordés au montage. Numéros pris dans le trou de la dizaine, le 270 reste brûlé.
