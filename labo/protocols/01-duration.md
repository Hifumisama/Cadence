# Campagne 01 : durée et densité de `scenario-scene`

Écrit le 2026-11-27, **avant** tout rejeu. Arbitrages de GPT ; ce qui est marqué « à valider » ne l'est pas encore.

## Question

Planifier le nombre de plans depuis la durée cible (B), puis relancer une fois si c'est trop court (C), réduit-il
l'écart de durée **sans** remplissage, répétition ni événement inventé ?

Principe : une scène plus courte et intéressante bat une scène plus longue et ennuyeuse.

## Variantes

| | Prompt | Entrée | Relance |
|---|---|---|---|
| A | production | celle du jeu | – |
| B | production + 3 remplacements | + `planification.plansMinimum` = cible ÷ 10, arrondi au-dessus | – |
| C | comme B | comme B | une, si durée brute < 85 % de la cible |

C part de la génération de B (même appel, pas un nouveau) : l'écart B → C mesure la relance seule. Les deux sorties
sont gardées. Le texte exact des remplacements et du message est dans `src/variants.ts`, et le prompt exact de chaque
essai dans `runs/<essai>/variants/`.

`traitement-episode` et les autres règles narratives ne changent pas.

## Réglages

- Modèle : Swift 27B, comme Cadence, **sans réflexion** (la réflexion fera l'objet d'un essai séparé).
- 9 scènes (projets 259, 261, 264), 3 répétitions : 54 appels pour A et B, jusqu'à 27 relances pour C.
- Aucun rendu image ou vidéo.

```bash
npm run labo -- run duration-259-261-264 --variants A,B,C --reps 3 --launch
```

## Mesures automatiques

Principale : **écart de la durée brute à la cible**. Avec : nombre de plans, scènes sous 85 %, doublons, gestes
répétés, plans immobiles ou vides, inventions déclarées, relances, temps de modèle, étendue entre répétitions.

Pas automatiques : moments couverts, progression, action nouvelle par plan, remplissage. Les écarts avec la durée
stockée et rendue n'existent que pour l'historique, un rejeu ne rendant rien.

## Lecture à l'aveugle

Par scène et par version, de 1 à 5, plus un commentaire facultatif :

1. **Progression** : chaque plan apporte-t-il quelque chose de nouveau à la scène ?
2. **Fidélité** : la scène respecte-t-elle les moments, les intentions et le sens du scénario, sans remplissage inventé ?

Une répétition lue. Quand C n'a pas relancé, B et C sont le même texte : lu une fois.

Scènes lues (**à valider**, pour tenir en une séance d'environ 45 minutes) : les cinq où la cible était inatteignable
dans l'historique (259·2, 261·1, 261·2, 261·3, 264·2) et un témoin court (264·1).

## Critères fixés avant lancement

| Critère | Ce qu'on recherche |
|---|---|
| Durée | moins d'écart entre cible et durée brute |
| Progression | pas de répétition ni de remplissage |
| Fidélité | aucun événement artificiellement ajouté |
| Stabilité | résultats cohérents entre répétitions |

Une variante ne gagne pas parce qu'elle produit plus de secondes.

### Règle de décision (**à valider**)

Une variante est retenue contre A si les quatre sont vrais :

1. Progression et Fidélité moyennes au moins égales à celles de A, à 0,25 point près ;
2. aucune scène lue ne perd 2 points ou plus sur une des deux notes ;
3. l'écart brut moyen (sans le signe) baisse d'au moins un tiers ;
4. ce gain d'écart se retrouve dans au moins 2 répétitions sur 3.

C est préférée à B seulement si elle passe aussi les points 1 et 2 contre B.

## Limites

Échantillon exploratoire, pas une preuve : un auteur, un modèle, trois films, un seul lecteur qui connaît les projets.
Voir aussi « Limites et biais » du [README](../README.md).
