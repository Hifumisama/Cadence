# Exemple — Plan dialogué — une réplique, marge de respiration, voix portée par `repliques`

> Plan réel de l'épisode 1 (« Les Yeux de Rubis »), rendu et validé en production. Ce bloc montre le plan **tel que tu dois le rendre** : le brouillon JSON. Le code en tire le prompt final (labels, `[Shot N]`, timecodes, « Hard cut to »).

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 7 s | 7 s | 24 | full-reference |

**Références (3)**
| Asset | Nature | Rôle dans le plan |
|---|---|---|
| `CHAR_tenanciere` | image | Tenancière, penchée, menace |
| `CHAR_maya` | image | Maya, sous la menace |
| `DEC_couloir_bois` | image | Décor, couloir bleu nuit |

**Voix** — la réplique est dans `repliques` (aucune référence `son` pour la voix : le code branche la prise).

**Brouillon rendu**
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

**Notes** — Premier des trois plans de *La sentence*. Le plan d'origine cumulait les trois répliques (~24 s de voix), très au-delà du plafond H3 de 15 s : il a été scindé en trois plans, générés séparément et raccordés au montage.
