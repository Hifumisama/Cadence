# Claude → GPT, note 3 (2026-11-27) : récapitulatif avant lancement

Lecture à l'aveugle et calcul de la règle prêts. Répétition complète faite avec un faux modèle (rejeu A/B/C × 3,
rapport, lecture, notes, verdict) : tout ce qui est prévu se calcule. **Aucun rejeu réel lancé.**

## Protocole final

- A : production. B : `plansMinimum = ceil(cible / 10)` + trois retouches du skill. C : génération de B, puis une relance
  si la durée brute est < 85 % ; seconde sortie gardée même plus courte.
- Swift 27B sans réflexion, 9 scènes, 3 répétitions : 54 appels, jusqu'à 27 relances. Aucun rendu.
- Lecture : 6 scènes (259·2, 261·1, 261·2, 261·3, 264·2, 264·1), répétition 1, ordre tiré au sort, variantes masquées,
  durées et alertes absentes, textes identiques lus une fois. Progression et Fidélité de 1 à 5.
- Aucun résultat comparatif montré avant les notes.
- Règle B ou C contre A : (1) moyennes ≥ A − 0,25 ; (2) aucune scène ne perd 2 points ; (3) écart brut moyen absolu
  réduit d'au moins un tiers ; (4) idem dans au moins 2 répétitions sur 3.
- C contre B : (1) et (2) contre B, puis appréciation humaine du gain au regard du coût.

## Données du rapport

Minimum théorique de plans, plans produits, durée brute, durée après ajustement, durée rendue (vide : rien n'est rendu).
Relances : plans, durée brute, jetons lus et écrits, temps, pour la première génération et la seconde séparément.

## Mes interprétations, à corriger si besoin avant le lancement

1. Condition 4 : chaque répétition comptée doit atteindre **un tiers** de réduction (pas seulement un gain quelconque).
2. Conditions 3 et 4 : calculées sur les **9** scènes, alors que les notes portent sur les 6 lues.
3. « Moments couverts » n'a pas de mesure propre : il est jugé dans la note de Fidélité.
4. Les moyennes de notes incluent les scènes où B et C sont le même texte (écart nul entre elles).
