# Example — a precise request, then a precise request mixed with a feeling

Same episode "Le sel" (plans P01–P14; P07's description holds Maya's line "Je ne reviendrai jamais.", P12's the fisherman's "Tu pars ?" and Maya's "Le sel ne ment pas."). P04 and P07 have a successful render (`rendu`).

## 1. A precise request, with a story problem you can see

Input (abridged): `"message": "Supprime le plan 04 et le plan 07."`, no draft.

One decision. The application will warn about the two overwritten renders itself — you do **not** repeat that. You add the **story** judgment it cannot make: P07 is where Maya reads the letter; P08 (the insert of the writing) and the line of P12 depend on it.

```json
{
  "decisions": [
    {
      "titre": "Supprimer les plans 04 et 07",
      "raison": "Demande directe.",
      "operations": [
        {"type": "couper_plan", "plan": "P04"},
        {"type": "couper_plan", "plan": "P07"}
      ]
    }
  ],
  "retirer": [],
  "pistes": [],
  "retenirPistes": [],
  "narratif": [
    {
      "decision": "D1",
      "niveau": "conflit",
      "texte": "Le plan 07 est celui où Maya lit la lettre : sans lui, l'insert du plan 08 n'a plus d'objet et la réplique du plan 12 (« Le sel ne ment pas. ») perd sa cause."
    }
  ]
}
```

## 2. A precise request AND a feeling, in one sentence

Input (abridged): `"message": "C'est trop long, mais ne touche pas à la scène 2. Et supprime le plan 04."`, no draft, `aEconomiserSecondes`: 34. The scene "La lettre" is P06–P10.

- The **request** becomes a decision.
- The **feeling** becomes options, and the request is a **constraint**: no operation on P06–P10.
- The options start from the episode **without P04** (8 s less): 26 seconds are still missing.

```json
{
  "decisions": [
    {
      "titre": "Supprimer le plan 04",
      "raison": "Demande directe ; il redit la lettre que le plan 07 montre.",
      "operations": [{"type": "couper_plan", "plan": "P04"}]
    }
  ],
  "retirer": [],
  "pistes": [
    {
      "titre": "Accélérer la scène 1",
      "resume": "Sans le gros plan, le port peut s'établir plus vite, avec des plans resserrés.",
      "operations": [
        {"type": "duree_plan", "plan": "P01", "secondes": 6},
        {"type": "duree_plan", "plan": "P02", "secondes": 6},
        {"type": "duree_plan", "plan": "P03", "secondes": 7},
        {"type": "duree_plan", "plan": "P05", "secondes": 5}
      ]
    },
    {
      "titre": "Resserrer la scène 3",
      "resume": "Le plan 12 peut ouvrir directement sur Maya debout ; le bateau n'a pas besoin de durer autant.",
      "operations": [
        {"type": "couper_plan", "plan": "P11"},
        {"type": "duree_plan", "plan": "P13", "secondes": 12}
      ]
    }
  ],
  "retenirPistes": [],
  "narratif": []
}
```
