# Example — Deliberate continuous gesture — the gesture stays in one shot, declared in `notes`

> A 15 s plan: a line, then a slap in one movement, then the reaction. The slap is never cut (shot 2); the cuts frame what comes before (the line) and after (the reaction). This block shows the draft **as you must return it**; the code derives the final prompt from it (labels, `[Shot N]`, timecodes, "Hard cut to").

```json
{
  "titre": "La gifle",
  "dureeSecondes": 15,
  "references": [
    {"asset": "CHAR_tenanciere", "nature": "image", "role": "Tenancière, mépris puis geste de la gifle", "nom": "the Tenancière", "definition": "in her long gown, mismatched eyes, composed and cold.", "retentionNote": "her gown, expression and slow stride are retained through the strike."},
    {"asset": "CHAR_maya", "nature": "image", "role": "Maya, cible puis chancelante", "nom": "Maya", "definition": "in her deep-red dancer's costume with a gilded corset, ruby eyes, tense and alert.", "retentionNote": "Maya's identity and physical reaction are retained across the shots."},
    {"asset": "DEC_couloir_bois", "nature": "image", "role": "Décor, couloir bleu nuit", "nom": "the narrow wooden corridor", "definition": "narrow wooden walls under a constant deep indigo light.", "retentionNote": "the corridor's indigo tone is retained throughout."}
  ],
  "summary": "The target video holds on [[CHAR_tenanciere]] delivering a joyless laugh and a dismissive line within [[DEC_couloir_bois]], then strikes [[CHAR_maya]] across the face in one continuous stride, and holds on [[CHAR_maya]] staggering to keep from falling.",
  "ouverture": "Pervasive deep indigo light, a hard flash of contrast at the moment of impact. Maya stays on the left of the frame facing right, the Tenancière on the right facing left.",
  "shots": [
    {"debutSecondes": 0, "texte": "A close-up holds on [[CHAR_tenanciere]], the Tenancière (S1), her stride at its slowest and continuous within [[DEC_couloir_bois]]. A short, joyless laugh escapes her, cold and dry, before she says, in the same measured, unhurried tone, <d>[Français] Tu es trop optimiste pour une fille qui court toujours après ses propres ombres.</d> Her mismatched eyes narrow faintly with contempt, gone as quickly as it appeared."},
    {"debutSecondes": 5, "texte": "a close shot of [[CHAR_tenanciere]] within [[DEC_couloir_bois]], her hand snapping upward and across in a single fast, precise motion, striking [[CHAR_maya]], Maya, hard across the cheek with a single sharp crack. The Tenancière's stride continues through the motion, her expression unchanged, the strike one fluid part of a larger, uninterrupted movement."},
    {"debutSecondes": 9, "texte": "a held close shot of [[CHAR_maya]], Maya, her head still tilted from the impact, legs buckling beneath her as she staggers sideways within [[DEC_couloir_bois]]. Her hand shoots out and grips the edge of a nearby wooden service table with a dull scrape, hard enough to whiten her knuckles, steadying herself just before falling. Her breath comes short and ragged."}
  ],
  "overall_soundscape": "Faint creaking of the old wooden walls fills the corridor between the sounds of the plan.",
  "non_diegetic_music": "Low sustained strings at a slow pulse, stopping dead on the impact and silent for the rest of the plan.",
  "repliques": [{"repliqueId": "b3f0a8d2-6e14-4c7b-a2d9-5e81c0f7d364", "debutSecondes": 1}],
  "assetsManquants": [],
  "notes": "Geste continu assumé : la gifle part de la foulée de la Tenancière et tient en un seul shot, sans coupe. Les coupes cadrent ce qui la précède (la réplique) et ce qui la suit (la réaction de Maya)."
}
```
