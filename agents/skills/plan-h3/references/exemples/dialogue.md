# Example — Dialogue plan — one line, breathing margin, voice carried by `repliques`

> Real plan from episode 1 ("Les Yeux de Rubis"), rendered and validated in production. This block shows the plan **as you must return it**: the JSON draft. The code derives the final prompt from it (labels, `[Shot N]`, timecodes, "Hard cut to").

| Edit duration | Generation duration | FPS | Mode |
|---|---|---|---|
| 7 s | 7 s | 24 | full-reference |

**References (3)**
| Asset | Nature | Role in the plan |
|---|---|---|
| `CHAR_tenanciere` | image | Tenancière, penchée, menace |
| `CHAR_maya` | image | Maya, sous la menace |
| `DEC_couloir_bois` | image | Décor, couloir bleu nuit |

**Voice** — the line is in `repliques` (no `son` reference for the voice: the code plugs in the take).

**Rendered draft**
```json
{
  "titre": "La sentence — la menace",
  "dureeSecondes": 7,
  "references": [
    {"asset": "CHAR_tenanciere", "nature": "image", "role": "Tenancière, penchée, menace", "nom": "the Tenancière", "definition": "leaning in close, her stride reduced to a bare, controlled inclination without a full stop.", "retentionNote": "her gown, expression, and controlled near-stillness are retained."},
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, sous la menace", "nom": "Maya", "definition": "pinned by the proximity and the threat.", "retentionNote": "Maya's identity and fear are retained."},
    {"asset": "DEC_couloir_bois", "nature": "image", "role": "Décor, couloir bleu nuit", "nom": "the narrow wooden corridor", "definition": "its constant deep indigo light now edged with harder shadow.", "retentionNote": "the corridor's indigo tone, now hard-edged, is retained."}
  ],
  "summary": "The target video holds an extreme close-up as [[CHAR_tenanciere]] opens the episode's central threat to [[CHAR_maya]] within [[DEC_couloir_bois]], never fully halting her motion.",
  "ouverture": "Cinematic anime style, refined linework, the corridor's deep indigo light sharpened into hard directional contrast, a heavy blue-black shadow cast across Maya's face.",
  "shots": [
    {"debutSecondes": 0, "texte": "An extreme close-up frames [[CHAR_tenanciere]], the Tenancière (S1), leaning in until her face is only centimeters from [[CHAR_maya]], Maya, within [[DEC_couloir_bois]], her stride slowing to its barest inclination without ever stopping outright. Her voice drops to a slow, glacial murmur, each word measured and unhurried: <d>[Français] Demain, au lever du soleil, si l'or n'est pas sur mon bureau, je ne perdrai plus mon temps avec tes danses.</d> Maya's face, half in hard indigo shadow, holds rigid under the proximity, her breath shallow."}
  ],
  "overall_soundscape": "Near-total silence surrounds the murmured threat, Maya's breath tight and controlled.",
  "non_diegetic_music": "A single low, sustained cello note begins to hold unresolved beneath the threat, barely swelling.",
  "repliques": [{"repliqueId": "7c1e5b0a-3d2f-4a8e-9b61-0f4d2a9c8e13", "debutSecondes": 1}],
  "assetsManquants": [],
  "notes": ""
}
```

**Notes** — First of the three plans of *La sentence*. The original plan carried all three lines (~24 s of voice), far beyond the H3 ceiling of 15 s: it was split into three plans, generated separately and joined in editing.
