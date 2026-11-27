# Campagne 02 : la réflexion de Swift sur `scenario-scene`

Écrit le 2026-11-27, **avant** tout appel. Approche, règle de décision, trois notes et seuil de 3 min validés par GPT ;
plafond à 28 000 jetons, traitement de la relance et relevé mémoire proposés par Claude et approuvés par l'utilisateur.
**À valider avant le pilote.**

## Question

La réflexion, activée dès la première génération, améliore-t-elle assez la construction d'une scène pour justifier son
coût ? La réponse juge la construction des scènes, pas la progression de l'épisode.

## Versions

| | `enable_thinking` | `reasoning_effort` | Plafond de sortie |
|---|---|---|---|
| T0 | `false` | `"xhigh"` | 28 000 |
| T1 | `true` | `"xhigh"` | 28 000 |

- Seul `enable_thinking` diffère : même prompt (vérifié par son empreinte), même entrée, même température (celle du
  serveur, 1,0), même délai maximal (10 min), même contrôle de production avec son unique renvoi.
- **Base** : la variante retenue par la [campagne 01](01-duration.md) (A, B ou C), passée par `--base`.
- Si la base est C, la relance de durée fait partie de T0 **et** de T1 : chaque version relance sa propre scène trop
  courte, et ce temps compte.
- T0 n'est donc pas exactement la production : plafond à 28 000 au lieu de 16 384, effort nommé (sans effet quand la
  réflexion est coupée).

## Contexte du serveur : 45 056 jetons, un seul slot

Une réponse au plafond demande 28 000 jetons : il en reste **17 056** pour la demande. Estimations (nombre de
caractères, calé sur un seul appel mesuré : 9 362 jetons) :

| Demande | Jetons envoyés | Marge au plafond |
|---|---|---|
| Première génération, 9 scènes | 8 850 à 10 400 | au moins 6 600 |
| Renvoi de production | jusqu'à ≈ 14 000 (réponse précédente et alertes) | ≈ 3 000 |
| Relance de durée (base C) | jusqu'à ≈ 14 000 | ≈ 3 000 |
| Relance puis son renvoi (base C) | jusqu'à ≈ 17 200 | **nulle** |

La réflexion d'un tour précédent n'est pas renvoyée. Dans le dernier cas, il reste environ 27 800 jetons réellement
disponibles, près du double du plus gros appel avec réflexion jamais tracé (14 325). Toute coupure est détectée et
compte contre T1. Le pilote mesure les vraies marges.

## Pilote

- 3 scènes, T1 seul, 1 répétition : entrée la plus courte (259·1), médiane (264·2), la plus longue (261·2).
- **Sorties exclues de l'évaluation**, non lues, cachées de la page du labo ; `read` et `score` les refusent.
- Bloquant : sortie hors schéma ou en échec, défaut de structure (description sans récit, « État en fin de plan »),
  troncature, plus de 10 min.
- Relevé : durée, jetons, marge de contexte, mémoire, alertes de production (pour information).

```bash
npm run labo -- run duration-259-261-264 --campaign 02 --base <A|B|C> --pilot --launch
```

## Campagne

- 9 scènes × 3 répétitions × T0 et T1 : 54 appels, plus renvois, et relances si la base est C.
- Versions alternées scène par scène ; celle qui passe la première change à chaque fois (la seconde profite du prompt
  gardé en cache par le serveur).
- GPU libre : aucun rendu, file de Cadence vide.

```bash
npm run labo -- run duration-259-261-264 --campaign 02 --base <A|B|C> --launch
npm run labo -- read labo/runs/<essai>
npm run labo -- score labo/runs/<essai> --votes <fichier>
```

Avant les notes : aucun rapport comparatif, essai masqué dans la page, aucun résultat commenté.

## Ce qui est capturé à chaque appel

| Donnée | Origine |
|---|---|
| Jetons lus et écrits (réflexion comprise), motif d'arrêt, modèle servi | serveur |
| Temps de lecture et d'écriture, cache, brouillons MTP | serveur (`timings` de llama.cpp), s'il les renvoie |
| Durée de l'appel, temps des appels en échec, renvois, code d'erreur | labo |
| Jetons de réflexion | découpeur du modèle sur le texte gardé (compte exact de ce texte, balises exclues) ; sinon **estimation** par la part des caractères. La méthode est notée à côté de chaque valeur ; au-delà de 100 000 caractères gardés, le compte est un minimum |
| Pics de VRAM et de RAM | **plus haut niveau observé** par relevés de ComfyUI chaque seconde environ : un pic bref peut échapper, et la VRAM compte tout ce qui occupe la carte |

Une sonde en panne n'interrompt rien : la valeur manque, c'est tout.

## Lecture à l'aveugle

Les 6 scènes de la campagne 01 (259·2, 261·1, 261·2, 261·3, 264·1, 264·2), première répétition où les deux versions ont
une sortie, soit 12 textes en ordre tiré au sort. Ni version, ni durée, ni alerte, **ni réflexion**. Trois notes de 1 à
5, commentaire facultatif :

1. **Progression** : chaque plan apporte-t-il du nouveau ?
2. **Fidélité** : les moments et les intentions sont-ils respectés, sans remplissage ?
3. **Cohérence** : les plans s'enchaînent-ils sans se contredire ?

## Règle de décision

Appliquée par `src/score-reasoning.ts`, seuils dans `src/campaign.ts`. La réflexion devient le fonctionnement normal de
`scenario-scene` si les six sont vrais :

1. au moins une note moyenne de T1 dépasse celle de T0 de 0,5 point ;
2. aucune note moyenne ne baisse de plus de 0,25 ;
3. aucune scène lue ne perd 2 points ou plus sur une note ;
4. T1 n'a pas plus d'échecs techniques que T0 ;
5. aucune sortie de T1 n'est tronquée ;
6. le temps médian par scène de T1 est inférieur ou égal à 180 s.

Définitions :

- **Échec technique** : un enregistrement (scène, version, répétition) qui finit sur une erreur : sortie hors schéma
  après le renvoi, délai de 10 min dépassé, flux coupé, erreur du serveur, relance en échec.
- **Panne** : serveur injoignable. Elle n'est imputée à aucune version ; la paire est écartée des échecs et des temps,
  et signalée.
- **Tronquée** : au moins une réponse de l'enregistrement, renvoi compris, arrêtée sur la longueur (plafond ou contexte),
  même si le renvoi a rattrapé.
- **Temps par scène** : somme des appels de l'enregistrement, renvois, relance et appels en échec compris. Médiane sur
  toutes les scènes et répétitions.
- Un essai incomplet est non concluant.

Rien n'est appliqué en production par cette campagne : adopter la réflexion serait une décision séparée
(`LLM_CORPS_SCENARIO_SCENE` et `LLM_MAX_TOKENS_SCENARIO_SCENE`, sur chaque machine).

## Coût estimé (incertain avant le pilote)

Pilote : environ 6 min. Campagne : environ 10 min pour T0, 40 à 80 min pour T1, davantage si la base est C. Lecture :
environ 30 min.

## Limites

Exploratoire : 12 textes, un seul lecteur qui les connaîtra déjà par la campagne 01. Température 1,0, forte
variabilité ; un écart de moins de 0,5 point est du bruit. Un texte plus long peut trahir sa version.
