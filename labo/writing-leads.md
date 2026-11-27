# Pistes d'écriture de `scenario-scene`

Relevées le 2026-11-27 après la campagne 01 (sans réflexion). **Aucun prompt n'est modifié** : on mesure d'abord l'effet
de la réflexion (arbitrage de GPT). Comptes sur 27 appels par version.

| Piste (retour de l'auteur) | Ce qu'on mesure | A | B | C | Le skill de production dit déjà |
|---|---|---|---|---|---|
| Plans « clonés » | paires en doublon (détecteur) | 4 | 10 | 15 | varier les mouvements, jamais une phrase dans deux plans |
| Narration froide et plate | rien | – | – | – | dire pourquoi le plan existe, par un signe visible |
| Caméra dans le scénario | plans contenant « caméra » | 5/102 | 3/109 | 3/120 | aucune caméra, sauf consigne explicite de l'auteur |
| Lumière dans le scénario | rien | – | – | – | la lumière seulement quand elle change |
| Progression peu visible | rien | – | – | – | – |

Les consignes de la dernière colonne sont résumées.

## Phrases méta ou phrases d'état

À distinguer :

- **Inutile** : parler du plan, du spectateur, ou comparer au plan précédent.
- **Utile** (appréciée par l'auteur) : dire en fin de plan où en est l'histoire. Le skill demande déjà la fin comme
  dernier temps, puis « pourquoi ça compte » en une courte proposition.

Repérage grossier par motif, hors consignes de l'auteur :

| Motif | A | B | C |
|---|---|---|---|
| « Ce plan » | **31/102 (30 %)** | 18/109 (17 %) | 26/120 (22 %) |
| « le spectateur » | 12/102 | 9/109 | 11/120 |

- Le skill dit « **Never « Ce plan… »** » : la consigne n'est donc pas suivie, sans réflexion.
- Je n'ai trouvé **aucun contrôle de production qui le signale** : le détecteur d'immobilité écarte ces phrases du récit
  (`PHRASE_META`, `lib/agents/stillness.ts`), sans renvoi. Un contrôle par le code serait possible, à décider à part.
- La distinction utile / inutile ne se mesure pas automatiquement : une phrase qui commence par « Ce plan » peut
  contenir l'information d'état appréciée.

## Autres relevés

Un mot corrompu par un autre alphabet dans une sortie de B ; quelques fautes de langue signalées par le second lecteur.
