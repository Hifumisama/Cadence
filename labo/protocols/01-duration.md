# Campagne 01 : durée et densité de `scenario-scene`

Écrit le 2026-11-27, **avant** tout rejeu. Variantes, règle de décision, grille de lecture et scènes lues validées par GPT
le même jour. Reste à donner : la confirmation de lancement.

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
sont gardées, la seconde même si elle est plus courte. Le texte exact des remplacements et du message est dans
`src/variants.ts`, et le prompt exact de chaque essai dans `runs/<essai>/variants/`.

`traitement-episode`, les plages de rythme et les autres règles narratives ne changent pas.

## Réglages

- Modèle : Swift 27B, comme Cadence, **sans réflexion** (la réflexion fera l'objet d'un essai séparé).
- 9 scènes (projets 259, 261, 264), 3 répétitions : 54 appels pour A et B, jusqu'à 27 relances pour C.
- Aucun rendu image ou vidéo.

## Déroulé

1. GPU libre (aucun rendu, file de Cadence vide), labo commité.
2. `npm run labo -- run duration-259-261-264 --variants A,B,C --reps 3 --launch`
3. `npm run labo -- read labo/runs/<essai>` : prépare `reading/reading.html`.
4. **Avant d'avoir noté** : n'ouvrir ni les fichiers de l'essai, ni `compare`, et ne commenter aucun résultat. Le
   rejeu n'écrit pas de rapport comparatif, la page du labo masque l'essai.
5. Lecture, puis « Télécharger mes notes ».
6. `npm run labo -- score labo/runs/<essai> --votes <fichier>` : écrit `report.md` et `verdict.md`.

## Mesures automatiques

Principale : **écart de la durée brute à la cible**. Par variante et par scène : minimum théorique de plans, plans
produits, durée brute, durée après ajustement (durée rendue : sans objet, rien n'est rendu), scènes sous 85 %,
doublons, gestes répétés, plans immobiles ou vides, inventions déclarées, sorties tronquées, jetons, temps de modèle,
étendue entre répétitions. Pour C : chaque relance avec la première génération et la seconde côte à côte (plans, durée
brute, jetons, temps).

Pas automatiques : moments couverts, progression, action nouvelle par plan, remplissage. Ils passent par les deux notes.
Les écarts avec la durée stockée et rendue n'existent que pour l'historique.

## Lecture à l'aveugle

- Six scènes : les cinq où la cible était inatteignable dans l'historique (259·2, 261·1, 261·2, 261·3, 264·2) et un
  témoin court (264·1).
- Une répétition : la première (la suivante seulement si une version y a échoué).
- Versions dans un ordre tiré au sort, sans variante, durée, alerte, notes ni inventions. La correspondance est dans
  `reading/key.json`, absente de la page. Deux textes identiques (C sans relance) sont lus une fois.
- Deux notes de 1 à 5, commentaire facultatif :
  1. **Progression** : chaque plan apporte-t-il du nouveau à la scène ?
  2. **Fidélité** : les moments et les intentions sont-ils respectés, sans remplissage inventé ?

## Règle de décision

Appliquée par `src/score.ts`, seuils dans `src/campaign.ts`. Une variante est retenue contre A si les quatre sont vrais :

1. Progression et Fidélité moyennes au moins égales à celles de A, à 0,25 point près ;
2. aucune scène lue ne perd 2 points ou plus sur une des deux notes ;
3. l'écart brut moyen (sans le signe) baisse d'au moins un tiers, sur les 9 scènes et 3 répétitions, en ne comparant
   que les paires où les deux versions ont une sortie ;
4. cette baisse d'au moins un tiers se retrouve dans au moins 2 répétitions sur 3.

C contre B : les points 1 et 2 contre B, puis une appréciation humaine du gain de notes au regard du coût des relances.

Une variante ne gagne pas parce qu'elle produit plus de secondes.

## Limites

Règle exploratoire, pas une preuve statistique : un auteur, un modèle, trois films, un seul lecteur qui connaît les
projets. La longueur d'un texte peut trahir sa variante. Les scènes lues sont surtout celles où la planification change
le plus, avec un seul témoin. Voir aussi « Limites et biais » du [README](../README.md).
