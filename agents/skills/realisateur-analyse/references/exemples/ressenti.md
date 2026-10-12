# Example — a feeling, no precise action: options, no decision

Episode "Le sel", 14 plans, 2:34 for a wanted 2:00 (`aEconomiserSecondes`: 34). Abridged input (only what matters here):

```json
{
  "episode": {"numero": 1, "titre": "Le sel", "duree": "2:34", "objectif": "2:00", "aEconomiserSecondes": 34},
  "plans": [
    {"ref": "P01", "scene": "Le port à l'aube", "titre": "Plan large du port, brume", "dureeSecondes": 10, "etat": "brouillon"},
    {"ref": "P02", "scene": "Le port à l'aube", "titre": "Les filets sur le quai", "dureeSecondes": 9, "etat": "fiche"},
    {"ref": "P03", "scene": "Le port à l'aube", "titre": "Maya traverse le quai", "dureeSecondes": 10, "etat": "fiche"},
    {"ref": "P04", "scene": "Le port à l'aube", "titre": "Gros plan : ses mains serrent la lettre", "dureeSecondes": 8, "etat": "rendu"},
    {"ref": "P05", "scene": "Le port à l'aube", "titre": "Mouettes dans le ciel", "dureeSecondes": 8, "etat": "brouillon"},
    {"ref": "P06", "scene": "La lettre", "titre": "Maya s'assoit sur la caisse de sel", "dureeSecondes": 14, "etat": "fiche"},
    {"ref": "P07", "scene": "La lettre", "titre": "Maya lit la lettre", "dureeSecondes": 15, "etat": "rendu", "repliques": ["R01"]},
    {"ref": "P08", "scene": "La lettre", "titre": "Insert : l'écriture sur le papier", "dureeSecondes": 8, "etat": "brouillon"},
    {"ref": "P09", "scene": "La lettre", "titre": "Le vieux pêcheur l'observe", "dureeSecondes": 12, "etat": "fiche"},
    {"ref": "P10", "scene": "La lettre", "titre": "Plan de coupe : la mer", "dureeSecondes": 10, "etat": "brouillon"}
  ],
  "decisions": [],
  "pistesEnAttente": [],
  "message": "Je trouve l'épisode trop long, et la scène 1 traîne."
}
```

The user gives a **feeling**, not an action: no decision, **three different options**, each already prepared. None cuts the rendered plan P04.

```json
{
  "decisions": [],
  "retirer": [],
  "pistes": [
    {
      "titre": "Couper quatre plans d'ambiance",
      "resume": "Les mouettes, les filets, l'insert de l'écriture et la mer ne disent rien que les autres plans ne disent déjà.",
      "operations": [
        {"type": "couper_plan", "plan": "P05"},
        {"type": "couper_plan", "plan": "P10"},
        {"type": "couper_plan", "plan": "P02"},
        {"type": "couper_plan", "plan": "P08"}
      ]
    },
    {
      "titre": "Resserrer les plans les plus longs",
      "resume": "Aucun plan ne disparaît : on resserre les plus longs.",
      "operations": [
        {"type": "duree_plan", "plan": "P06", "secondes": 12},
        {"type": "duree_plan", "plan": "P07", "secondes": 13},
        {"type": "duree_plan", "plan": "P09", "secondes": 10}
      ]
    },
    {
      "titre": "Accélérer la scène 1",
      "resume": "Le port s'établit vite : chaque plan de la scène est resserré, sans rien couper.",
      "operations": [
        {"type": "duree_plan", "plan": "P01", "secondes": 6},
        {"type": "duree_plan", "plan": "P02", "secondes": 6},
        {"type": "duree_plan", "plan": "P03", "secondes": 7},
        {"type": "duree_plan", "plan": "P05", "secondes": 5}
      ]
    }
  ],
  "retenirPistes": [],
  "narratif": []
}
```
