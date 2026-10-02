# Exemple — Geste continu assumé — un mouvement ininterrompu, déclaré dans `notes`

> Plan réel de l'épisode 1 (« Les Yeux de Rubis »), rendu et validé en production. Ce bloc montre le plan **tel que tu dois le rendre** : le brouillon JSON. Le code en tire le prompt final (labels, `[Shot N]`, timecodes, « Hard cut to »).

| Durée montage | Durée génération | FPS | Mode |
|---|---|---|---|
| 15 s | 15 s | 24 | full-reference |

**Références (3)**
| Asset | Nature | Rôle dans le plan |
|---|---|---|
| `CHAR_tenanciere` | image | Tenancière, mépris puis geste de la gifle |
| `CHAR_maya` | image | Maya, cible puis chancelante |
| `DEC_couloir_bois` | image | Décor, couloir bleu nuit |

**Brouillon rendu**
```json
{
  "titre": "La gifle",
  "dureeSecondes": 15,
  "references": [
    {"asset": "CHAR_tenanciere", "nature": "image", "role": "Tenancière, mépris puis geste de la gifle", "nom": "the Tenancière", "definition": "her pace slowed to a near-minimum but never fully stopped, until the single unbroken motion of the strike.", "retentionNote": "her gown, expression, and continued motion through the strike are retained."},
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, cible puis chancelante", "nom": "Maya", "definition": "caught mid-sentence, then reeling from the impact.", "retentionNote": "Maya's identity and physical reaction are retained across both shots."},
    {"asset": "DEC_couloir_bois", "nature": "image", "role": "Décor, couloir bleu nuit", "nom": "the narrow wooden corridor", "definition": "its constant deep indigo light unchanged throughout.", "retentionNote": "the corridor's indigo tone is retained throughout."}
  ],
  "summary": "The target video holds on [[CHAR_tenanciere]] delivering a joyless laugh and dismissive line within [[DEC_couloir_bois]], then strikes [[CHAR_maya]] across the face in one continuous stride, and holds on [[CHAR_maya]] staggering to keep from falling.",
  "ouverture": "Cinematic anime style, refined linework, pervasive deep indigo light, a hard flash of contrast at the moment of impact.",
  "shots": [
    {"debutSecondes": 0, "texte": "A close-up holds on [[CHAR_tenanciere]], the Tenancière (S1), her stride reduced to its slowest point yet without ever fully halting within [[DEC_couloir_bois]]. A short, joyless laugh escapes her, cold and dry, before she says, in the same measured, unhurried tone, <d>[Français] Tu es trop optimiste pour une fille qui court toujours après ses propres ombres.</d> Her mismatched eyes narrow faintly with contempt, gone as quickly as it appeared."},
    {"debutSecondes": 5, "texte": "a close shot frames [[CHAR_tenanciere]] within [[DEC_couloir_bois]], her hand snapping upward and across in a single fast, precise motion, striking [[CHAR_maya]], Maya, hard across the cheek, mid-word. The Tenancière's stride never falters through the motion, her expression unchanged, as if the strike were incidental inside a larger, uninterrupted movement."},
    {"debutSecondes": 9, "texte": "a held close shot on [[CHAR_maya]], Maya, her head still tilted from the impact, legs buckling beneath her as she staggers sideways within [[DEC_couloir_bois]]. Her hand shoots out and grips the edge of a nearby wooden service table hard enough to whiten her knuckles, steadying herself just before falling. Her breath comes short and ragged; she bites down involuntarily, wincing at a coppery taste in her mouth."}
  ],
  "overall_soundscape": "A short, dry, joyless laugh, then a single sharp cracking slap that cuts off Maya's sentence mid-syllable, followed by her short, ragged breathing and a dull scrape as her hand catches the table's edge.",
  "non_diegetic_music": "The cold string pulse holds static through the contempt, cuts out abruptly on the impact, then stays silent through the aftermath.",
  "repliques": [{"repliqueId": "b3f0a8d2-6e14-4c7b-a2d9-5e81c0f7d364", "debutSecondes": 1}],
  "assetsManquants": [],
  "notes": "Geste continu assumé : la gifle part de la foulée de la Tenancière sans interruption. Les trois shots se raccordent dans un seul mouvement ; à ne pas couper au montage."
}
```

**Notes** — Séquence de violence la plus dense de l'épisode, volontairement tenue en un seul geste ininterrompu de la Tenancière : c'est tout l'intérêt de la fusion.
