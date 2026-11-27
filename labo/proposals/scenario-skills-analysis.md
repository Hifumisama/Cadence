# Analyse des skills de scénario

2026-11-27, sur les skills de production (identiques sur `main`). Rien n'est modifié. Chiffres : campagne 01, sans
réflexion.

## 1. Le constat principal : le contrôle réinjecte les règles de mouvement

Après la première réponse, le code relance le modèle s'il détecte un défaut (`controleurPourSkill`,
`lib/llm/checks.ts`).

- **A : 15 réponses relancées sur 27. B : 18 sur 27.** Toutes pour le mouvement ou les répétitions (gestes répétés,
  personnage immobile, plan vide, phrases partagées) ; aucune pour la structure, la liaison ou le temps fort.
- Le détecteur de « gestes répétés » compte des mots comme « ondule » ou « se balancent » **sans regarder qui bouge**.
- Le message de renvoi dicte des gestes : « un saut, une glissade au sol, un pied frappé, une cambrure, un coup de
  jambe ». Il commence aussi par « Ta réponse ne respecte pas le schéma de sortie », ce qui est faux ici.

**Cas vérifié, 261·1, B, répétition 1** (le texte qui a bloqué C) :

1. La première réponse avait un plan consacré au moment demandé, et ni saut ni cambrure.
2. Les trois alertes reposaient sur des vêtements et des cheveux qui « ondulent » ou « se balancent ».
3. Après le renvoi, ce plan a été remplacé par un autre geste de la liste du message, et le texte a gagné les autres. Il
   justifie ces gestes dans le récit, avec les mots du message.
4. L'auteur a noté ce texte 2 en fidélité, contre 4 pour A (dont le texte sortait lui aussi d'un renvoi).

Le verdict de la campagne 01 reste celui de la règle (il juge ce que la production garde). Mais **on ne peut pas
attribuer cette perte au prompt de B et C seul**, et rien ne dit comment la première réponse aurait été notée. Le
modèle ajoute aussi des gestes sans renvoi (un saut sur A, répétition 3). Sur A et B, 28 paires ont été
signalées au premier appel, dont 14 sur la seule famille « ondulation » (je n'ai pas compté les faux positifs).

## 2. Indispensable (le code ou l'étape suivante en dépend)

| Règle | Qui en dépend |
|---|---|
| Schéma de sortie ; plans de 4 à 10 s entières | exécuteur, durées |
| Un récit dans chaque description ; pas de ligne « État en fin de plan » | renvoi ; Open H3 IR refuse un plan sans récit |
| Répliques `NOM : « texte »`, une par ligne, mot pour mot, noms du registre | découpées par le code (`lib/h3ir/brief.ts`) |
| « Consigne de l'auteur : … » | lue par la traduction |
| Chaque description se suffit, sans renvoi à un autre plan | plans déplaçables, traduits un par un |
| `liaison`, dont celle du premier plan | rendu en continuité ; renvoi |
| Un seul `tempsFort` | renvoi ; créativité maximale au rendu |
| Moments montrés, aucun événement ajouté, entrée et sortie de scène | l'auteur, les scènes voisines |

**Tout le récit part vers la vidéo** : il est traduit « sans rien ajouter ni retirer ». Une phrase de commentaire arrive
donc dans le prompt vidéo.

## 3. Contradictions et tiraillements

| D'un côté | De l'autre |
|---|---|
| « Separate on a change of place or time » | montage : « Several places group into ONE plan » |
| « group rather than split », « merge them » | « Do not be afraid to cut », « When unsure, coupe » (porte sur la liaison, pousse à couper) |
| « No pose held longer than 2 seconds », pas de plan sans personnage | « A place left to breathe », « a held ending (a victory, a silence) » |
| dire « why the plan exists » | « Never « Ce plan… » », pas de phrase de bilan → **31 plans sur 102** contiennent « Ce plan » |
| « three to six sentences » | six rubriques plus 2 à 4 mouvements par plan → médiane 6 phrases et 126 mots, 36 plans sur 102 dépassent |
| « never spend effort on the arithmetic », le code ajuste « exactly » | le code reste entre 4 et 10 s par plan : 5 cibles sur 9 étaient inatteignables |
| climax toujours en un seul plan rapide | une transformation que l'auteur raconte en plusieurs temps |

## 4. Redondances

- La liste finale « Before you answer » redit presque tout le skill.
- Fin en mouvement avant une `suite`, pas de caméra, montage en un plan, pas d'« État en fin de plan » : trois fois chacun.
- Des règles déjà garanties par le code sont répétées en toutes lettres.
- `scenario-scene` (≈ 4 100 mots) et `scenario-episode` (≈ 3 500) partagent de grands blocs copiés.

## 5. Prescriptions excessives

- **Le mouvement confondu avec la progression** : commencer chaque plan en mouvement, mots interdits, 2 à 4 gestes par
  plan, varier amplitude et niveau à chaque plan. Un silence ou une découverte peut faire avancer l'histoire.
- **Des exemples qui deviennent des consignes** : la liste de gestes (saut, cambrure, glissade…), reprise telle quelle
  par le message de renvoi ; des noms d'un autre projet (Pika, Soom, Mai).
- Durées par `rythme`, regroupements, climax : des recommandations écrites comme des lois.

Ces règles répondent à de **vrais défauts vus au rendu** (plans figés, secondes vides, projets 259 et 261). Les assouplir
peut les faire revenir, et le labo ne juge que du texte.

## 6. Qui devrait faire quoi

| Sujet | Aujourd'hui | Proposition |
|---|---|---|
| Format, liaison du premier plan, temps fort unique | écrit au modèle **et** vérifié | le code vérifie ; le skill le dit une fois |
| Assez de matière pour la durée | rédacteur de scène | traitement et code (calcul du nombre de plans, l'idée de C) |
| Caméra, découpage interne, intensité | un peu partout | étape vidéo |
| Défauts de mouvement | skill, renvoi, relecture | **la relecture seule** les signale ; pas de réécriture sur un détecteur de mots |
| État du monde d'un plan à l'autre | rédacteur et relecture | rédacteur dans la scène, relecture entre les scènes |

## 7. Les trois autres skills

- **`traitement-episode`** (≈ 840 mots) : surtout des objectifs, il vieillit bien. Il répartit les durées sans vérifier que
  les moments peuvent les remplir.
- **`scenario-episode`** : dit « give it an intention (a wait, a held tension: say so) » à un plan statique, là où
  `scenario-scene` impose le mouvement. Aucun contrôle d'immobilité à l'écriture.
- **`relecture-scenario`** : le critère `motif` figure deux fois pour deux défauts différents ; l'en-tête parle encore des
  « end-of-plan states » supprimés ; « jamais un geste qui ne sert qu'à remplir » tire contre l'obligation de mouvement.

## 8. Correctifs de production possibles (hors expérience, non faits)

Petits, mais ils changent ce que Cadence génère : à approuver à part.

1. Compter un geste répété seulement quand un personnage le fait (ou ne plus renvoyer sur ce critère).
2. Retirer la liste de gestes du message de renvoi.
3. Ne plus annoncer « ne respecte pas le schéma » pour un défaut de contenu.
