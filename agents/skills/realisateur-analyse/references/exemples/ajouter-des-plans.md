# Example — adding several plans, each with its line, before an existing plan

Episode with plans P01–P06; P01 is a long plan of the intro. The characters of the episode include Maya and the fisherman (as the other plans' descriptions name them).

Input (abridged): `"message": "Découpe le plan 01 en 4 plans de 6 secondes, juste avant le plan 01 : l'eau (un maître de l'eau fait du tai chi sur fond neutre, l'eau suit ses gestes ; Maya dit « L'eau... »), le feu (un maître du feu frappe à droite, à gauche, vers la caméra, des flammes jaillissent ; Maya dit « Le feu... »), la terre (un maître de la terre saute et retombe, des pieux sortent du sol ; Maya dit « La terre... »), l'air (un maître de l'air tourne sur lui-même au centre d'une bourrasque et sort du cadre en sautant ; Maya dit « L'air... »)."`

The user gave the places (**before P01**), the durations (**6 s each**, so `secondes: 6` on each operation), the content of each plan and the line of each plan. That is a **precise request**: one decision, four `ajouter_plan` operations **in reading order, all with `"avant": "P01"`** (each one lands right before P01, after the previous ones). The line goes **inside the description of the same operation**, as `NAME : « words as given »`, never in `consigne`. You write a short French title and a one or two sentence description for each plan, from what the user said.

```json
{
  "decisions": [
    {
      "titre": "Quatre plans des éléments avant le plan 01",
      "raison": "Découper l'introduction en un plan par élément, chacun avec la réplique de Maya.",
      "operations": [
        {"type": "ajouter_plan", "avant": "P01", "titre": "L'eau", "description": "Un maître de l'eau fait un mouvement de tai chi sur un fond neutre ; l'eau semble suivre ses gestes.\nMaya : « L'eau... »", "secondes": 6},
        {"type": "ajouter_plan", "avant": "P01", "titre": "Le feu", "description": "Un maître du feu frappe à droite, à gauche, puis vers la caméra ; la caméra suit, des flammes jaillissent de ses poings.\nMaya : « Le feu... »", "secondes": 6},
        {"type": "ajouter_plan", "avant": "P01", "titre": "La terre", "description": "Un maître de la terre saute dans les airs et retombe au sol ; des pieux de terre jaillissent.\nMaya : « La terre... »", "secondes": 6},
        {"type": "ajouter_plan", "avant": "P01", "titre": "L'air", "description": "Un maître de l'air (pas nécessairement le même personnage) tourne sur lui-même au centre d'une bourrasque, puis sort du cadre en sautant.\nMaya : « L'air... »", "secondes": 6}
      ]
    }
  ],
  "retirer": [],
  "pistes": [],
  "retenirPistes": [],
  "narratif": []
}
```

Notes:
- The user says "découpe le plan 01" but also asks to **create** four plans. Do exactly what is asked (add the four plans). Do **not** also cut or rewrite P01 unless the user says so; the reply step can ask.
- If the user gives **no duration** for a new plan, return no decision: the reply step will ask for it. If he gave one for all ("chacun de 6 secondes"), put it on every operation.
- To add a line to a plan that **already exists** ("fais dire « Tu pars ? » au pêcheur dans le plan 12"), rewrite that plan's description with the line added (`modifier_plan`, complete description) and add `refondre_fiche` so the sheet follows.
- When the user insists after a refusal, the problem is almost always a missing field (`secondes`, `titre`, `avant`/`apres`): fill it, do not propose other options.
