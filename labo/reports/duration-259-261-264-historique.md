# Jeu « duration-259-261-264 » : les appels historiques

Exporté le 2026-11-27 (commit 71fde4e). 9 scènes, aucun appel au modèle.
Versions du prompt rencontrées : 5d17784d, ffb76ae6, 559bdb8d. Appels avec réflexion : 0/9.

**Les scènes ne sont pas comparables entre versions du prompt** : ce tableau décrit le passé, il ne compare pas de variantes.

## Durées (sortie du modèle, puis code actuel)

| Scène | Prompt | Cible | Moments | Plans | Max atteignable | Brut | Après code | Ajouté par le code | Écart final |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 259 · 1 | 5d17784d | 28 | – | 3 | 30 | 28 | 28 | 0 | 0 % |
| 259 · 2 | 5d17784d | 52 | – | 4 | **40** | 40 | 40 | 0 | -23 % |
| 259 · 3 | 5d17784d | 40 | – | 4 | 40 | 32 | 40 | +8 | 0 % |
| 261 · 1 | ffb76ae6 | 31 | 5 | 3 | **30** | 29 | 30 | +1 | -3 % |
| 261 · 2 | ffb76ae6 | 40 | 3 | 3 | **30** | 30 | 30 | 0 | -25 % |
| 261 · 3 | ffb76ae6 | 49 | 4 | 4 | **40** | 40 | 40 | 0 | -18 % |
| 264 · 1 | 559bdb8d | 15 | 2 | 2 | 20 | 15 | 15 | 0 | 0 % |
| 264 · 2 | 559bdb8d | 47 | 4 | 4 | **40** | 35 | 40 | +5 | -15 % |
| 264 · 3 | 559bdb8d | 58 | 7 | 6 | 60 | 45 | 58 | +13 | 0 % |

- Cible inatteignable (max atteignable en gras) : **5/9** scènes.
- Total : 360 s visées, 294 s écrites par le modèle, 321 s après ajustement (+27 s ajoutées par le code).
- « Après code » est recalculé avec la règle actuelle (`ajusterDureesScene`) ; la valeur appliquée à l'époque peut différer.

## Texte

| Scène | Mots de récit | Mots/s (brut) | Mots/s (final) | Répliques | Immobiles | Vides | Doublons | Gestes répétés | Renvoi |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 259 · 1 | 412 | 14.71 | 14.71 | 0 | P3 | – | – | – | 0 |
| 259 · 2 | 609 | 15.23 | 15.23 | 0 | P2 P3 P4 | – | P3+P4 | – | 0 |
| 259 · 3 | 593 | 18.53 | 14.83 | 0 | – | P3 P4 | – | – | 0 |
| 261 · 1 | 423 | 14.59 | 14.1 | 0 | – | – | – | – | 0 |
| 261 · 2 | 254 | 8.47 | 8.47 | 0 | – | – | – | – | 0 |
| 261 · 3 | 566 | 14.15 | 14.15 | 0 | – | – | P1+P2 P2+P3 P3+P4 | P1+P2 | 1 |
| 264 · 1 | 339 | 22.6 | 22.6 | 0 | – | – | – | – | 0 |
| 264 · 2 | 376 | 10.74 | 9.4 | 0 | – | – | – | – | 1 |
| 264 · 3 | 611 | 13.58 | 10.53 | 1 | – | P6 | – | – | 1 |

## En base aujourd'hui (après relecture et retouches à la main)

| Scène | Titre en base | Plans produits → stockés | Durée stockée | Durée mesurée des rendus | Corrections de relecture |
| --- | --- | --- | --- | --- | --- |
| 259 · 1 | La Danseuse de Feu Rouge | 3 → 3 | 28 | 26.4 | – |
| 259 · 2 | La Bascule Infernale | 4 → 3 | 30 | 28.6 | P07 couper_plan (doublon) |
| 259 · 3 | L'Explosion de Cendres | 4 → 4 | 40 | 37.8 | P08 modifier_plan (motif) |
| 261 · 1 | La Valse du Cempasúchil | 3 → 3 | 29 | 29.7 | – |
| 261 · 2 | La Bascule du Vert | 3 → 3 | 30 | 27.6 | – |
| 261 · 3 | Le Piège de Cendres | 4 → 4 | 40 | 36.8 | P08 modifier_plan (doublon) P09 modifier_plan (doublon) P10 modifier_plan (doublon) |
| 264 · 1 | Pied à terre sur l'île | 2 → 2 | 15 | 15.3 | – |
| 264 · 2 | La découverte de la falaise | 4 → 4 | 40 | 38.7 | – |
| 264 · 3 | L'horizon et la fresque | 6 → 6 | 58 | 57.5 | P09 modifier_plan (motif) |

La durée mesurée est celle du dernier rendu réussi de chaque plan stocké ; « – » si un plan n'en a pas.

## Durée demandée et durée du fichier, selon la liaison

| Liaison | Plans rendus | Demandé (moyenne, s) | Mesuré (moyenne, s) | Écart moyen (s) |
| --- | --- | --- | --- | --- |
| coupe | 14 | 9.5 | 9.67 | 0.17 |
| suite | 18 | 9.83 | 9.05 | -0.78 |

## Ce que ces mesures ne disent pas

- Aucune ne dit qu'une scène est bonne : ce sont des comptes et des heuristiques sur le texte français.
- « Immobile », « vide », « doublon » et « gestes répétés » sont les détecteurs de production, réglés pour la précision : un zéro ne prouve pas l'absence du défaut.
- La progression narrative et le remplissage se jugent à la lecture.
- Les mots par seconde mesurent une quantité de texte, pas une quantité d'histoire.
