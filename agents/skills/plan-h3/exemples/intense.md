# Exemple — Action intense — course paniquée, cadence rapide, angles distincts

> Plan réel de l'épisode 1 (« Les Yeux de Rubis »), rendu et validé en production. Ce bloc montre le plan **tel que tu dois le rendre** : le brouillon JSON. Le code en tire le prompt final (labels, `[Shot N]`, timecodes, « Hard cut to »).

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 12 s | 12 s | 24 | full-reference |

**Références (2)**
| Asset | Nature | Rôle dans le plan |
|---|---|---|
| `CHAR_maya` | image | Maya, en fuite puis essoufflée |
| `DEC_ruelles_bazar` | image | Décor, ruelles nocturnes de médina |

**Brouillon rendu**
```json
{
  "titre": "Maya fuit dans les ruelles",
  "dureeSecondes": 12,
  "references": [
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, en fuite puis essoufflée", "nom": "Maya", "definition": "running, her usual lightness replaced by panic, then stopping to catch her breath.", "retentionNote": "Maya's identity and physical state are retained across both shots."},
    {"asset": "DEC_ruelles_bazar", "nature": "image", "role": "Décor, ruelles nocturnes de médina", "nom": "the bazar's nocturnal Persian/Arab-style back alleys", "definition": "narrow passages under striped cloth awnings, ochre-plastered walls, chipped zellige tilework, horseshoe archways, shuttered stalls, wet cobblestones under moonlight.", "retentionNote": "the medina-style alley architecture and moonlit shadows are retained."}
  ],
  "summary": "The target video shows [[CHAR_maya]] plunging into [[DEC_ruelles_bazar]], her steps heavy and erratic, then leaning against a damp stone wall in a hidden side passage to catch her breath.",
  "ouverture": "Cinematic anime style, refined linework, cold moonlight against deep shadow.",
  "shots": [
    {"debutSecondes": 0, "texte": "A wide shot follows [[CHAR_maya]], Maya, running into [[DEC_ruelles_bazar]], the maze of the bazar's back alleys — narrow passages winding beneath striped cloth awnings strung overhead, their fabric ghost-pale in the moonlight, ochre-plastered walls broken by chipped zellige tilework and shuttered horseshoe-arched stalls closed for the night. Her steps land heavy and erratic against the wet cobblestones, a sharp contrast to her usual dancer's lightness. Moonlight catches her costume in fragments between deep pools of shadow as she cuts between the narrow passages, her breath visible in ragged bursts. A muffled echo of the service door slamming shut carries behind her from off-frame."},
    {"debutSecondes": 7, "texte": "a medium close static shot as [[CHAR_maya]] stops and leans back against a damp stone wall in a hidden side passage of [[DEC_ruelles_bazar]], unlit copper lanterns hanging cold and dark above her. Her shoulders rise and fall sharply with each labored breath, her chest heaving beneath the still-disheveled costume. She tips her head back briefly against the cold stone, eyes closing for a single instant of forced stillness."}
  ],
  "overall_soundscape": "Heavy, uneven footsteps splash against wet cobblestones, the distant echo of a slamming door fading behind her, giving way to Maya's labored breathing and faint distant bazar ambiance.",
  "non_diegetic_music": "The tense string pulse continues, low and unresolved through the run, fading down to near silence as her breathing slows.",
  "repliques": [],
  "assetsManquants": [],
  "notes": ""
}
```
