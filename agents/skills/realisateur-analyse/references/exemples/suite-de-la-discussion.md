# Example — the rest of the discussion: choosing options, a new request that contradicts the draft, resolving it

Same episode "Le sel". Three consecutive turns.

## 1. Choosing among pending options

Input (abridged): `pistesEnAttente` has three options (1: cut P05, P10, P02, P08 · 2: shorten P06, P07, P09 · 3: speed up scene 1 with P01 → 6 s, P03 → 7 s). `decisions`: empty. `prochainId`: `"D1"`. `"message": "Combine la 1 et la 3."`

Nothing else to say: the options become decisions in the application.

```json
{"decisions": [], "retirer": [], "pistes": [], "retenirPistes": [1, 3], "narratif": []}
```

## 2. A new precise request that contradicts an earlier decision

Input (abridged): `decisions` = `D1` "Couper quatre plans d'ambiance" (cuts P05, P10, P02, P08) and `D2` "Accélérer la scène 1" (P01 → 6 s, P03 → 7 s). `prochainId`: `"D3"`. R01 = "Je ne reviendrai jamais." (said in P07). `"message": "Plan 07 : une réplique plus sobre."`

One new decision (it will be `D3`). And a **story judgment** on it: `D1` cut P08 because the line of P07 already says what the insert shows; a plainer line says it less well.

```json
{
  "decisions": [
    {
      "titre": "Réplique du plan 07 plus sobre",
      "raison": "Le ton de la lettre doit rester contenu.",
      "operations": [{"type": "remplacer_replique", "replique": "R01", "texte": "Je ne reviendrai pas."}]
    }
  ],
  "retirer": [],
  "pistes": [],
  "retenirPistes": [],
  "narratif": [
    {
      "decision": "D3",
      "niveau": "conflit",
      "texte": "Le plan 08 est coupé (D1) parce que la réplique R01 du plan 07 disait déjà ce que l'insert montre ; plus sobre, elle le dit moins bien."
    }
  ]
}
```

## 3. Resolving the conflict

Input (abridged): same draft, `D3` carries the conflict. `"message": "Garde le 08 et prends la formulation sobre."`

Change **both** decisions concerned with their **complete** operations: `D1` without P08; `D3` posted again unchanged (so the old judgment is forgotten). The conflict is gone: no `narratif`.

```json
{
  "decisions": [
    {
      "id": "D1",
      "titre": "Couper trois plans d'ambiance",
      "raison": "Le plan 08 reste : l'insert garde son objet.",
      "operations": [
        {"type": "couper_plan", "plan": "P05"},
        {"type": "couper_plan", "plan": "P10"},
        {"type": "couper_plan", "plan": "P02"}
      ]
    },
    {
      "id": "D3",
      "titre": "Réplique du plan 07 plus sobre",
      "raison": "Le ton de la lettre doit rester contenu.",
      "operations": [{"type": "remplacer_replique", "replique": "R01", "texte": "Je ne reviendrai pas."}]
    }
  ],
  "retirer": [],
  "pistes": [],
  "retenirPistes": [],
  "narratif": []
}
```
