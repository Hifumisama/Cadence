# Example — Intense action — panicked run, one shot every 1.5–2.5 s, distinct angles

> A 12 s plan: Maya flees through the alleys, then stops to catch her breath. Six shots, a different angle at each cut. This block shows the draft **as you must return it**; the code derives the final prompt from it (labels, `[Shot N]`, timecodes, "Hard cut to").

```json
{
  "titre": "Maya fuit dans les ruelles",
  "dureeSecondes": 12,
  "references": [
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, en fuite puis essoufflée", "nom": "Maya", "definition": "in her deep-red dancer's costume with a gilded corset, ruby eyes, breathless and dishevelled.", "retentionNote": "Maya's identity and physical state are retained across all shots."},
    {"asset": "DEC_ruelles_bazar", "nature": "image", "role": "Décor, ruelles nocturnes de médina", "nom": "the bazar's nocturnal back alleys", "definition": "narrow passages under striped cloth awnings, ochre-plastered walls, chipped zellige tilework, horseshoe archways, shuttered stalls, wet cobblestones under moonlight.", "retentionNote": "the medina-style alley architecture and moonlit shadows are retained."}
  ],
  "summary": "The target video shows [[CHAR_maya]] plunging into [[DEC_ruelles_bazar]] in a panicked run, glancing back, slipping past walls and stalls, then leaning against a damp stone wall in a side passage to catch her breath.",
  "ouverture": "Cinematic anime style, refined linework, cold moonlight against deep shadow.",
  "shots": [
    {"debutSecondes": 0, "texte": "A wide shot follows [[CHAR_maya]], Maya, from the front as she runs toward the camera down the central alley of [[DEC_ruelles_bazar]], her ruby eyes fixed on the way ahead. Her steps land heavy and erratic on the wet cobblestones and the camera backs away at the same speed, keeping her centred in the frame."},
    {"debutSecondes": 2, "texte": "a ground-level shot of the feet of [[CHAR_maya]], Maya, slapping through a shallow puddle, water spraying sideways in the moonlight, the camera sliding along the cobblestones just ahead of her stride."},
    {"debutSecondes": 3.5, "texte": "a canted close-up of the face of [[CHAR_maya]], Maya, from the front, her head snapping to look over her shoulder, her breath puffing out in ragged bursts, a strand of hair stuck to her cheek."},
    {"debutSecondes": 5.5, "texte": "a high-angle shot from behind and above [[CHAR_maya]], Maya, as she cuts left through a narrow passage of [[DEC_ruelles_bazar]], one hand slapping the ochre wall to steer her turn, awnings flicking past overhead."},
    {"debutSecondes": 7.5, "texte": "a high wide shot over the rooftops showing [[CHAR_maya]], Maya, as a small figure darting between shuttered stalls, the alley branching in three directions below her, the sound of a service door slamming shut far behind."},
    {"debutSecondes": 9.5, "texte": "a medium close static shot, the camera locked and the background still, of [[CHAR_maya]], Maya, stopping and leaning back against a damp stone wall in a hidden side passage, unlit copper lanterns hanging dark above her. Her shoulders rise and fall with each labored breath, and she tips her head back against the cold stone, eyes closing for an instant."}
  ],
  "overall_soundscape": "A faint murmur of the distant bazar drifts over the rooftops, a low hum of voices and cloth shifting in the night air.",
  "non_diegetic_music": "Low strings at a fast pulse of about 110 bpm, fading to near silence over the last two seconds.",
  "repliques": [],
  "assetsManquants": [],
  "notes": "Cadence de course : un shot toutes les 2 s environ, un angle distinct à chaque coupe ; le dernier shot, plus long, ralentit pour la reprise de souffle."
}
```
