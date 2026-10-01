# Exemple — Action intense — course paniquée, cadence rapide, angles distincts

> Plan réel de l'épisode 1 (« Les Yeux de Rubis »), rendu et validé en production. Les numéros de plan cités dans les notes sont ceux de la fiche source ; dans l'app, un plan s'identifie par son uuid. Le bloc « Prompt » montre le prompt **final assemblé** (labels `<Subject N>`, `<Picture N>`, `<Audio N>` déjà posés).


| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 12 s | 12 s | 24 | full-reference |

**Références (2/6)**
| Label | Asset | Rôle dans le plan |
|---|---|---|
| `<Picture 1>` | `CHAR_maya` | Maya, en fuite puis essoufflée |
| `<Picture 2>` | `DEC_ruelles_bazar` | Décor, ruelles nocturnes de médina |

**Prompt**
```text
subject_definitions:
<Subject 1> is Maya from <Picture 1>, running, her usual lightness replaced by panic, then stopping to catch her breath.
<Subject 2> is the bazar's nocturnal Persian/Arab-style back alleys from <Picture 2> — narrow passages under striped cloth awnings, ochre-plastered walls, chipped zellige tilework, horseshoe archways, shuttered stalls, wet cobblestones under moonlight.

summary:
[reference generation] The target video shows <Subject 1> plunging into <Subject 2>, her steps heavy and erratic, then leaning against a damp stone wall in a hidden side passage to catch her breath.

retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - Maya's identity and physical state are retained across both shots.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - the medina-style alley architecture and moonlit shadows are retained.

detailed_description:
Cinematic anime style, refined linework, cold moonlight against deep shadow. [Shot 1] A wide shot follows <Subject 1>, Maya, running into <Subject 2>, the maze of the bazar's back alleys — narrow passages winding beneath striped cloth awnings strung overhead, their fabric ghost-pale in the moonlight, ochre-plastered walls broken by chipped zellige tilework and shuttered horseshoe-arched stalls closed for the night. Her steps land heavy and erratic against the wet cobblestones, a sharp contrast to her usual dancer's lightness. Moonlight catches her costume in fragments between deep pools of shadow as she cuts between the narrow passages, her breath visible in ragged bursts. A muffled echo of the service door slamming shut carries behind her from off-frame. [Shot 2] At 00:07.000, the camera holds a medium close static shot as <Subject 1> stops and leans back against a damp stone wall in a hidden side passage of <Subject 2>, unlit copper lanterns hanging cold and dark above her. Her shoulders rise and fall sharply with each labored breath, her chest heaving beneath the still-disheveled costume. She tips her head back briefly against the cold stone, eyes closing for a single instant of forced stillness.

overall_soundscape:
Heavy, uneven footsteps splash against wet cobblestones, the distant echo of a slamming door fading behind her, giving way to Maya's labored breathing and faint distant bazar ambiance.

non_diegetic_music:
The tense string pulse continues, low and unresolved through the run, fading down to near silence as her breathing slows.
```
