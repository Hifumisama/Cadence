# Example — Dialogue plan — one line, breathing margin, voice carried by `repliques`

> A 7 s plan: one line and a breathing margin of at least 2 s in total. The line is in `repliques` and quoted in a `<d>` with its speaker `(S1)`; the code plugs in the voice take. This block shows the draft **as you must return it**; the code derives the final prompt from it (labels, `[Shot N]`, timecodes, "Hard cut to").

```json
{
  "titre": "La sentence — la menace",
  "dureeSecondes": 7,
  "references": [
    {"asset": "CHAR_tenanciere", "nature": "image", "role": "Tenancière, penchée, menace", "nom": "the Tenancière", "definition": "in her long gown, mismatched eyes, leaning in close, a slow and controlled inclination of her whole body.", "retentionNote": "her gown, expression and controlled near-stillness are retained."},
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, sous la menace", "nom": "Maya", "definition": "in her deep-red dancer's costume with a gilded corset, ruby eyes, rigid and tense.", "retentionNote": "Maya's identity and fear are retained."},
    {"asset": "DEC_couloir_bois", "nature": "image", "role": "Décor, couloir bleu nuit", "nom": "the narrow wooden corridor", "definition": "narrow wooden walls under a deep indigo light edged with harder shadow.", "retentionNote": "the corridor's indigo tone, now hard-edged, is retained."}
  ],
  "summary": "The target video holds an extreme close-up as [[CHAR_tenanciere]] opens the episode's central threat to [[CHAR_maya]] within [[DEC_couloir_bois]], her slow lean continuing through the line.",
  "ouverture": "Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast, a heavy blue-black shadow cast across Maya's face.",
  "shots": [
    {"debutSecondes": 0, "texte": "An extreme close-up frames [[CHAR_tenanciere]], the Tenancière (S1), leaning in until her face is only centimeters from [[CHAR_maya]], Maya, within [[DEC_couloir_bois]], her slow lean continuing through the line. Her voice drops to a glacial murmur, each word measured and unhurried: <d>[Français] Demain, au lever du soleil, si l'or n'est pas sur mon bureau, je ne perdrai plus mon temps avec tes danses.</d> Maya's face, half in hard indigo shadow, holds rigid under the proximity, her breath shallow."}
  ],
  "overall_soundscape": "A low, quiet hum of the wooden corridor surrounds the murmured line.",
  "non_diegetic_music": "A single low sustained cello note, barely swelling.",
  "repliques": [{"repliqueId": "7c1e5b0a-3d2f-4a8e-9b61-0f4d2a9c8e13", "debutSecondes": 1}],
  "assetsManquants": [],
  "notes": "Premier des trois plans de La sentence : la scène portait trois répliques (environ 24 s de voix), au-delà du plafond de 15 s ; elle est découpée en trois plans générés séparément."
}
```
